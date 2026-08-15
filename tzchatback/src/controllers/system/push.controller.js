// src/controllers/system/push.controller.js
// ────────────────────────────────────────────────────────────
// 디바이스 푸시 토큰 등록/해제 컨트롤러: 인증 헬퍼 + 로깅 + 응답 조립.
// 실제 로직은 services/system/pushService.js가 담당한다.
// ────────────────────────────────────────────────────────────

const { PushError, registerToken, unregisterToken } = require('@/services/system/pushService');

// 로그인 사용자 ID 헬퍼 (JWT 우선, 세션 백업)
function getMyId(req) {
  return (req?.user?._id && String(req.user._id))
      || (req?.session?.user?._id && String(req.session.user._id))
      || null;
}

// 공통 요청/응답 로깅 미들웨어
function requestLogger(req, res, next) {
  const started = Date.now();
  console.log('[API][REQ]', {
    path: req.baseUrl + req.path,
    method: req.method,
    params: req.params,
    query: req.query,
    userId: getMyId(req),
  });

  const _json = res.json.bind(res);
  res.json = (body) => {
    const ms = Date.now() - started;
    const status = res.statusCode;
    const size = typeof body === 'string' ? body.length : Buffer.byteLength(JSON.stringify(body || {}));
    console.log('[API][RES]', { path: req.baseUrl + req.path, status, ms, size });
    return _json(body);
  };
  next();
}

async function register(req, res) {
  const userId = getMyId(req);
  const { token, platform, appVersion } = req.body || {};
  const label = `[API] POST ${req.baseUrl}${req.path}`;

  if (!userId) {
    return res.status(401).json({ ok: false, message: '로그인이 필요합니다.' });
  }

  console.time(label);
  console.log('[PUSH][REQ]', {
    path: req.baseUrl + req.path,
    userId,
    platform,
    appVersion,
    hasToken: !!token,
  });

  try {
    await registerToken({ userId, token, platform, appVersion });
    console.timeEnd(label);
    return res.json({ ok: true });
  } catch (err) {
    console.timeEnd(label);
    if (err instanceof PushError) {
      console.warn('[PUSH][HTTP]', { path: req.baseUrl + req.path, status: err.status, reason: err.message });
      return res.status(err.status).json({ ok: false, ...err.payload });
    }
    console.error('[API][ERR]', { path: req.baseUrl + req.path, message: err?.message, name: err?.name });
    return res.status(500).json({ ok: false, error: 'server error' });
  }
}

async function unregister(req, res) {
  const userId = getMyId(req);
  const { token } = req.body || {};
  const label = `[API] POST ${req.baseUrl}${req.path}`;

  if (!userId) {
    return res.status(401).json({ ok: false, message: '로그인이 필요합니다.' });
  }

  console.time(label);
  console.log('[PUSH][REQ]', { path: req.baseUrl + req.path, userId, hasToken: !!token });

  try {
    await unregisterToken({ userId, token });
    console.timeEnd(label);
    return res.json({ ok: true });
  } catch (err) {
    console.timeEnd(label);
    if (err instanceof PushError) {
      console.warn('[PUSH][HTTP]', { path: req.baseUrl + req.path, status: err.status, reason: err.message });
      return res.status(err.status).json({ ok: false, ...err.payload });
    }
    console.error('[API][ERR]', { path: req.baseUrl + req.path, message: err?.message, name: err?.name });
    return res.status(500).json({ ok: false, error: 'server error' });
  }
}

module.exports = { requestLogger, register, unregister };
