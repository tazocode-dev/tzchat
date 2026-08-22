require('module-alias/register');

const { after, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const multer = require('multer');
const sharp = require('sharp');

const {
  MAX_IMAGE_INPUT_PIXELS,
  SHARP_INPUT_OPTIONS,
  ImageUploadError,
  assertPrivateTempRoot,
  buildChatDestination,
  createPrivateTempStorage,
  getUploadTempRoot,
  inspectImageFile,
  mapUploadMiddlewareError,
  processChatImageUpload,
  validateChatRoomId,
  validateDeclaredImage,
  wrapUploadMiddleware,
} = require('../src/services/media/imageUploadSecurityService');
const { createVariantsAndSave } = require('../src/services/public/imageWriteService');
const { validateChatImagePathForDb } = require('../src/services/chat/chatMessageService');

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tzchat-image-security-'));
const roomId = '64b000000000000000000004';

after(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
});

async function makePng(filename, width = 3, height = 2) {
  const filePath = path.join(testRoot, filename);
  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 10, g: 80, b: 160, alpha: 0.5 },
    },
  }).png().toFile(filePath);
  return filePath;
}

function uploadedFile(filePath, originalname = 'photo.png', mimetype = 'image/png') {
  return { path: filePath, originalname, mimetype };
}

function listFilesRecursively(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? listFilesRecursively(target) : [target];
  });
}

