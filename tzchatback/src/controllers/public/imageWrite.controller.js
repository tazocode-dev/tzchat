// src/controllers/public/imageWrite.controller.js
// ────────────────────────────────────────────────────────────
// 프로필 이미지 업로드·삭제 컨트롤러: multer 설정 + 요청 파싱 + 응답 조립.
// 실제 파일 IO/Sharp/DB 로직은 services/public/imageWriteService.js가 담당한다.
// ────────────────────────────────────────────────────────────

const multer = require('multer');

const {
  ImageWriteError,
  uploadImages,
  deleteImage,
} = require('@/services/public/imageWriteService');
const {
  MAX_IMAGE_UPLOAD_BYTES,
  createImageFileFilter,
  createPrivateTempStorage,
  wrapUploadMiddleware,
} = require('@/services/media/imageUploadSecurityService');

const log = (...args) => console.log('[profileImage:write]', ...args);

function getMyId(req) {
  return req?.user?._id || req?.session?.user?._id || null;
}

// 임시 파일은 공개 /uploads 경로 밖에 확장자 없는 안전한 이름으로 저장한다.
const upload = multer({
  storage: createPrivateTempStorage('profile'),
  fileFilter: createImageFileFilter(),
  limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES, files: 2 },
});
const uploadProfileImages = wrapUploadMiddleware(upload.array('images', 2));

// ======================================================
// [1] 이미지 업로드 (다중)
// POST /api/profile/images
// body: kind = 'avatar' | 'gallery' (default: 'gallery')
// ======================================================
async function create(req, res) {
  try {
    const myId = getMyId(req);
    const kind = req.body?.kind;
    const result = await uploadImages({ myId, kind, files: req.files, req });
    return res.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ImageWriteError) {
      return res.status(err.status).json({ message: err.message });
    }
    log('POST /profile/images ERR', err?.message);
    const code = err?.status || 500;
    return res.status(code).json({ message: '이미지 업로드 실패' });
  }
}

// ======================================================
// [2] 이미지 삭제
// DELETE /api/profile/images/:id
// ======================================================
async function remove(req, res) {
  try {
    const myId = getMyId(req);
    const { id: imageId } = req.params;
    const result = await deleteImage({ myId, imageId });
    return res.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ImageWriteError) {
      return res.status(err.status).json({ message: err.message });
    }
    log('DELETE /profile/images/:id ERR', err?.message);
    const code = err?.status || 500;
    return res.status(code).json({ message: '이미지 삭제 실패' });
  }
}

module.exports = { upload, uploadProfileImages, create, remove };
