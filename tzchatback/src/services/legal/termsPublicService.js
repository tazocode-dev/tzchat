// src/services/legal/termsPublicService.js
// ────────────────────────────────────────────────────────────
// 공개 약관/동의 도메인 서비스 (지침 §1). routes/legal/termsPublicRouter.js에서 분리.
// ────────────────────────────────────────────────────────────

const { Terms, User, UserAgreement } = require('@/models');

// 서비스 이용에 항상 필요한 공개 정책은 page 문서여도 가입 시 명시적 확인을 받는다.
const REQUIRED_POLICY_SLUGS = ['terms', 'guidelines', 'youth-policy'];
const REQUIRED_AGREEMENT_SLUGS = [...REQUIRED_POLICY_SLUGS, 'privacy-consent'];
const TERMS_CONFIGURATION_ERROR = 'TERMS_CONFIGURATION_ERROR';
const CONTACTS_CONSENT_SLUG = 'contacts-consent';
const SENSITIVE_INFORMATION_CONSENT_SLUG = 'sensitive-information-consent';

function agreementDocumentFilter() {
  return {
    isActive: true,
    $or: [
      { kind: 'consent' },
      { slug: { $in: REQUIRED_AGREEMENT_SLUGS } },
    ],
  };
}

function isRequiredAgreement(doc) {
  return REQUIRED_AGREEMENT_SLUGS.includes(String(doc?.slug || '')) ||
    !!doc?.isRequired || !!doc?.defaultRequired;
}

