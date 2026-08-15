// /middlewares/requireLogin.js
// ------------------------------------------------------------
// 하이브리드 인증 미들웨어 (세션 → JWT(Bearer/쿠키) → [옵션]X-User-Id)
// - 하위호환: req.session.user._id 유지
// - 공통 컨텍스트: req._uid, req.auth.userId 채움
// - 에러코드 표준화(no_token/token_expired/token_invalid)
// ------------------------------------------------------------
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('@/config/secrets');

const JWT_COOKIE_NAME = process.env.JWT_COOKIE_NAME || 'tzchat.jwt';
// 개발 편의 헤더 허용 (기본 비활성)
const ALLOW_DEV_X_USER_ID = process.env.ALLOW_DEV_X_USER_ID === 'true';

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.ip;
}
function extractJwtFromReq(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const cookieHeader = req.headers.cookie || '';
  if (cookieHeader && cookieHeader.includes(`${JWT_COOKIE_NAME}=`)) {
    try {
      const target = cookieHeader
        .split(';').map(v => v.trim())
        .find(v => v.startsWith(`${JWT_COOKIE_NAME}=`));
      if (target) return decodeURIComponent(target.split('=')[1]);
    } catch (e) {
      console.log('[AUTH][ERR]', { step: 'cookie-parse', message: e?.message });
    }
  }
  return null;
}
function pickUserId(decoded) {
  return String(decoded?.sub || decoded?.userId || decoded?.id || decoded?._id || '') || '';
}

module.exports = function requireLogin(req, res, next) {
  try {
    // (옵션) 개발 보조 헤더
    if (ALLOW_DEV_X_USER_ID) {
      const xuid = String(req.headers['x-user-id'] || '').trim();
      if (xuid) {
        req._uid = xuid;
        req.auth = Object.assign({}, req.auth, { userId: xuid, via: 'x-user-id' });
        if (req.session) {
          req.session.user = req.session.user || {};
          req.session.user._id = req.session.user._id || xuid;
        }
        console.log('[AUTH][REQ]', { path: req.originalUrl, via: 'x-user-id', userId: xuid, ip: clientIp(req) });
        return next();
      }
    }

    // 1) 세션 (레거시 우선)
    if (req.session?.user?._id) {
      const sid = String(req.session.user._id);
      req._uid = sid;
      req.auth = Object.assign({}, req.auth, { userId: sid, via: 'session' });
      console.log('[AUTH][REQ]', { path: req.originalUrl, via: 'session', userId: sid, ip: clientIp(req) });
      return next();
    }

    // 2) JWT
    const token = extractJwtFromReq(req);
    if (!token) {
      console.warn('[AUTH][ERR]', { step: 'extract', reason: 'no-session-and-no-token', path: req.originalUrl, ip: clientIp(req) });
      return res.status(401).json({ ok: false, code: 'no_token', error: '로그인이 필요합니다.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      const code = e?.name === 'TokenExpiredError' ? 'token_expired' : 'token_invalid';
      console.warn('[AUTH][ERR]', { step: 'verify', code, message: e?.message, path: req.originalUrl });
      return res.status(401).json({ ok: false, code, error: '토큰이 유효하지 않습니다.' });
    }

    const userId = pickUserId(decoded);
    if (!userId) {
      console.warn('[AUTH][ERR]', { step: 'decode', reason: 'no-sub-like', path: req.originalUrl });
      return res.status(401).json({ ok: false, code: 'token_no_subject', error: '토큰이 유효하지 않습니다.' });
    }

    // 세션 보조 주입(레거시 호환)
    if (req.session) {
      req.session.user = req.session.user || {};
      req.session.user._id = req.session.user._id || userId;
      if (!req.session.user.nickname && decoded?.nickname) {
        req.session.user.nickname = decoded.nickname;
      }
    }

    // 공통 컨텍스트
    req._uid = userId;
    req.auth = Object.assign({}, req.auth, { userId, via: 'jwt', token });

    console.log('[AUTH][REQ]', { path: req.originalUrl, via: 'jwt', userId, ip: clientIp(req), hasSessionObj: !!req.session });
    return next();
  } catch (err) {
    console.error('[AUTH][ERR]', { step: 'catch', name: err?.name, message: err?.message, path: req.originalUrl });
    return res.status(500).json({ ok: false, error: '서버 오류' });
  }
};
