// src/controllers/search/targetSearch.controller.js
// ────────────────────────────────────────────────────────────
// 검색/추천 질의 컨트롤러: 요청 파싱 + 로깅 + 응답 조립.
// 실제 로직은 services/search/targetSearchService.js가 담당한다.
// ────────────────────────────────────────────────────────────

const { searchUsers, getRecommendedTargets } = require('@/services/search/targetSearchService');

function getMyId(req) {
  const jwtId = req?.user?._id || req?.user?.sub;
  const sessId = req?.session?.user?._id;
  return (jwtId && String(jwtId)) || (sessId && String(sessId)) || '';
}

function requestLogger(req, res, next) {
  const started = Date.now();
  const path = req.baseUrl + req.path;
  console.log('[API][REQ]', { path, method: req.method, userId: getMyId(req) });

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    const ms = Date.now() - started;
    const status = res.statusCode;
    const size = typeof body === 'string' ? body.length : Buffer.byteLength(JSON.stringify(body || {}));
    console.log('[API][RES]', { path, status, ms, size });
    return originalJson(body);
  };
  next();
}

async function postSearchUsers(req, res, next) {
  try {
    const myId = getMyId(req);
    if (!myId) return res.status(401).json({ success: false, error: '로그인이 필요합니다.' });

    const result = await searchUsers(myId, req.body || {});
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

async function getTargets(req, res, next) {
  try {
    const viewerId = getMyId(req);
    if (!viewerId) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

    const { ymd, users } = await getRecommendedTargets(viewerId, req.query || {});
    return res.json({ ok: true, ymd, total: users.length, users });
  } catch (err) {
    next(err);
  }
}

function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  const msg = err.message || 'Internal Server Error';
  console.error('[search/queryRouter]', status, msg, err.stack);
  res.status(status).json({ ok: false, error: msg });
}

module.exports = { requestLogger, postSearchUsers, getTargets, errorHandler };
