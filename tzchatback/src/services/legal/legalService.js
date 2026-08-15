// src/services/legal/legalService.js
// ────────────────────────────────────────────────────────────
// 법적 동의(레거시/공식) 도메인 서비스 (지침 §1). routes/legal/legalRouter.js에서 분리.
// ────────────────────────────────────────────────────────────

const { Terms, UserAgreement } = require('@/models');

class LegalError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// GET /api/legal/consents/required — 활성 필수/선택 동의 항목 목록
async function listRequiredConsents() {
  const active = await Terms.find({ isActive: true, kind: 'consent' })
    .select('slug title version kind defaultRequired')
    .sort({ slug: 1 })
    .lean();

  return active.map(t => ({
    slug: t.slug,
    title: t.title,
    version: String(t.version),
    kind: t.kind,
    required: !!t.defaultRequired,
  }));
}

// POST /api/legal/consents/agree — 동의 저장(필수/선택 공통)
async function agreeConsent({ userId, slug, version, optedIn, req }) {
  if (!userId) throw new LegalError(401, 'unauthorized');
  if (!slug || !version || typeof version !== 'string') {
    throw new LegalError(400, 'slug/version(문자열) 필요');
  }

  const active = await Terms.findOne({ slug, isActive: true }).lean();
  if (!active) throw new LegalError(400, '활성 문서를 찾을 수 없습니다.');
  if (String(active.version) !== String(version)) {
    throw new LegalError(400, '활성 버전과 불일치합니다.');
  }

  const now = new Date();
  return UserAgreement.findOneAndUpdate(
    { userId, slug },
    {
      $set: {
        version: String(version),
        agreedAt: now,
        ...(typeof optedIn === 'boolean' ? { optedIn } : {}),
        docId: active._id,
        meta: {
          title: active.title,
          kind: active.kind,
          defaultRequired: !!active.defaultRequired,
          effectiveAt: active.effectiveAt || active.publishedAt,
          userAgent: req.get('User-Agent'),
          ip: req.ip,
        },
      },
    },
    { upsert: true, new: true }
  );
}

// GET /api/legal/agreements/me — 내 동의 현황 조회
async function getMyAgreements(userId) {
  if (!userId) throw new LegalError(401, 'unauthorized');
  return UserAgreement.find({ userId }).lean();
}

// POST /api/legal/agreements/me/consent — (하위호환) 동의하기
async function agreeConsentLegacy({ userId, slug, version, optedIn, req }) {
  if (!userId) throw new LegalError(401, 'unauthorized');
  if (!slug || !version || typeof version !== 'string') {
    throw new LegalError(400, 'slug/version(문자열) 필요');
  }

  const active = await Terms.findOne({ slug, isActive: true }).lean();
  if (!active || String(active.version) !== String(version)) {
    throw new LegalError(400, '활성 버전과 불일치');
  }

  return UserAgreement.findOneAndUpdate(
    { userId, slug },
    {
      $set: {
        version: String(version),
        agreedAt: new Date(),
        ...(typeof optedIn === 'boolean' ? { optedIn } : {}),
        docId: active._id,
        meta: {
          title: active.title,
          kind: active.kind,
          defaultRequired: !!active.defaultRequired,
          effectiveAt: active.effectiveAt || active.publishedAt,
          userAgent: req.get('User-Agent'),
          ip: req.ip,
        },
      },
    },
    { upsert: true, new: true }
  );
}

// GET /api/legal/agreements/me/status
async function getMyAgreementStatus(userId) {
  if (!userId) throw new LegalError(401, 'unauthorized');

  const [active, my] = await Promise.all([
    Terms.find({ isActive: true }).lean(),
    UserAgreement.find({ userId }).lean(),
  ]);

  const myMap = new Map(my.map(r => [r.slug, String(r.version)]));
  const pending = active
    .filter(t => t.kind === 'consent' && !!t.defaultRequired && myMap.get(t.slug) !== String(t.version))
    .map(t => ({ slug: t.slug, title: t.title, version: String(t.version) }));

  const optional = active
    .filter(t => t.kind === 'consent' && !t.defaultRequired)
    .map(t => {
      const mine = my.find(r => r.slug === t.slug) || {};
      return {
        slug: t.slug,
        title: t.title,
        version: String(t.version),
        optedIn: typeof mine.optedIn === 'boolean' ? mine.optedIn : false,
        agreedVersion: mine.version ? String(mine.version) : null,
      };
    });

  return { pending, optional };
}

module.exports = {
  LegalError,
  listRequiredConsents,
  agreeConsent,
  getMyAgreements,
  agreeConsentLegacy,
  getMyAgreementStatus,
};
