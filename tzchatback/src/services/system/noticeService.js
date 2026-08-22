// src/services/system/noticeService.js
// ────────────────────────────────────────────────────────────
// 공지사항 도메인 서비스 (지침 §1). routes/system/noticeRouter.js에서 분리.
// ────────────────────────────────────────────────────────────

const { Notice } = require('@/models');

class NoticeError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const NOTICE_LIMITS = Object.freeze({ title: 120, category: 40, content: 50000 });
const INVALID_NOTICE_INPUT = 'INVALID_NOTICE_INPUT';

function invalidNotice(message) {
  throw new NoticeError(400, message, INVALID_NOTICE_INPUT);
}

function validateNoticeBody(body, { partial = false, now = () => new Date() } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    invalidNotice('공지 입력 형식이 올바르지 않습니다.');
  }

  const result = {};
  const has = key => Object.prototype.hasOwnProperty.call(body, key);
  const readText = (key, label, { required = false } = {}) => {
    if (!has(key)) {
      if (required && !partial) invalidNotice(`${label}을(를) 입력해 주세요.`);
      return;
    }
    if (typeof body[key] !== 'string') invalidNotice(`${label} 형식이 올바르지 않습니다.`);
    const value = body[key].trim();
    if (required && !value) invalidNotice(`${label}을(를) 입력해 주세요.`);
    if (value.length > NOTICE_LIMITS[key]) {
      invalidNotice(`${label}은(는) ${NOTICE_LIMITS[key]}자 이내로 입력해 주세요.`);
    }
    result[key] = value;
  };

  readText('title', '제목', { required: true });
  readText('content', '본문', { required: true });
  readText('category', '분류');

  if (has('isPublished')) {
    if (typeof body.isPublished !== 'boolean') invalidNotice('공개 상태 형식이 올바르지 않습니다.');
    result.isPublished = body.isPublished;
  } else if (!partial) {
    result.isPublished = true;
  }

  if (has('publishedAt')) {
    if (body.publishedAt == null || body.publishedAt === '' || typeof body.publishedAt === 'boolean') {
      invalidNotice('게시 일시가 올바르지 않습니다.');
    }
    const publishedAt = new Date(body.publishedAt);
    if (Number.isNaN(publishedAt.getTime())) invalidNotice('게시 일시가 올바르지 않습니다.');
    result.publishedAt = publishedAt;
  } else if (!partial) {
    result.publishedAt = now();
  }

  if (partial && !Object.keys(result).length) {
    invalidNotice('수정할 공지 내용이 없습니다.');
  }
  return result;
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

// 공개 상세는 요청의 세션·JWT 역할과 무관하게 게시 상태만 조회한다.
async function getPublishedNotice(id) {
  const doc = await Notice.findOne({ _id: id, isPublished: true }).lean();
  if (!doc) throw new NoticeError(404, 'Not found');
  return doc;
}

// 관리자 상세는 requireMaster로 보호된 /manage/:id에서만 호출한다.
async function getManagedNotice(id) {
  const doc = await Notice.findById(id).lean();
  if (!doc) throw new NoticeError(404, 'Not found');
  return doc;
}

// 생성 (마스터)
async function createNotice(body, req) {
  const input = validateNoticeBody(body);
  const doc = await Notice.create({
    ...input,
    category: input.category || '',
    author: req.user?._id || req.session?.user?._id || undefined,
  });
  return doc;
}

// 수정 (마스터)
async function updateNotice(id, body) {
  const patch = validateNoticeBody(body, { partial: true });

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
  NOTICE_LIMITS,
  INVALID_NOTICE_INPUT,
  validateNoticeBody,
  listNotices,
  listManagedNotices,
  getPublishedNotice,
  getManagedNotice,
  createNotice,
  updateNotice,
  deleteNotice,
};
