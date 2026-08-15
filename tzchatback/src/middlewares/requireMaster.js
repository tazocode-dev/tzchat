// /middlewares/requireMaster.js
// ------------------------------------------------------------
// 관리자 가드 (세션/JWT/선행컨텍스트 통합)
// - userId 해석 우선순위 통일 + X-User-Id는 옵션
// - 허용역할: master/admin/owner/superadmin 또는 isAdmin/isMaster/permissions
// ------------------------------------------------------------
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('@/config/secrets');
const { getForcedAccountRole } = require('@/config/emailAuthPolicy');
const { getForcedPhoneRole } = require('@/config/phoneAuthPolicy');

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
  const allowed = new Set(['master', 'admin', 'owner', 'superadmin']);
  const role = String(user?.role || '').toLowerCase();
  if (allowed.has(role)) return true;

  const roles = Array.isArray(user?.roles) ? user.roles.map(r => String(r).toLowerCase()) : [];
  if (roles.some(r => allowed.has(r))) return true;

  if (user?.isAdmin === true || user?.isMaster === true) return true;

  const perms = Array.isArray(user?.permissions) ? user.permissions.map(p => String(p).toLowerCase()) : [];
  if (perms.includes('admin') || perms.includes('master')) return true;

  return false;
}

module.exports = async function requireMaster(req, res, next) {
  const t0 = Date.now();
  try {
    const { userId, via } = resolveUserId(req);

    if (!userId) {
      console.warn('[AUTH][ERR]', { step: 'requireMaster.auth', code: 401, via, path: req.originalUrl, ip: clientIp(req) });
      return res.status(401).json({ ok: false, error: '로그인이 필요합니다.' });
    }

    const me = await User.findById(userId).select('_id role roles permissions isAdmin isMaster nickname username email phone');
    if (!me) {
      console.warn('[AUTH][ERR]', { step: 'requireMaster.findUser', code: 404, uid: userId, path: req.originalUrl });
      return res.status(404).json({ ok: false, error: '사용자를 찾을 수 없습니다.' });
    }

    // 지정 테스트 계정은 이전 세션이나 기존 DB 계정이어도 관리자 요청 시 즉시 보정한다.
    const forcedRole = getForcedPhoneRole(me.phone) || getForcedAccountRole(me.email);
    if (forcedRole && String(me.role || '').toLowerCase() !== forcedRole) {
      me.role = forcedRole;
      await me.save();
    }

    if (!hasMasterPrivilege(me)) {
      console.warn('[AUTH][ERR]', {
        step: 'requireMaster.role', code: 403, uid: String(me._id),
        role: me.role, roles: me.roles, isAdmin: me.isAdmin, isMaster: me.isMaster,
        path: req.originalUrl
      });
      return res.status(403).json({ ok: false, error: '관리자 권한이 필요합니다.' });
    }

    // 컨텍스트 일관화
    req._uid = String(me._id);
    req.user = me;
    req.auth = Object.assign({}, req.auth, { userId: String(me._id), via, role: 'master' });

    console.log('[AUTH]', {
      step: 'requireMaster.ok', uid: String(me._id), role: me.role, roles: me.roles,
      isAdmin: me.isAdmin, isMaster: me.isMaster, via, path: req.originalUrl, ms: Date.now() - t0
    });
    return next();
  } catch (err) {
    console.error('[AUTH][ERR]', { step: 'requireMaster.catch', name: err?.name, message: err?.message, path: req.originalUrl });
    return res.status(500).json({ ok: false, error: '서버 오류' });
  }
};
