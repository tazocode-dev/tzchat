// src/controllers/search/contacts.controller.js
// ────────────────────────────────────────────────────────────
// 연락처 해시 관리 컨트롤러: 요청 파싱 + 로깅 + 응답 조립.
// 실제 로직은 services/search/contactsService.js가 담당한다.
// ────────────────────────────────────────────────────────────

const { ContactsError, saveContactHashes, clearContactHashes } = require('@/services/search/contactsService');

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

async function postHashes(req, res, next) {
  try {
    const userId = getMyId(req);
    if (!userId) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

    const result = await saveContactHashes(userId, req.body?.hashes);
    return res.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof ContactsError) return res.status(err.status).json({ ok: false, error: err.message });
    next(err);
  }
}

async function deleteHashes(req, res, next) {
  try {
    const userId = getMyId(req);
    if (!userId) return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });

    const result = await clearContactHashes(userId);
    return res.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof ContactsError) return res.status(err.status).json({ ok: false, error: err.message });
    next(err);
  }
}

function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  const msg = err.message || 'Internal Server Error';
  console.error('[contactsRouter]', status, msg, err.stack);
  res.status(status).json({ ok: false, error: msg });
}

module.exports = { requestLogger, postHashes, deleteHashes, errorHandler };
