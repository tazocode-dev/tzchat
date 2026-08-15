// src/controllers/legal/termsPublic.controller.js
// ────────────────────────────────────────────────────────────
// 공개 약관/동의 컨트롤러: 요청 파싱 + 응답 조립.
// 실제 로직은 services/legal/termsPublicService.js가 담당한다.
// ────────────────────────────────────────────────────────────

const { getUserIdFromReq, logPath } = require('@/utils/reqContext');
const {
  TermsPublicError,
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
} = require('@/services/legal/termsPublicService');

function handleError(err, req, res, fallbackMessage) {
  if (err instanceof TermsPublicError) {
    return res.status(err.status).json({ ok: false, message: err.message });
  }
  console.error(`[TERMS]${logPath(req)} error:`, err);
  return res.status(500).json({ ok: false, message: fallbackMessage });
}

async function active(req, res) {
  try {
    const rows = await listActive();
    return res.json({ ok: true, data: rows });
  } catch (err) {
    return handleError(err, req, res, '활성 문서 조회 실패');
  }
}

async function activeBySlug(req, res) {
  try {
    const data = await getActiveBySlug(req.params.slug);
    return res.json({ ok: true, data });
  } catch (err) {
    return handleError(err, req, res, '문서 조회 실패');
  }
}

async function versions(req, res) {
  try {
    const data = await listVersions(req.params.slug);
    return res.json({ ok: true, data });
  } catch (err) {
    return handleError(err, req, res, '버전 목록 조회 실패');
  }
}

async function postConsent(req, res) {
  try {
    const userId = getUserIdFromReq(req);
    const { slug, version, optedIn } = req.body || {};
    await saveConsent({ userId, slug, version, optedIn, req });
    return res.json({ ok: true, message: '동의가 저장되었습니다.' });
  } catch (err) {
    return handleError(err, req, res, '동의 저장 실패');
  }
}

async function agreementsList(req, res) {
  try {
    const userId = getUserIdFromReq(req);
    const data = await listAgreements(userId);
    return res.json({ ok: true, data });
  } catch (err) {
    return handleError(err, req, res, '상태 조회 실패');
  }
}

async function agreementsStatus(req, res) {
  try {
    const userId = getUserIdFromReq(req);
    const data = await getAgreementsStatus(userId);
    return res.json({ ok: true, data });
  } catch (err) {
    return handleError(err, req, res, '상태 조회 실패');
  }
}

async function agreementsAccept(req, res) {
  const route = logPath(req);
  try {
    const userId = getUserIdFromReq(req);
    const body = req.body || {};
    const slugsSelected = Array.isArray(body.slugs) ? body.slugs.map(String) : null;

    console.log(`[TERMS][POST]${route} payload:`, {
      type: typeof body.slugs,
      isArray: Array.isArray(body.slugs),
      count: Array.isArray(body.slugs) ? body.slugs.length : 0,
    });

    await acceptAgreements({ userId, slugsSelected, req, route });
    return res.json({ ok: true, message: '동의가 처리되었습니다.' });
  } catch (err) {
    return handleError(err, req, res, '동의 처리 실패');
  }
}

async function latest(req, res) {
  try {
    const { slug } = req.query || {};
    const data = await getLatest(slug);
    return res.json({ ok: true, data });
  } catch (err) {
    return handleError(err, req, res, 'internal server error');
  }
}

async function postAgree(req, res) {
  try {
    const { slug, version } = req.body || {};
    const userId = getUserIdFromReq(req);
    await agree({ userId, slug, version, req });
    return res.json({ ok: true, message: '동의가 저장되었습니다.' });
  } catch (err) {
    return handleError(err, req, res, 'internal server error');
  }
}

async function requireConsent(req, res) {
  try {
    const userId = getUserIdFromReq(req);
    const data = await getRequireConsent(userId);
    return res.json({ ok: true, ...data });
  } catch (err) {
    return handleError(err, req, res, 'internal server error');
  }
}

module.exports = {
  active,
  activeBySlug,
  versions,
  postConsent,
  agreementsList,
  agreementsStatus,
  agreementsAccept,
  latest,
  postAgree,
  requireConsent,
};
