const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');

const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_INPUT_PIXELS = 40_000_000;
const SHARP_INPUT_OPTIONS = Object.freeze({
  failOnError: true,
  limitInputPixels: MAX_IMAGE_INPUT_PIXELS,
  sequentialRead: true,
});

const ALLOWED_IMAGE_TYPES = Object.freeze({
  'image/jpeg': Object.freeze({ format: 'jpeg', extensions: Object.freeze(['.jpg', '.jpeg']) }),
  'image/png': Object.freeze({ format: 'png', extensions: Object.freeze(['.png']) }),
  'image/webp': Object.freeze({ format: 'webp', extensions: Object.freeze(['.webp']) }),
});

class ImageUploadError extends Error {
  constructor(status, message, code = 'INVALID_IMAGE_UPLOAD') {
    super(message);
    this.name = 'ImageUploadError';
    this.status = status;
    this.code = code;
  }
}

function ensureDirectorySync(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function ensurePrivateDirectorySync(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
}

function getUploadRoot() {
  return path.resolve(
    process.env.UPLOAD_ROOT || path.resolve(__dirname, '../../../uploads')
  );
}

function getUploadTempRoot() {
  return path.resolve(
    process.env.UPLOAD_TEMP_ROOT || path.join(os.tmpdir(), 'tzchat-upload-temp')
  );
}

function assertPrivateTempRoot(tempRoot = getUploadTempRoot(), uploadRoot = getUploadRoot()) {
  const normalizedTempRoot = path.resolve(tempRoot);
  const normalizedUploadRoot = path.resolve(uploadRoot);
  if (
    normalizedTempRoot === normalizedUploadRoot
    || normalizedTempRoot.startsWith(`${normalizedUploadRoot}${path.sep}`)
  ) {
    throw new ImageUploadError(
      500,
      '임시 업로드 경로 설정이 올바르지 않습니다.',
      'UPLOAD_TEMP_NOT_PRIVATE'
    );
  }
  return normalizedTempRoot;
}

function assertSafePathSegment(value, label, pattern) {
  const normalized = String(value || '').trim();
  if (!normalized || !pattern.test(normalized)) {
    throw new ImageUploadError(400, `${label}이(가) 올바르지 않습니다.`, 'INVALID_UPLOAD_PATH');
  }
  return normalized;
}

function validateChatRoomId(roomId) {
  return assertSafePathSegment(roomId, '채팅방 ID', /^[a-f0-9]{24}$/i);
}

function validateProfileUserId(userId) {
  return assertSafePathSegment(userId, '사용자 ID', /^[a-z0-9_-]{1,128}$/i);
}

function resolveWithinRoot(root, ...segments) {
  const normalizedRoot = path.resolve(root);
  const resolved = path.resolve(normalizedRoot, ...segments);
  if (resolved !== normalizedRoot && !resolved.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new ImageUploadError(400, '업로드 경로가 올바르지 않습니다.', 'INVALID_UPLOAD_PATH');
  }
  return resolved;
}

function validateDeclaredImage(file) {
  const mime = String(file?.mimetype || '').trim().toLowerCase();
  const declared = ALLOWED_IMAGE_TYPES[mime];
  if (!declared) {
    throw new ImageUploadError(
      415,
      'JPEG, PNG, WebP 이미지 파일만 업로드할 수 있습니다.',
      'UNSUPPORTED_IMAGE_TYPE'
    );
  }

  const extension = path.extname(String(file?.originalname || '')).toLowerCase();
  if (!declared.extensions.includes(extension)) {
    throw new ImageUploadError(
      415,
      '파일 확장자와 이미지 형식이 일치하지 않습니다.',
      'IMAGE_EXTENSION_MISMATCH'
    );
  }
  return { mime, extension, format: declared.format };
}

async function inspectImageFile(file, dependencies = {}) {
  const sharpFactory = dependencies.sharpFactory || sharp;
  const declared = validateDeclaredImage(file);
  let metadata;
  try {
    metadata = await sharpFactory(file.path, SHARP_INPUT_OPTIONS).metadata();
  } catch {
    throw new ImageUploadError(
      415,
      '손상되었거나 지원하지 않는 이미지 파일입니다.',
      'INVALID_IMAGE_DATA'
    );
  }

  if (
    metadata?.format !== declared.format
    || !Number.isInteger(metadata?.width)
    || metadata.width < 1
    || !Number.isInteger(metadata?.height)
    || metadata.height < 1
    || (Number(metadata?.pages) || 1) > 1
  ) {
    throw new ImageUploadError(
      415,
      '파일 내용과 이미지 형식이 일치하지 않습니다.',
      'IMAGE_CONTENT_MISMATCH'
    );
  }
  return { ...declared, metadata };
}

function createImageFileFilter() {
  return (_req, file, callback) => {
    try {
      validateDeclaredImage(file);
      callback(null, true);
    } catch (error) {
      callback(error, false);
    }
  };
}

function createPrivateTempStorage(scope) {
  const safeScope = assertSafePathSegment(scope, '업로드 구분', /^[a-z0-9_-]{1,40}$/i);
  return multer.diskStorage({
    destination: (_req, _file, callback) => {
      try {
        const tempRoot = assertPrivateTempRoot();
        const destination = resolveWithinRoot(tempRoot, safeScope);
        ensurePrivateDirectorySync(destination);
        callback(null, destination);
      } catch (error) {
        callback(error);
      }
    },
    filename: (_req, _file, callback) => {
      callback(null, `${crypto.randomBytes(16).toString('hex')}.upload`);
    },
  });
}

function removeFileQuietly(filePath) {
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch {}
}

function removeUploadedTempFiles(files) {
  const fileList = Array.isArray(files) ? files : [files];
  for (const file of fileList) removeFileQuietly(file?.path);
}

function mapUploadMiddlewareError(error) {
  if (error instanceof ImageUploadError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  if (!(error instanceof multer.MulterError)) return null;

  if (error.code === 'LIMIT_FILE_SIZE') {
    return {
      status: 413,
      code: 'IMAGE_TOO_LARGE',
      message: '이미지 파일은 10MB 이하만 업로드할 수 있습니다.',
    };
  }
  return {
    status: 400,
    code: 'INVALID_IMAGE_UPLOAD',
    message: '업로드 파일 수 또는 요청 형식이 올바르지 않습니다.',
  };
}

function wrapUploadMiddleware(middleware) {
  return (req, res, next) => {
    middleware(req, res, (error) => {
      if (!error) return next();
      removeUploadedTempFiles(req.files || req.file);
      const response = mapUploadMiddlewareError(error);
      if (!response) return next(error);
      return res.status(response.status).json({
        code: response.code,
        message: response.message,
      });
    });
  };
}

function buildChatDestination(roomId, now = new Date(), uploadRoot = getUploadRoot()) {
  const safeRoomId = validateChatRoomId(roomId);
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new ImageUploadError(400, '업로드 날짜가 올바르지 않습니다.', 'INVALID_UPLOAD_PATH');
  }
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const chatRoot = resolveWithinRoot(uploadRoot, 'chat');
  const destination = resolveWithinRoot(chatRoot, yyyy, mm, dd, safeRoomId);
  return { destination, yyyy, mm, dd, roomId: safeRoomId };
}

async function processChatImageUpload({ file, roomId, now = new Date() }, dependencies = {}) {
  if (!file?.path) {
    throw new ImageUploadError(400, '파일이 존재하지 않습니다.', 'IMAGE_FILE_REQUIRED');
  }

  const sharpFactory = dependencies.sharpFactory || sharp;
  const uploadRoot = dependencies.uploadRoot || getUploadRoot();
  const id = dependencies.id || crypto.randomBytes(16).toString('hex');
  const generatedPaths = [];

  try {
    assertSafePathSegment(id, '이미지 ID', /^[a-f0-9]{32}$/);
    await inspectImageFile(file, { sharpFactory });
    const { destination, yyyy, mm, dd, roomId: safeRoomId } = buildChatDestination(
      roomId,
      now,
      uploadRoot
    );
    ensureDirectorySync(destination);
    const finalFilename = `${id}.jpg`;
    const finalAbsPath = resolveWithinRoot(destination, finalFilename);
    generatedPaths.push(finalAbsPath);

    await sharpFactory(file.path, SHARP_INPUT_OPTIONS)
      .rotate()
      .resize({ width: 1024, withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 75, mozjpeg: true })
      .toFile(finalAbsPath);

    return {
      finalAbsPath,
      relativePath: `/uploads/chat/${yyyy}/${mm}/${dd}/${safeRoomId}/${finalFilename}`,
    };
  } catch (error) {
    for (const generatedPath of generatedPaths) removeFileQuietly(generatedPath);
    if (error instanceof ImageUploadError) throw error;
    throw new ImageUploadError(
      415,
      '이미지 파일을 안전하게 처리할 수 없습니다.',
      'IMAGE_PROCESSING_FAILED'
    );
  } finally {
    removeFileQuietly(file.path);
  }
}

module.exports = {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_IMAGE_INPUT_PIXELS,
  SHARP_INPUT_OPTIONS,
  ImageUploadError,
  ensureDirectorySync,
  ensurePrivateDirectorySync,
  getUploadRoot,
  getUploadTempRoot,
  assertPrivateTempRoot,
  validateChatRoomId,
  validateProfileUserId,
  resolveWithinRoot,
  validateDeclaredImage,
  inspectImageFile,
  createImageFileFilter,
  createPrivateTempStorage,
  removeFileQuietly,
  removeUploadedTempFiles,
  mapUploadMiddlewareError,
  wrapUploadMiddleware,
  buildChatDestination,
  processChatImageUpload,
};
