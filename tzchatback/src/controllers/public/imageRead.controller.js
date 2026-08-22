// src/controllers/public/imageRead.controller.js
// ────────────────────────────────────────────────────────────
// 프로필 이미지 조회·대표지정 컨트롤러: 요청 파싱 + 응답 조립.
// 실제 로직은 services/public/imageReadService.js가 담당한다.
// ────────────────────────────────────────────────────────────

const {
  ImageReadError,
  getMyImages,
  getUserImages,
  setMainImage,
} = require('@/services/public/imageReadService');

const log = (...args) => console.log('[profileImage:read]', ...args);

function getMyId(req) {
  return req?.user?._id || req?.session?.user?._id || null;
}

async function listMine(req, res) {
  try {
    const myId = getMyId(req);
    const data = await getMyImages(myId, req);
    return res.json(data);
  } catch (err) {
    if (err instanceof ImageReadError) {
      return res.status(err.status).json({ message: err.message });
    }
    log('GET /profile/images ERR', err?.message);
    const code = err?.status || 500;
    return res.status(code).json({ message: '이미지 목록 조회 실패' });
  }
}

async function listOfUser(req, res) {
  try {
    const data = await getUserImages(req.params.id, req, getMyId(req));
    return res.json(data);
  } catch (err) {
    if (err instanceof ImageReadError) {
      return res.status(err.status).json({ message: err.message });
    }
    log('GET /users/:id/profile/images ERR', err?.message);
    const code = err?.status || 500;
    return res.status(code).json({ message: '이미지 목록 조회 실패' });
  }
}

async function setMain(req, res) {
  try {
    const myId = getMyId(req);
    const { imageId } = req.body || {};
    const data = await setMainImage(myId, imageId);
    return res.json({ success: true, ...data });
  } catch (err) {
    if (err instanceof ImageReadError) {
      return res.status(err.status).json({ message: err.message });
    }
    log('PUT /profile/main ERR', err?.message);
    const code = err?.status || 500;
    return res.status(code).json({ message: '대표 사진 지정 실패' });
  }
}

module.exports = { listMine, listOfUser, setMain };
