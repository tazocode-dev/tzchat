// src/controllers/system/notice.controller.js
// ────────────────────────────────────────────────────────────
// 공지사항 컨트롤러: 요청 파싱 + 응답 조립.
// 실제 로직은 services/system/noticeService.js가 담당한다.
// ────────────────────────────────────────────────────────────

const {
  NoticeError,
  listNotices,
  listManagedNotices,
  getPublishedNotice,
  getManagedNotice,
  createNotice,
  updateNotice,
  deleteNotice,
} = require('@/services/system/noticeService');

function handleError(err, res, next) {
  if (err instanceof NoticeError) {
    return res.status(err.status).json({ ...(err.code ? { code: err.code } : {}), error: err.message });
  }
  return next(err);
}

async function list(req, res, next) {
  try {
    const items = await listNotices(req.query || {});
    res.json({ items });
  } catch (e) {
    handleError(e, res, next);
  }
}

async function listAll(req, res, next) {
  try {
    const items = await listManagedNotices(req.query || {});
    res.json({ items });
  } catch (e) {
    handleError(e, res, next);
  }
}

async function getPublishedOne(req, res, next) {
  try {
    const doc = await getPublishedNotice(req.params.id);
    res.json({ notice: doc });
  } catch (e) {
    handleError(e, res, next);
  }
}

async function getManagedOne(req, res, next) {
  try {
    const doc = await getManagedNotice(req.params.id);
    res.json({ notice: doc });
  } catch (e) {
    handleError(e, res, next);
  }
}

async function create(req, res, next) {
  try {
    const doc = await createNotice(req.body, req);
    res.status(201).json({ notice: doc });
  } catch (e) {
    handleError(e, res, next);
  }
}

async function update(req, res, next) {
  try {
    const doc = await updateNotice(req.params.id, req.body);
    res.json({ notice: doc });
  } catch (e) {
    handleError(e, res, next);
  }
}

async function remove(req, res, next) {
  try {
    await deleteNotice(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    handleError(e, res, next);
  }
}

module.exports = { list, listAll, getPublishedOne, getManagedOne, create, update, remove };
