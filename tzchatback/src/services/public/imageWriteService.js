// src/services/public/imageWriteService.js
// ────────────────────────────────────────────────────────────
// 프로필 이미지 업로드·삭제(파일 IO/Sharp) 도메인 서비스 (지침 §1). routes/public/imageWriteRouter.js에서 분리.
// ────────────────────────────────────────────────────────────

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');

const { User } = require('@/models');
const { toAbsoluteMediaUrl } = require('@/utils/mediaUrl');
const {
  ImageUploadError,
  SHARP_INPUT_OPTIONS,
  ensureDirectorySync,
  getUploadRoot,
  inspectImageFile,
  removeFileQuietly,
  removeUploadedTempFiles,
  resolveWithinRoot,
  validateProfileUserId,
} = require('@/services/media/imageUploadSecurityService');

class ImageWriteError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const MAX_PROFILE_IMAGES = 2;
const PROFILE_IMAGE_LIMIT_MESSAGE = '현재 프로필 사진은 최대 2장까지 등록할 수 있습니다.';

// ===== 경로/ID 유틸 =====
const UPLOAD_ROOT = getUploadRoot();
const PROFILE_ROOT = path.join(UPLOAD_ROOT, 'profile');

function ensureDirSync(dir) {
  ensureDirectorySync(dir);
}
ensureDirSync(UPLOAD_ROOT);
ensureDirSync(PROFILE_ROOT);

function getUserProfileDir(userId) {
  const dir = resolveWithinRoot(PROFILE_ROOT, validateProfileUserId(userId));
  ensureDirSync(dir);
  return dir;
}
function genId() {
  return crypto.randomBytes(16).toString('hex'); // 32 hex
}

// ===== URL 정규화 & 변환 =====

/** 내부 절대경로 → 퍼블릭 상대경로(/uploads/...) */
function toPublicUrl(absPath) {
  if (!absPath) return null;
  let normalized;
  try {
    normalized = resolveWithinRoot(UPLOAD_ROOT, path.relative(UPLOAD_ROOT, absPath));
  } catch {
    return null;
  }
  const relative = path.relative(UPLOAD_ROOT, normalized).split(path.sep).join('/');
  return relative ? `/uploads/${relative}` : null;
}

/** 퍼블릭 URL(/uploads/...) → 서버 절대경로 */
function publicUrlToAbs(publicUrl) {
  if (typeof publicUrl !== 'string') return null;
  const match = publicUrl.replace(/\\/g, '/').match(/^\/uploads\/profile\/(.+)$/);
  if (!match || match[1].includes('%')) return null;
  try {
    return resolveWithinRoot(PROFILE_ROOT, ...match[1].split('/'));
  } catch {
    return null;
  }
}

const toAbsoluteUploadUrl = toAbsoluteMediaUrl;

// ===== 이미지 처리 (크롭 + 리사이즈 3종) =====
const SIZES = [
  { name: 'thumb',  w: 240  },
  { name: 'medium', w: 720  },
  { name: 'full',   w: 1280 },
];

