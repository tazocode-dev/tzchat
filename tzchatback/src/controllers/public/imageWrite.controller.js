// src/controllers/public/imageWrite.controller.js
// ────────────────────────────────────────────────────────────
// 프로필 이미지 업로드·삭제 컨트롤러: multer 설정 + 요청 파싱 + 응답 조립.
// 실제 파일 IO/Sharp/DB 로직은 services/public/imageWriteService.js가 담당한다.
// ────────────────────────────────────────────────────────────

const path = require('path');
const multer = require('multer');

const {
  ImageWriteError,
  getUserProfileDir,
  ensureDirSync,
  genId,
  uploadImages,
  deleteImage,
} = require('@/services/public/imageWriteService');

const log = (...args) => console.log('[profileImage:write]', ...args);

function getMyId(req) {
  return req?.user?._id || req?.session?.user?._id || null;
}

// ===== Multer (임시 저장: 사용자 폴더 내 tmp) =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const userId = getMyId(req);
      if (!userId) return cb(new Error('인증 필요'), null);
      const userDir = getUserProfileDir(userId);
      const tmpDir = path.join(userDir, 'tmp');
      ensureDirSync(tmpDir);
      cb(null, tmpDir);
    } catch (e) {
      cb(e);
    }
  },
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase();
    const uid = genId();
    cb(null, `${uid}${ext || ''}`);
  }
});
const fileFilter = (_req, file, cb) => {
  if (!file.mimetype || !file.mimetype.startsWith('image/')) {
    return cb(new Error('이미지 파일만 업로드할 수 있습니다.'), false);
  }
  cb(null, true);
};
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

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

module.exports = { upload, create, remove };
