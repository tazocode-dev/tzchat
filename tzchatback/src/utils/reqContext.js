// src/utils/reqContext.js
// ────────────────────────────────────────────────────────────
// legal/legalRouter.js와 legal/termsPublicRouter.js가 각자 동일하게 갖고 있던
// 요청 컨텍스트 추출 유틸(getUserIdFromReq, logPath)을 공통 모듈로 통합했다
// (지침: 공통 로직 중복 금지).
// ────────────────────────────────────────────────────────────

// 다양한 위치에서 userId 추출 (세션/JWT 하이브리드 호환)
function getUserIdFromReq(req) {
  return (
    (req._uid && String(req._uid)) ||
    (req.auth?.userId && String(req.auth.userId)) ||
    (req.user?._id && String(req.user._id)) ||
    (req.session?.user?._id && String(req.session.user._id)) ||
    (req.get('x-user-id') && String(req.get('x-user-id'))) || // dev 보조
    ''
  );
}

// 실제 마운트 경로 로깅용
function logPath(req) {
  return `${req.baseUrl || ''}${req.path || ''}`;
}

module.exports = { getUserIdFromReq, logPath };