async function createVariantsAndSave(srcPath, outBasePathNoExt, aspect) {
  const input = sharp(srcPath, SHARP_INPUT_OPTIONS).rotate();
  const meta = await input.metadata();
  const w = meta.width || 0;
  const h = meta.height || 0;

  // 중앙 크롭 (목표 비율)
  const targetW1 = Math.min(w, Math.floor(h * aspect));
  const targetH1 = Math.min(h, Math.floor(w / aspect));
  const cropW = Math.max(1, targetW1);
  const cropH = Math.max(1, targetH1);
  const left = Math.max(0, Math.floor((w - cropW) / 2));
  const top  = Math.max(0, Math.floor((h - cropH) / 2));

  const results = {};
  for (const s of SIZES) {
    const outPath = `${outBasePathNoExt}_${s.name}.jpg`;
    await sharp(srcPath, SHARP_INPUT_OPTIONS)
      .rotate()
      .extract({ left, top, width: cropW, height: cropH })
      .resize({ width: s.w, withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(outPath);

    results[s.name] = outPath;
  }
  return results; // { thumb, medium, full }
}

function variantPaths(outBasePathNoExt) {
  return SIZES.map(size => `${outBasePathNoExt}_${size.name}.jpg`);
}

// [1] 이미지 업로드 (다중)
async function uploadImages({ myId, kind: kindInput, files, req }, dependencies = {}) {
  const fileList = Array.isArray(files) ? files : [];
  const UserModel = dependencies.UserModel || User;
  const makeVariants = dependencies.createVariantsAndSave || createVariantsAndSave;
  const inspect = dependencies.inspectImageFile || inspectImageFile;
  const generatedPaths = [];

  try {
    if (!myId) throw new ImageWriteError(401, '로그인이 필요합니다.');

    const me = await UserModel.findById(myId, { profileImages: 1, profileMain: 1 }).lean();
    if (!me) throw new ImageWriteError(404, '사용자를 찾을 수 없습니다.');
    if (!fileList.length) throw new ImageWriteError(400, '업로드된 파일이 없습니다.');

    const existingCount = Array.isArray(me.profileImages) ? me.profileImages.length : 0;
    if (existingCount + fileList.length > MAX_PROFILE_IMAGES) {
      throw new ImageWriteError(400, PROFILE_IMAGE_LIMIT_MESSAGE);
    }

    const kind = (kindInput === 'avatar' || kindInput === 'gallery') ? kindInput : 'gallery';
    const aspect = kind === 'avatar' ? 1.0 : 0.8; // 1:1 or 4:5
    const userDir = getUserProfileDir(myId);
    const toInsert = [];
    const created = [];

    for (const file of fileList) {
      await inspect(file);
      const uid = genId();
      const baseNoExt = path.join(userDir, uid);
      generatedPaths.push(...variantPaths(baseNoExt));

      // 3종 생성
      const variants = await makeVariants(file.path, baseNoExt, aspect);

      const urls = {
        thumb:  toPublicUrl(variants.thumb),
        medium: toPublicUrl(variants.medium),
        full:   toPublicUrl(variants.full),
      };

      const doc = {
        id: uid,
        kind,
        aspect,
        urls,
        createdAt: new Date(),
      };

      toInsert.push(doc);

      created.push({
        id: uid,
        kind,
        aspect,
        urlsAbs: {
          thumb:  toAbsoluteUploadUrl(urls.thumb,  req),
          medium: toAbsoluteUploadUrl(urls.medium, req),
          full:   toAbsoluteUploadUrl(urls.full,   req),
        }
      });
    }

    // 대표사진 자동 설정: 기존 대표가 없고 avatar를 올리면 첫 업로드를 대표로
    const shouldSetMain = (!me.profileMain && kind === 'avatar' && toInsert.length > 0);
    const setOps = shouldSetMain ? { profileMain: toInsert[0].id } : {};
    const firstForbiddenIndex = MAX_PROFILE_IMAGES - toInsert.length;

    const updateResult = await UserModel.updateOne(
      {
        _id: myId,
        [`profileImages.${firstForbiddenIndex}`]: { $exists: false },
      },
      {
        $push: { profileImages: { $each: toInsert } },
        ...(Object.keys(setOps).length ? { $set: setOps } : {})
      },
      { runValidators: false }
    );

    const matchedCount = updateResult?.matchedCount ?? updateResult?.n ?? 0;
    if (matchedCount < 1) {
      throw new ImageWriteError(409, PROFILE_IMAGE_LIMIT_MESSAGE);
    }

    return {
      created,
      ...(shouldSetMain ? { profileMain: toInsert[0].id } : {})
    };
  } catch (error) {
    for (const generatedPath of generatedPaths) removeFileQuietly(generatedPath);
    if (error instanceof ImageUploadError) {
      throw new ImageWriteError(error.status, error.message);
    }
    throw error;
  } finally {
    removeUploadedTempFiles(fileList);
  }
}

// [2] 이미지 삭제
async function deleteImage({ myId, imageId }) {
  if (!myId) throw new ImageWriteError(401, '로그인이 필요합니다.');

  const me = await User.findById(myId, { profileImages: 1, profileMain: 1 }).lean();
  if (!me) throw new ImageWriteError(404, '사용자를 찾을 수 없습니다.');

  const arr = me.profileImages || [];
  const idx = arr.findIndex(img => String(img.id) === String(imageId));
  if (idx === -1) throw new ImageWriteError(404, '이미지를 찾을 수 없습니다.');

  // 파일 삭제
  const urls = arr[idx]?.urls || {};
  const absPaths = [urls.thumb, urls.medium, urls.full]
    .map(publicUrlToAbs)
    .filter(Boolean);

  for (const p of absPaths) {
    try { fs.unlinkSync(p); } catch (e) { /* 이미 삭제된 경우 무시 */ }
  }

  // 대표가 이 이미지였으면 후속 처리(남은 사진 중 첫 번째로 대체)
  let nextMain = me.profileMain || '';
  if (String(me.profileMain || '') === String(imageId)) {
    const remain = arr.filter(x => String(x.id) !== String(imageId));
    nextMain = remain.length ? remain[0].id : '';
  }

  await User.updateOne(
    { _id: myId },
    {
      $pull: { profileImages: { id: imageId } },
      $set: { profileMain: nextMain }
    },
    { runValidators: false }
  );

  return { removedId: imageId, profileMain: nextMain };
}

module.exports = {
  ImageWriteError,
  MAX_PROFILE_IMAGES,
  PROFILE_IMAGE_LIMIT_MESSAGE,
  UPLOAD_ROOT,
  PROFILE_ROOT,
  ensureDirSync,
  getUserProfileDir,
  genId,
  createVariantsAndSave,
  uploadImages,
  deleteImage,
};
