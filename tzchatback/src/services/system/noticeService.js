// src/services/system/noticeService.js
// ────────────────────────────────────────────────────────────
// 공지사항 도메인 서비스 (지침 §1). routes/system/noticeRouter.js에서 분리.
// ────────────────────────────────────────────────────────────

const { Notice } = require('@/models');

class NoticeError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function isMasterFromReq(req) {
  const role =
    (req._urole && String(req._urole)) ||
    (req.auth?.role && String(req.auth.role)) ||
    (req.user?.role && String(req.user.role)) ||
    (req.session?.user?.role && String(req.session.user.role)) ||
    '';
  return role === 'master';
}

// 리스트 (공개) — 공개 글만 노출
async function listNotices({ skip, limit }) {
  const s = Math.max(Number(skip || 0), 0);
  const l = Math.min(Math.max(Number(limit || 20), 1), 100);

  const q = { isPublished: true };
  const items = await Notice.find(q)
    .sort({ publishedAt: -1, _id: -1 })
    .skip(s)
    .limit(l)
    .select('_id title category publishedAt createdAt updatedAt')
    .lean();

  return items;
}

// 관리자 목록 — 초안과 비공개 공지를 포함한다.
async function listManagedNotices({ skip, limit }) {
  const s = Math.max(Number(skip || 0), 0);
  const l = Math.min(Math.max(Number(limit || 50), 1), 100);

  return Notice.find({})
    .sort({ publishedAt: -1, _id: -1 })
    .skip(s)
    .limit(l)
    .select('_id title category isPublished publishedAt createdAt updatedAt')
    .lean();
}

// 상세 (공개) — 마스터는 비공개 글도 열람 가능
async function getNotice(id, req) {
  const master = isMasterFromReq(req);
  const doc = await Notice.findById(id).lean();
  if (!doc) throw new NoticeError(404, 'Not found');

  if (!doc.isPublished && !master) {
    throw new NoticeError(404, 'Not found');
  }
  return doc;
}

// 생성 (마스터)
async function createNotice(body, req) {
  const { title, content, category, publishedAt, isPublished } = body || {};

  if (!title || !content) {
    throw new NoticeError(400, 'title and content are required');
  }

  const doc = await Notice.create({
    title: String(title).trim(),
    content: String(content),
    category: category ? String(category).trim() : '',
    isPublished: isPublished !== false,
    publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
    author: req.user?._id || req.session?.user?._id || undefined,
  });
  return doc;
}

// 수정 (마스터)
async function updateNotice(id, body) {
  const { title, content, category, publishedAt, isPublished } = body || {};

  const patch = {};
  if (title != null) patch.title = String(title).trim();
  if (content != null) patch.content = String(content);
  if (category != null) patch.category = String(category).trim();
  if (isPublished != null) patch.isPublished = !!isPublished;
  if (publishedAt != null) patch.publishedAt = new Date(publishedAt);

  const doc = await Notice.findByIdAndUpdate(id, patch, { new: true });
  if (!doc) throw new NoticeError(404, 'Not found');
  return doc;
}

// 삭제 (마스터)
async function deleteNotice(id) {
  const r = await Notice.findByIdAndDelete(id);
  if (!r) throw new NoticeError(404, 'Not found');
}

module.exports = {
  NoticeError,
  listNotices,
  listManagedNotices,
  getNotice,
  createNotice,
  updateNotice,
  deleteNotice,
};