class TermsPublicError extends Error {
  constructor(status, message, code, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function assertRequiredPoliciesConfigured(activeDocuments) {
  const configured = new Set(activeDocuments.map(doc => String(doc?.slug || '')));
  const missingRequiredSlugs = REQUIRED_AGREEMENT_SLUGS.filter(slug => !configured.has(slug));
  if (missingRequiredSlugs.length > 0) {
    throw new TermsPublicError(
      503,
      `필수 약관 메타데이터가 설정되지 않았습니다: ${missingRequiredSlugs.join(', ')}`,
      TERMS_CONFIGURATION_ERROR,
      { missingRequiredSlugs },
    );
  }
}

async function hasCurrentActiveOptIn(userId, slugInput, dependencies = {}) {
  const slug = String(slugInput || '').trim();
  if (!userId || !slug) return false;

  const TermsModel = dependencies.TermsModel || Terms;
  const UserAgreementModel = dependencies.UserAgreementModel || UserAgreement;
  const activeDocument = await TermsModel.findOne({ slug, kind: 'consent', isActive: true })
    .select('slug version')
    .lean();
  if (!activeDocument) return false;

  const agreement = await UserAgreementModel.findOne({
    userId,
    slug,
    version: String(activeDocument.version),
    optedIn: true,
  }).select('_id').lean();
  return !!agreement;
}

async function requireCurrentActiveOptIn(userId, slug, dependencies = {}) {
  if (await hasCurrentActiveOptIn(userId, slug, dependencies)) return;
  throw new TermsPublicError(
    403,
    '이 기능을 사용하려면 현재 선택 동의가 필요합니다.',
    'OPTIONAL_CONSENT_REQUIRED',
    { slug },
  );
}

// GET /api/terms/active — 활성 문서 전체(페이지 + 동의서)
async function listActive() {
  return Terms.find({ isActive: true })
    .select('slug title version kind isRequired defaultRequired publishedAt effectiveAt')
    .lean();
}

// GET /api/terms/:slug/active — 특정 슬러그의 활성 문서(본문 포함)
async function getActiveBySlug(slugInput) {
  const slug = String(slugInput || '').trim();
  if (!slug) throw new TermsPublicError(400, 'slug is required');

  const doc = await Terms.findOne({ slug, isActive: true })
    .select('slug title version kind isRequired defaultRequired publishedAt effectiveAt body content')
    .lean();

  if (!doc) throw new TermsPublicError(404, '활성 문서를 찾을 수 없습니다.');

  const { content, ...rest } = doc;
  const body = doc.body || content || '';
  return { ...rest, body };
}

// GET /api/terms/:slug/versions
async function listVersions(slugInput) {
  const slug = String(slugInput || '').trim();
  if (!slug) throw new TermsPublicError(400, 'slug is required');

  const rows = await Terms.find({ slug })
    .select('slug title version kind isRequired defaultRequired publishedAt effectiveAt body content')
    .sort({ version: -1 })
    .lean();

  return rows.map(r => {
    const { content, ...rest } = r;
    return { ...rest, body: r.body || content || '' };
  });
}

// POST /api/terms/consents — 단일 동의 저장/갱신
async function saveConsent({ userId, slug, version, optedIn, req }, dependencies = {}) {
  if (!userId) throw new TermsPublicError(401, 'unauthorized');
  if (!slug || !version || typeof slug !== 'string' || typeof version !== 'string') {
    throw new TermsPublicError(400, 'slug/version은 문자열이어야 합니다.');
  }

  const TermsModel = dependencies.TermsModel || Terms;
  const UserModel = dependencies.UserModel || User;
  const UserAgreementModel = dependencies.UserAgreementModel || UserAgreement;
  const doc = await TermsModel.findOne({ slug, isActive: true })
    .select('_id slug title version kind isRequired defaultRequired')
    .lean();
  if (!doc) throw new TermsPublicError(404, '활성 문서를 찾을 수 없습니다.');
  if (String(doc.version) !== String(version)) {
    throw new TermsPublicError(400, '요청 버전이 활성 버전과 일치하지 않습니다.');
  }

  if (optedIn === false && (slug === CONTACTS_CONSENT_SLUG || slug === SENSITIVE_INFORMATION_CONSENT_SLUG)) {
    const cleanup = slug === CONTACTS_CONSENT_SLUG
      ? { localContactHashes: [], search_disconnectLocalContacts: 'OFF' }
      : { preference: '', search_preference: '' };
    const cleaned = await UserModel.findByIdAndUpdate(
      userId,
      { $set: cleanup },
      { new: true },
    ).select('_id');
    if (!cleaned) throw new TermsPublicError(404, '사용자를 찾을 수 없습니다.');
  }

  const now = new Date();
  await UserAgreementModel.updateOne(
    { userId, slug }, // slug 기준 1개 행 유지
    {
      $set: {
        version: String(version),
        agreedAt: now,
        optedIn: typeof optedIn === 'boolean' ? optedIn : true,
        docId: doc._id,
        meta: {
          title: doc.title,
          kind: doc.kind,
          isRequired: isRequiredAgreement(doc),
          defaultRequired: !!doc.defaultRequired,
          userAgent: req.get('User-Agent'),
          ip: req.ip,
        },
      },
    },
    { upsert: true }
  );
}

// ===== 공통 빌더 =====
async function fetchActiveConsentWithUser(userId, dependencies = {}) {
  const TermsModel = dependencies.TermsModel || Terms;
  const UserAgreementModel = dependencies.UserAgreementModel || UserAgreement;
  const activeConsents = await TermsModel.find(agreementDocumentFilter())
    .select('_id slug title version kind isRequired defaultRequired')
    .lean();
  assertRequiredPoliciesConfigured(activeConsents);

  const slugs = activeConsents.map(d => d.slug);
  const userAgreements = await UserAgreementModel.find({ userId, slug: { $in: slugs } })
    .select('slug version optedIn')
    .lean();

  return activeConsents.map(doc => {
    const ua = userAgreements.find((r) => r.slug === doc.slug);
    const sameVersion = ua ? String(ua.version) === String(doc.version) : false;

    // 신·구 필드 중 하나라도 true이면 필수로 본다.
    const isReq = isRequiredAgreement(doc);
    const accepted = ua?.optedIn === true;

    // 필수인데 optedIn !== true 인 경우도 pending 으로 판단
    const pending = !sameVersion || (isReq && !accepted);

    return {
      slug: doc.slug,
      title: doc.title,
      version: doc.version,
      isRequired: isReq,
      defaultRequired: !!doc.defaultRequired,
      hasRecord: !!ua,
      sameVersion,
      optedIn: ua?.optedIn ?? null,
      pending,
    };
  });
}

// GET /api/terms/agreements/list — 모든 활성 동의서 + 사용자 상태
async function listAgreements(userId) {
  if (!userId) throw new TermsPublicError(401, 'unauthorized');
  const items = await fetchActiveConsentWithUser(userId);
  return { items };
}

// GET /api/terms/agreements/status (별칭 /status) — 대기 중 항목 + 전체 현황
async function getAgreementsStatus(userId, dependencies = {}) {
  if (!userId) throw new TermsPublicError(401, 'unauthorized');
  const items = await fetchActiveConsentWithUser(userId, dependencies);
  const pending = items
    .filter(i => i.pending)
    .map(i => ({
      slug: i.slug,
      title: i.title,
      version: i.version,
      isRequired: i.isRequired,
      hasRecord: i.hasRecord,
      sameVersion: i.sameVersion,
    }));
  return { pending, items };
}

// POST /api/terms/agreements/accept — 배치 저장
async function acceptAgreements({ userId, slugsSelected, req, route }, dependencies = {}) {
  if (!userId) throw new TermsPublicError(401, 'unauthorized');
  if (!Array.isArray(slugsSelected) || slugsSelected.some(slug => typeof slug !== 'string' || !slug.trim())) {
    throw new TermsPublicError(400, 'slugs는 비어 있지 않은 문자열 배열이어야 합니다.');
  }

  const TermsModel = dependencies.TermsModel || Terms;
  const UserModel = dependencies.UserModel || User;
  const UserAgreementModel = dependencies.UserAgreementModel || UserAgreement;
  const activeConsents = await TermsModel.find(agreementDocumentFilter())
    .select('_id slug title version kind isRequired defaultRequired')
    .lean();
  assertRequiredPoliciesConfigured(activeConsents);

  const selected = new Set(slugsSelected.map(slug => slug.trim()));
  const missingRequiredSlugs = activeConsents
    .filter(isRequiredAgreement)
    .map(doc => doc.slug)
    .filter(slug => !selected.has(slug));
  if (missingRequiredSlugs.length > 0) {
    throw new TermsPublicError(
      400,
      `필수 약관 동의가 누락되었습니다: ${missingRequiredSlugs.join(', ')}`,
      'REQUIRED_AGREEMENTS_MISSING',
      { missingRequiredSlugs },
    );
  }

  const cleanup = {};
  if (activeConsents.some(doc => doc.slug === CONTACTS_CONSENT_SLUG) && !selected.has(CONTACTS_CONSENT_SLUG)) {
    cleanup.localContactHashes = [];
    cleanup.search_disconnectLocalContacts = 'OFF';
  }
  if (activeConsents.some(doc => doc.slug === SENSITIVE_INFORMATION_CONSENT_SLUG) && !selected.has(SENSITIVE_INFORMATION_CONSENT_SLUG)) {
    cleanup.preference = '';
    cleanup.search_preference = '';
  }
  if (Object.keys(cleanup).length > 0) {
    const cleaned = await UserModel.findByIdAndUpdate(
      userId,
      { $set: cleanup },
      { new: true },
    ).select('_id');
    if (!cleaned) throw new TermsPublicError(404, '사용자를 찾을 수 없습니다.');
  }

  const now = new Date();
  const bulk = activeConsents.map(doc => ({
    updateOne: {
      filter: { userId, slug: doc.slug },
      update: {
        $set: {
          version: String(doc.version),
          agreedAt: now,
          optedIn: selected.has(doc.slug),
          docId: doc._id,
          meta: {
            title: doc.title,
            kind: doc.kind,
            isRequired: isRequiredAgreement(doc),
            defaultRequired: !!doc.defaultRequired,
            userAgent: req.get('User-Agent'),
            ip: req.ip,
          },
        },
      },
      upsert: true,
    },
  }));

  if (bulk.length > 0) {
    const result = await UserAgreementModel.bulkWrite(bulk, { ordered: false });
    console.log(`[TERMS][POST]${route} bulkWrite done:`, {
      nUpserted: result?.upsertedCount ?? 0,
      nModified: result?.modifiedCount ?? 0,
      nMatched: result?.matchedCount ?? 0,
    });
  } else {
    console.log(`[TERMS][POST]${route} no active consent docs`);
  }
}

// GET /api/terms/latest
async function getLatest(slug) {
  if (!slug) throw new TermsPublicError(400, 'slug is required');

  const doc = await Terms.findOne({ slug, isActive: true })
    .sort({ version: -1 })
    .lean();
  if (!doc) throw new TermsPublicError(404, 'document not found');

  const { content, ...rest } = doc;
  const body = doc.body || content || '';
  return { ...rest, body };
}

// POST /api/terms/agree
async function agree({ userId, slug, version, req }) {
  if (!userId) throw new TermsPublicError(401, 'unauthorized');
  if (!slug || !version) throw new TermsPublicError(400, 'slug and version are required');

  const latest = await Terms.findOne({ slug, isActive: true }).sort({ version: -1 }).lean();
  if (!latest) throw new TermsPublicError(404, 'document not found');

  if (String(latest.version) !== String(version)) {
    throw new TermsPublicError(400, 'version mismatch with active document');
  }

  const now = new Date();
  await UserAgreement.updateOne(
    { userId, slug },
    {
      $set: {
        version: String(version),
        agreedAt: now,
        optedIn: true,
        docId: latest._id,
        meta: {
          title: latest.title,
          kind: latest.kind,
          isRequired: isRequiredAgreement(latest),
          defaultRequired: !!latest.defaultRequired,
          userAgent: req.get('User-Agent'),
          ip: req.ip,
        },
      },
    },
    { upsert: true }
  );
}

// GET /api/terms/require-consent
async function getRequireConsent(userId, dependencies = {}) {
  if (!userId) throw new TermsPublicError(401, 'unauthorized');

  const TermsModel = dependencies.TermsModel || Terms;
  const UserAgreementModel = dependencies.UserAgreementModel || UserAgreement;
  const requiredDocs = await TermsModel.find(agreementDocumentFilter())
    .select('slug title version kind isRequired defaultRequired')
    .lean();
  assertRequiredPoliciesConfigured(requiredDocs);
  const userAgreements = await UserAgreementModel.find({ userId })
    .select('slug version optedIn')
    .lean();

  const needSlugs = [];
  for (const doc of requiredDocs.filter(isRequiredAgreement)) {
    const ua = userAgreements.find(
      (x) => x.slug === doc.slug && String(x.version) === String(doc.version)
    );
    // 필수는 미동의(optedIn !== true)도 재동의 필요
    if (!ua || ua.optedIn !== true) needSlugs.push(doc.slug);
  }

  return { needReconsent: needSlugs.length > 0, requiredSlugs: needSlugs };
}

module.exports = {
  REQUIRED_POLICY_SLUGS,
  REQUIRED_AGREEMENT_SLUGS,
  TERMS_CONFIGURATION_ERROR,
  TermsPublicError,
  hasCurrentActiveOptIn,
  requireCurrentActiveOptIn,
  listActive,
  getActiveBySlug,
  listVersions,
  saveConsent,
  listAgreements,
  getAgreementsStatus,
  acceptAgreements,
  getLatest,
  agree,
  getRequireConsent,
};
