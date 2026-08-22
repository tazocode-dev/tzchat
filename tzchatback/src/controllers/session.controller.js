// src/controllers/session.controller.js
// ────────────────────────────────────────────────────────────
// 세션/토큰 컨트롤러: 요청 파싱 + 쿠키/세션(Express 트랜스포트) 처리 + 응답 조립.
// 실제 인증 로직은 services/sessionService.js가 담당한다.
// ────────────────────────────────────────────────────────────

const {
  SessionError,
  COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  JWT_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
  msFromJwtExpiry,
  extractTokenFromReq,
  authenticateUser,
  rotateTokensFromRefresh,
  resolveUserInfo,
} = require('@/services/sessionService');
const {
  cleanupNativePushForLogout,
} = require('@/services/system/pushService');
const {
  LoginAttemptLimiter,
  normalizeLoginIp,
} = require('@/services/auth/loginAttemptLimiter');

const loginAttemptLimiter = new LoginAttemptLimiter();

function loginClientIp(req) {
  return normalizeLoginIp(req.ip || req.socket?.remoteAddress || '');
}

function respondLoginRateLimit(res, retryAfterSeconds) {
  res.setHeader('Retry-After', String(retryAfterSeconds));
  res.setHeader('Cache-Control', 'no-store');
  return res.status(429).json({
    ok: false,
    code: 'LOGIN_RATE_LIMITED',
    message: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  });
}

function setJwtCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    path: '/',
    maxAge: msFromJwtExpiry(JWT_EXPIRES_IN, 2 * 60 * 60 * 1000),
  });
}
function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    path: '/api/token/refresh',
    maxAge: msFromJwtExpiry(REFRESH_TOKEN_EXPIRES_IN, 30 * 24 * 60 * 60 * 1000),
  });
}

async function login(req, res) {
  const { username, password } = req.body || {};
  const clientIp = loginClientIp(req);
  const currentLimit = loginAttemptLimiter.check(clientIp, username);
  if (currentLimit.limited) {
    return respondLoginRateLimit(res, currentLimit.retryAfterSeconds);
  }
  console.log('[API][REQ] /login', {
    ua: req.get('user-agent'),
    origin: req.get('origin') || '(none)',
    hasCookie: !!req.headers.cookie,
  });

  try {
    const { user, token, refreshToken, role, roles, isAdmin, expiresIn } = await authenticateUser(username, password);
    loginAttemptLimiter.recordSuccess(clientIp, username);

    setJwtCookie(res, token);
    setRefreshCookie(res, refreshToken);

    if (req.session) {
      await new Promise((resolve, reject) => {
        req.session.regenerate(err => (err ? reject(err) : resolve()));
      });
      req.session.user = { _id: user._id, nickname: user.nickname };

      await new Promise((resolve, reject) => {
        req.session.save(err => (err ? reject(err) : resolve()));
      });
      console.log('[AUTH][SESSION] regenerated + saved', { sid: req.sessionID, userId: String(user._id) });
    }

    console.log('[API][RES] /login 200', { userId: String(user._id), role, isAdmin });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      message: '로그인 성공',
      nickname: user.nickname,
      username: user.username,
      role,
      roles,
      isAdmin,
      token,
      refreshToken,
      expiresIn,
    });
  } catch (err) {
    if (err instanceof SessionError) {
      if (err.code === 'INVALID_CREDENTIALS') {
        const failedLimit = loginAttemptLimiter.recordFailure(clientIp, username);
        if (failedLimit.limited) {
          return respondLoginRateLimit(res, failedLimit.retryAfterSeconds);
        }
      }
      console.log('[AUTH][ERR]', { step: 'login', code: err.code, message: err.message });
      return res.status(err.status).json({ ok: false, code: err.code, message: err.message });
    }
    console.log('[AUTH][ERR]', { step: 'login', message: err?.message });
    return res.status(500).json({ ok: false, message: '서버 오류' });
  }
}

async function logout(req, res) {
  const nativePushToken = String(req.body?.nativePushToken || '').trim();

  try {
    const auth = await resolveUserInfo(req);
    const userId = auth.uid || null;
    console.log('[API][REQ] /logout', { userId, hasNativePushToken: !!nativePushToken });
    // 세션/JWT가 아직 유효한 시점에 현재 기기 토큰만 해제한다.
    if (userId && nativePushToken) {
      try { await cleanupNativePushForLogout(userId, nativePushToken); }
      catch (error) { console.warn('[AUTH][LOGOUT] native push cleanup failed:', error?.message); }
    }
    res.clearCookie(COOKIE_NAME, { path: '/', sameSite: 'none', secure: true, httpOnly: true });
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/token/refresh', sameSite: 'none', secure: true, httpOnly: true });

    if (req.session) {
      await new Promise((resolve) => req.session.destroy(() => resolve()));
    }

    console.log('[API][RES] /logout 200');
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ ok: true, message: '로그아웃 완료' });
  } catch (err) {
    console.log('[AUTH][ERR]', { step: 'logout', message: err?.message });
    return res.status(500).json({ ok: false, message: '서버 오류' });
  }
}

async function refreshToken(req, res) {
  try {
    let token = (req.body && req.body.refreshToken) || null;
    if (!token) token = extractTokenFromReq(req, REFRESH_COOKIE_NAME);

    const { newAccessToken, newRefreshToken, expiresIn } = await rotateTokensFromRefresh(token);

    setJwtCookie(res, newAccessToken);
    setRefreshCookie(res, newRefreshToken);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, token: newAccessToken, refreshToken: newRefreshToken, expiresIn });
  } catch (err) {
    if (err instanceof SessionError) {
      return res.status(err.status).json({ ok: false, code: err.code, message: err.message });
    }
    console.log('[AUTH][ERR]', { step: 'token/refresh', message: err?.message });
    return res.status(500).json({ ok: false, message: '서버 오류' });
  }
}

async function userinfo(req, res) {
  try {
    const { via, uid, nickname } = await resolveUserInfo(req);
    if (!uid) {
      return res.json({ ok: true, loggedIn: false });
    }
    return res.json({ ok: true, loggedIn: true, via, userId: uid, nickname });
  } catch (err) {
    console.log('[AUTH][ERR]', { step: 'userinfo', message: err?.message });
    return res.status(500).json({ ok: false, message: '서버 오류' });
  }
}

module.exports = {
  login,
  logout,
  refreshToken,
  userinfo,
  // ✅ emailAuth.controller.js가 로그인 성공 시 동일한 쿠키 설정을 재사용하기 위해 export.
  setJwtCookie,
  setRefreshCookie,
  loginClientIp,
  respondLoginRateLimit,
};