function multipartRequest(files, fieldName) {
  const boundary = `tzchat-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const chunks = [];
  for (const file of files) {
    chunks.push(Buffer.from(
      `--${boundary}\r\n`
      + `Content-Disposition: form-data; name="${fieldName}"; filename="${file.name}"\r\n`
      + `Content-Type: ${file.type}\r\n\r\n`
    ));
    chunks.push(file.data);
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(chunks);
  const request = Readable.from([body]);
  request.headers = {
    'content-type': `multipart/form-data; boundary=${boundary}`,
    'content-length': String(body.length),
  };
  request.method = 'POST';
  request.url = '/upload';
  return request;
}

function runUploadHandler(handler, request) {
  return new Promise((resolve, reject) => {
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ status: this.statusCode, body }); return this; },
    };
    handler(request, response, (error) => {
      if (error) reject(error);
      else resolve({ status: 204, body: null });
    });
  });
}

test('JPEG/PNG/WebP의 정확한 MIME·확장자 조합만 허용한다', () => {
  assert.equal(validateDeclaredImage(uploadedFile('/tmp/a', 'a.jpg', 'image/jpeg')).format, 'jpeg');
  assert.equal(validateDeclaredImage(uploadedFile('/tmp/a', 'a.jpeg', 'image/jpeg')).format, 'jpeg');
  assert.equal(validateDeclaredImage(uploadedFile('/tmp/a', 'a.png', 'image/png')).format, 'png');
  assert.equal(validateDeclaredImage(uploadedFile('/tmp/a', 'a.webp', 'image/webp')).format, 'webp');

  for (const file of [
    uploadedFile('/tmp/a', 'a.gif', 'image/gif'),
    uploadedFile('/tmp/a', 'a.svg', 'image/svg+xml'),
    uploadedFile('/tmp/a', 'a.exe', 'image/jpeg'),
    uploadedFile('/tmp/a', 'a.png', 'image/jpeg'),
    uploadedFile('/tmp/a', 'a.jpg', 'image/jpeg; charset=binary'),
  ]) {
    assert.throws(
      () => validateDeclaredImage(file),
      error => error instanceof ImageUploadError && error.status === 415
    );
  }
});

test('Sharp 실제 디코딩 형식이 선언 MIME과 다르면 확장자 위장 파일을 거부한다', async () => {
  const pngPath = await makePng('disguised.upload');
  await assert.rejects(
    inspectImageFile(uploadedFile(pngPath, 'disguised.jpg', 'image/jpeg')),
    error => error instanceof ImageUploadError && error.code === 'IMAGE_CONTENT_MISMATCH'
  );
});

test('Sharp 입력은 오류 엄격 처리와 픽셀 상한을 항상 사용한다', async () => {
  let receivedOptions;
  const sharpFactory = (_filePath, options) => {
    receivedOptions = options;
    return {
      async metadata() {
        return { format: 'png', width: 1, height: 1, pages: 1 };
      },
    };
  };
  await inspectImageFile(uploadedFile('/tmp/safe.upload'), { sharpFactory });
  assert.deepEqual(receivedOptions, SHARP_INPUT_OPTIONS);
  assert.equal(SHARP_INPUT_OPTIONS.failOnError, true);
  assert.equal(SHARP_INPUT_OPTIONS.limitInputPixels, MAX_IMAGE_INPUT_PIXELS);
  assert.equal(MAX_IMAGE_INPUT_PIXELS, 40_000_000);
});

test('임시 저장 파일명은 원본 확장자를 사용하지 않고 안전한 .upload 이름만 만든다', async () => {
  const storage = createPrivateTempStorage('chat');
  const filename = await new Promise((resolve, reject) => {
    storage.getFilename({}, { originalname: 'payload.jpg.svg' }, (error, value) => {
      if (error) reject(error);
      else resolve(value);
    });
  });
  assert.match(filename, /^[a-f0-9]{32}\.upload$/);
  assert.equal(filename.includes('.svg'), false);
  assert.throws(
    () => assertPrivateTempRoot('/srv/tzchat/uploads/.tmp', '/srv/tzchat/uploads'),
    error => error.code === 'UPLOAD_TEMP_NOT_PRIVATE' && error.status === 500
  );
});

test('채팅 roomId와 최종 경로는 traversal 없이 고정된 업로드 루트 안에서만 생성된다', () => {
  for (const invalid of ['', 'misc', '../escape', `${roomId}/../../escape`, `${roomId}%2fescape`]) {
    assert.throws(() => validateChatRoomId(invalid), error => error.code === 'INVALID_UPLOAD_PATH');
  }

  const result = buildChatDestination(roomId, new Date(2026, 7, 20), testRoot);
  assert.equal(result.destination, path.join(testRoot, 'chat', '2026', '08', '20', roomId));
  assert.equal(result.destination.startsWith(path.resolve(testRoot) + path.sep), true);
});

test('채팅 업로드는 실제 PNG를 안전한 JPEG로 재인코딩하고 relativePath 계약을 유지한다', async () => {
  const inputPath = await makePng('chat-success.upload');
  const id = 'a'.repeat(32);
  const result = await processChatImageUpload({
    file: uploadedFile(inputPath),
    roomId,
    now: new Date(2026, 7, 20),
  }, { uploadRoot: testRoot, id });

  assert.equal(fs.existsSync(inputPath), false);
  assert.equal(
    result.relativePath,
    `/uploads/chat/2026/08/20/${roomId}/${id}.jpg`
  );
  assert.equal(validateChatImagePathForDb(result.relativePath, roomId), result.relativePath);
  const metadata = await sharp(result.finalAbsPath, SHARP_INPUT_OPTIONS).metadata();
  assert.equal(metadata.format, 'jpeg');
  assert.equal(metadata.width, 3);
  assert.equal(metadata.height, 2);
});

test('채팅 Sharp 처리 실패 시 임시 파일과 부분 생성 결과를 모두 삭제한다', async () => {
  const inputPath = path.join(testRoot, 'chat-failure.upload');
  fs.writeFileSync(inputPath, 'fake image bytes');
  let call = 0;
  const sharpFactory = () => {
    call += 1;
    if (call === 1) {
      return {
        async metadata() {
          return { format: 'png', width: 2, height: 2, pages: 1 };
        },
      };
    }
    return {
      rotate() { return this; },
      resize() { return this; },
      flatten() { return this; },
      jpeg() { return this; },
      async toFile(target) {
        fs.writeFileSync(target, 'partial');
        throw new Error('encoder failed');
      },
    };
  };

  await assert.rejects(
    processChatImageUpload({
      file: uploadedFile(inputPath),
      roomId,
      now: new Date(2026, 7, 21),
    }, { uploadRoot: testRoot, id: 'b'.repeat(32), sharpFactory }),
    error => error instanceof ImageUploadError && error.code === 'IMAGE_PROCESSING_FAILED'
  );
  assert.equal(fs.existsSync(inputPath), false);
  assert.equal(
    listFilesRecursively(path.join(testRoot, 'chat', '2026', '08', '21')).length,
    0
  );
});

test('프로필 변형도 실제 PNG를 메타데이터 없는 JPEG 3종으로 재인코딩한다', async () => {
  const inputPath = await makePng('profile-source.upload', 8, 10);
  const outputBase = path.join(testRoot, 'profile-safe');
  const variants = await createVariantsAndSave(inputPath, outputBase, 0.8);

  assert.deepEqual(Object.keys(variants).sort(), ['full', 'medium', 'thumb']);
  for (const outputPath of Object.values(variants)) {
    const metadata = await sharp(outputPath, SHARP_INPUT_OPTIONS).metadata();
    assert.equal(metadata.format, 'jpeg');
    assert.equal(metadata.width / metadata.height, 0.8);
    assert.equal(metadata.exif, undefined);
  }
  fs.unlinkSync(inputPath);
});

test('Multer 크기·개수 및 형식 오류는 400 계열 JSON으로 변환한다', () => {
  const tooLarge = mapUploadMiddlewareError(new multer.MulterError('LIMIT_FILE_SIZE'));
  const tooMany = mapUploadMiddlewareError(new multer.MulterError('LIMIT_FILE_COUNT'));
  assert.deepEqual(tooLarge, {
    status: 413,
    code: 'IMAGE_TOO_LARGE',
    message: '이미지 파일은 10MB 이하만 업로드할 수 있습니다.',
  });
  assert.equal(tooMany.status, 400);

  const wrapped = wrapUploadMiddleware((_req, _res, callback) => callback(
    new ImageUploadError(415, '지원하지 않는 이미지입니다.', 'UNSUPPORTED_IMAGE_TYPE')
  ));
  const response = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  wrapped({}, response, () => assert.fail('next가 호출되면 안 됩니다.'));
  assert.equal(response.statusCode, 415);
  assert.deepEqual(response.body, {
    code: 'UNSUPPORTED_IMAGE_TYPE',
    message: '지원하지 않는 이미지입니다.',
  });
});

test('실제 multipart 라우트 미들웨어도 형식·개수 오류를 JSON 4xx로 반환하고 temp를 정리한다', async () => {
  const previousTempRoot = process.env.UPLOAD_TEMP_ROOT;
  const tempRoot = path.join(testRoot, 'private-temp');
  process.env.UPLOAD_TEMP_ROOT = tempRoot;
  try {
    assert.equal(getUploadTempRoot(), path.resolve(tempRoot));
    assert.equal(getUploadTempRoot().startsWith(path.join(testRoot, 'public-uploads')), false);

    const profileController = require('../src/controllers/public/imageWrite.controller');
    const chatController = require('../src/controllers/chat/chatMessage.controller');
    const pngBuffer = await sharp({
      create: { width: 1, height: 1, channels: 3, background: '#ffffff' },
    }).png().toBuffer();

    const gifResult = await runUploadHandler(
      chatController.uploadSingleImage,
      multipartRequest(
        [{ name: 'bad.gif', type: 'image/gif', data: Buffer.from('GIF89a') }],
        'image'
      )
    );
    assert.equal(gifResult.status, 415);
    assert.equal(gifResult.body.code, 'UNSUPPORTED_IMAGE_TYPE');

    const tooLargeResult = await runUploadHandler(
      chatController.uploadSingleImage,
      multipartRequest(
        [{
          name: 'too-large.jpg',
          type: 'image/jpeg',
          data: Buffer.alloc((10 * 1024 * 1024) + 1, 0xff),
        }],
        'image'
      )
    );
    assert.equal(tooLargeResult.status, 413);
    assert.equal(tooLargeResult.body.code, 'IMAGE_TOO_LARGE');

    const tooManyResult = await runUploadHandler(
      profileController.uploadProfileImages,
      multipartRequest(
        [0, 1, 2].map(index => ({
          name: `photo-${index}.png`,
          type: 'image/png',
          data: pngBuffer,
        })),
        'images'
      )
    );
    assert.equal(tooManyResult.status, 400);
    assert.equal(tooManyResult.body.code, 'INVALID_IMAGE_UPLOAD');
    assert.deepEqual(listFilesRecursively(tempRoot), []);
  } finally {
    if (previousTempRoot === undefined) delete process.env.UPLOAD_TEMP_ROOT;
    else process.env.UPLOAD_TEMP_ROOT = previousTempRoot;
  }
});

test('신규 채팅 메시지 경로는 GIF를 허용하지 않지만 기존 조회 로직은 변경하지 않는다', () => {
  const gifPath = `/uploads/chat/2026/08/20/${roomId}/${'c'.repeat(32)}.gif`;
  assert.throws(
    () => validateChatImagePathForDb(gifPath, roomId),
    error => error.status === 400 && error.code === 'INVALID_CHAT_IMAGE_PATH'
  );
});
