// src/services/admin/adminTermsService.js
// ────────────────────────────────────────────────────────────
// 관리자 약관 발행/조회 도메인 서비스 (지침 §1). routes/admin/termsRouter.js에서 분리.
// ────────────────────────────────────────────────────────────

const { Terms } = require('@/models');

class AdminTermsError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function deriveKindFromSlug(slug = '') {
  return String(slug).toLowerCase().endsWith('-consent') ? 'consent' : 'page';
}
function isValidKind(kind) {
  return kind === 'page' || kind === 'consent';
}

/**
 * 새 버전 발행 (MASTER ONLY)
 * - 이전 활성본 비활성화
 * - 신규본 활성화
 * - slug + version 중복 방지
 * - kind, defaultRequired(front) ↔ isRequired(백엔드 호환)
 */
async function publishTerms(body) {
  const {
    slug,
    title,
    version,              // 문자열 버전 (예: "2025-09-30-01")
    content,               // 프론트: content
    body: legacyBody,      // 과거 호환 (있으면 content로 대체)
    kind: kindInput,       // 'page' | 'consent' (없으면 slug로 유추)
    defaultRequired,       // consent 전용 (boolean)
    effectiveAt,           // (선택) 효력 발생일
  } = body || {};

  // ----- 필수값 검증 -----
  const docBody = typeof content === 'string' ? content : legacyBody;
  if (!slug || !title || !version || !docBody) {
    throw new AdminTermsError(400, '필수 필드 누락(slug/title/version/content)');
  }
  if (typeof version !== 'string') {
    throw new AdminTermsError(400, 'version은 문자열이어야 합니다. (예: 2025-09-30-01)');
  }

  // ----- kind 결정 -----
  const kind = kindInput || deriveKindFromSlug(slug);
  if (!isValidKind(kind)) {
    throw new AdminTermsError(400, "kind는 'page' 또는 'consent'여야 합니다.");
  }

  // ----- consent 전용 기본 required 값 -----
  let isRequired = false;
  if (kind === 'consent') {
    if (typeof defaultRequired === 'boolean') {
      isRequired = !!defaultRequired;
    } else {
      // 규칙: privacy-/sharing-/xborder- 는 기본 필수, 그 외(예: marketing-)는 선택
      isRequired = /^(privacy|sharing|xborder)-consent$/i.test(slug);
    }
  }

  // ----- 중복 버전 방지 -----
  const dup = await Terms.findOne({ slug, version });
  if (dup) {
    throw new AdminTermsError(409, `이미 존재하는 버전입니다. (slug=${slug}, version=${version})`);
  }

  // ----- 이전 활성본 비활성화 -----
  await Terms.updateMany({ slug, isActive: true }, { $set: { isActive: false } });

  // ----- 신규 버전 발행 -----
  const now = new Date();
  const doc = await Terms.create({
    slug,
    title,
    version,            // 문자열 버전
    body: docBody,      // 모델이 body 필드를 쓰는 경우 대비
    content: docBody,   // 모델이 content 필드를 쓰는 경우 대비
    kind,               // 'page' | 'consent'
    defaultRequired: isRequired, // 프론트 명칭
    isRequired: isRequired,      // 백엔드/기존 명칭 호환
    isActive: true,
    publishedAt: now,
    effectiveAt: effectiveAt ? new Date(effectiveAt) : now,
  });

  return doc;
}

/**
 * 목록 조회 (MASTER ONLY)
 * - 쿼리: slug, active(true|false), kind(page|consent)
 */
async function listTerms({ slug, active, kind }) {
  const q = {};
  if (slug) q.slug = slug;
  if (active === 'true') q.isActive = true;
  if (active === 'false') q.isActive = false;
  if (kind && isValidKind(kind)) q.kind = kind;

  return Terms.find(q).sort({ slug: 1, version: -1 });
}

module.exports = { AdminTermsError, publishTerms, listTerms };
