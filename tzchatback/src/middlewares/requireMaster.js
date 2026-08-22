// /middlewares/requireMaster.js
// ------------------------------------------------------------
// 관리자 가드 (세션/JWT/선행컨텍스트 통합)
// - userId 해석 우선순위 통일 + X-User-Id는 옵션
// - 허용 역할: User.role === 'master'
// ------------------------------------------------------------
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('@/config/secrets');
const { getForcedAccountRole } = require('@/config/emailAuthPolicy');
const { getForcedPhoneRole } = require('@/config/phoneAuthPolicy');
const { getAccountRestriction } = require('@/services/auth/accountStatusService');

const JWT_COOKIE_NAME = process.env.JWT_COOKIE_NAME || 'tzchat.jwt';
const ALLOW_DEV_X_USER_ID = process.env.ALLOW_DEV_X_USER_ID === 'true';

// 안전한 User 모델 로딩
let User;
(() => {
  try {
    const models = require('@/models');
    if (models?.User) { User = models.User; return; }
  } catch {}
  const candidates = [
    '../models/user/User', '../models/user/user',
    '../models/User/User', '../models/User/user',
    '../models/User', '../models/user',
  ];
  for (const p of candidates) {
    try {
      const mod = require(p);
      User = mod?.User || mod?.default || mod;
      if (User) return;
    } catch {}
  }
  throw new Error('[requireMaster] User 모델을 찾을 수 없습니다. alias/경로 확인');
})();

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.ip;
}
function extractJwtFromReq(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const xTok = req.headers['x-access-token'];
  if (typeof xTok === 'string' && xTok.trim()) return xTok.trim();
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
function getUserIdFromJwt(req) {
  const token = extractJwtFromReq(req);
  if (!token) return { userId: '', via: 'none' };
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = pickUserId(decoded);
    if (!userId) return { userId: '', via: 'jwt_invalid' };
    req.auth = Object.assign({}, req.auth, { userId, via: 'jwt', token });
    return { userId, via: 'jwt' };
  } catch (e) {
    console.log('[AUTH][ERR]', { step: 'jwt-verify', message: e?.message });
    return { userId: '', via: 'jwt_invalid' };
  }
}
function resolveUserId(req) {
  if (req._uid) return { userId: String(req._uid), via: 'ctx_uid' };
  if (req.auth?.userId) return { userId: String(req.auth.userId), via: 'ctx_auth' };
  if (req.user?._id) return { userId: String(req.user._id), via: 'ctx_user' };

  const sessUser = req.session?.user;
  const sid = sessUser?.__id || sessUser?._id || sessUser?.id;
  if (sid) return { userId: String(sid), via: 'session' };

  if (ALLOW_DEV_X_USER_ID) {
    const xUid = String(req.headers['x-user-id'] || '').trim();
    if (xUid) return { userId: xUid, via: 'x-user-id' };
  }

  return getUserIdFromJwt(req);
}
function hasMasterPrivilege(user) {
  return user?.role === 'master';
}

module.exports = async function requireMaster(req, res, next) {
  const t0 = Date.now();
  try {
    const { userId, via } = resolveUserId(req);

    if (!userId) {
      console.warn('[AUTH][ERR]', { step: 'requireMaster.auth', code: 401, via, path: req.path || '/', ip: clientIp(req) });
      return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });
    }

    const me = await User.findById(userId)
      .select('_id role nickname email phone suspended status deletionDueAt isDeleted');
    if (!me) {
      console.warn('[AUTH][ERR]', { step: 'requireMaster.findUser', code: 404, uid: userId, path: req.path || '/' });
      return res.status(404).json({ ok: false, error: '사용자를 찾을 수 없습니다.' });
    }

    const restriction = getAccountRestriction(me);
    if (restriction) {
      return res.status(restriction.status).json({
        ok: false,
        code: restriction.code,
        error: restriction.message,
      });
    }

    // 지정 테스트 계정은 이전 세션이나 기존 DB 계정이어도 관리자 요청 시 즉시 보정한다.
    const forcedRole = getForcedPhoneRole(me.phone) || getForcedAccountRole(me.email);
    if (forcedRole && me.role !== forcedRole) {
      me.role = forcedRole;
      await me.save();
    }

    if (!hasMasterPrivilege(me)) {
      console.warn('[AUTH][ERR]', {
        step: 'requireMaster.role', code: 403, uid: String(me._id),
        role: me.role,
        path: req.path || '/',
      });
      return res.status(403).json({ ok: false, error: '관리자 권한이 필요합니다.' });
    }

    // 컨텍스트 일관화
    req._uid = String(me._id);
    req.user = me;
    req.auth = Object.assign({}, req.auth, { userId: String(me._id), via, role: 'master' });

    console.log('[AUTH]', {
      step: 'requireMaster.ok', uid: String(me._id), role: me.role,
      via, path: req.path || '/', ms: Date.now() - t0,
    });
    return next();
  } catch (err) {
    console.error('[AUTH][ERR]', { step: 'requireMaster.catch', name: err?.name, message: err?.message, path: req.path || '/' });
    return res.status(500).json({ ok: false, error: '서버 오류' });
  }
};

module.exports.hasMasterPrivilege = hasMasterPrivilege;
