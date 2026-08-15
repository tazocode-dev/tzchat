// src/controllers/legal/legal.controller.js
// ────────────────────────────────────────────────────────────
// 법적 동의(레거시/공식) 컨트롤러: 요청 파싱 + 응답 조립.
// 실제 로직은 services/legal/legalService.js가 담당한다.
// ────────────────────────────────────────────────────────────

const { getUserIdFromReq, logPath } = require('@/utils/reqContext');
const {
  LegalError,
  listRequiredConsents,
  agreeConsent,
  getMyAgreements,
  agreeConsentLegacy,
  getMyAgreementStatus,
} = require('@/services/legal/legalService');

function handleError(err, req, res, fallbackMessage) {
  if (err instanceof LegalError) {
    return res.status(err.status).json({ ok: false, message: err.message });
  }
  console.error(`[LEGAL]${logPath(req)} error:`, err);
  return res.status(500).json({ ok: false, message: fallbackMessage });
}

async function requiredConsents(req, res) {
  try {
    const items = await listRequiredConsents();
    res.json({ ok: true, items });
  } catch (e) {
    handleError(e, req, res, '동의 항목 조회 실패');
  }
}

async function postConsentsAgree(req, res) {
  try {
    const userId = getUserIdFromReq(req);
    const { slug, version, optedIn } = req.body || {};
    const data = await agreeConsent({ userId, slug, version, optedIn, req });
    res.json({ ok: true, data });
  } catch (e) {
    handleError(e, req, res, '동의 저장 실패');
  }
}

async function myAgreements(req, res) {
  try {
    const userId = getUserIdFromReq(req);
    const data = await getMyAgreements(userId);
    res.json({ ok: true, data });
  } catch (e) {
    handleError(e, req, res, '동의 현황 조회 실패');
  }
}

async function postMyConsentLegacy(req, res) {
  try {
    const userId = getUserIdFromReq(req);
    const { slug, version, optedIn } = req.body || {};
    const data = await agreeConsentLegacy({ userId, slug, version, optedIn, req });
    res.json({ ok: true, data });
  } catch (e) {
    handleError(e, req, res, '동의 저장 실패');
  }
}

async function myAgreementStatus(req, res) {
  try {
    const userId = getUserIdFromReq(req);
    const data = await getMyAgreementStatus(userId);
    res.json({ ok: true, data });
  } catch (e) {
    handleError(e, req, res, '동의 상태 조회 실패');
  }
}

module.exports = {
  requiredConsents,
  postConsentsAgree,
  myAgreements,
  postMyConsentLegacy,
  myAgreementStatus,
};
