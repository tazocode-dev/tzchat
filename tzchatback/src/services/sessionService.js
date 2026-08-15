// src/services/sessionService.js
// ────────────────────────────────────────────────────────────
// 세션/토큰 도메인 서비스 (지침 §1: route에는 비즈니스 로직을 작성하지 않는다)
// - 자격 증명 검증, JWT 발급/검증, role 판별 등 순수 비즈니스 로직만 담당한다.
// - 쿠키 설정(res.cookie)이나 세션 regenerate 같은 Express 트랜스포트 관심사는
//   controllers/session.controller.js가 담당한다.
// ────────────────────────────────────────────────────────────

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User } = require('@/models');
const { JWT_SECRET } = require('@/config/secrets');

class SessionError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// 지침 §6: Access Token은 짧게, Refresh Token은 길게, 무기한 토큰 금지.
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '30d';
const COOKIE_NAME = process.env.JWT_COOKIE_NAME || 'tzchat.jwt';
const REFRESH_COOKIE_NAME = `${COOKIE_NAME}.refresh`;

function s(v) { return (v || '').toString().trim(); }

function resolveRole(u) {
  if (!u) return '';
  if (u.role) return String(u.role);
  if (Array.isArray(u.roles)) {
    if (u.roles.includes('master')) return 'master';
    if (u.roles.includes('admin')) return 'admin';
    if (u.roles.length > 0) return String(u.roles[0]);
  }
  if (u.username === 'master') return 'master';
  return 'user';
}
function resolveIsAdmin(u) {
  if (!u) return false;
  if (u.isAdmin === true) return true;
  const role = resolveRole(u);
  if (role === 'master' || role === 'admin') return true;
  if (Array.isArray(u.roles) && (u.roles.includes('master') || u.roles.includes('admin'))) return true;
  if (u.username === 'master') return true;
  return false;
}

function signToken(user) {
  return jwt.sign(
    { sub: String(user._id), nickname: user.nickname || '', type: 'access' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}
function signRefreshToken(user) {
  return jwt.sign(
    { sub: String(user._id), type: 'refresh' },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );
}
function msFromJwtExpiry(expr, fallbackMs) {
  const m = /^(\d+)([smhd])$/.exec(String(expr || '').trim());
  if (!m) return fallbackMs;
  const n = Number(m[1]);
  const unitMs = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2]];
  return n * unitMs;
}

function extractTokenFromReq(req, cookieName) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);

  const cookieHeader = req.headers.cookie || '';
  if (cookieHeader.includes(`${cookieName}=`)) {
    try {
      const target = cookieHeader
        .split(';')
        .map(v => v.trim())
        .find(v => v.startsWith(`${cookieName}=`));
      if (target) return decodeURIComponent(target.split('=')[1]);
    } catch (e) {
      console.log('[AUTH][DBG] 쿠키 파싱 실패:', e?.message);
    }
  }
  return null;
}

// ======================================================
// 로그인: 자격 증명 검증 + 토큰 발급
// ======================================================
async function authenticateUser(username, password) {
  const safeUsername = s(username);
  const user = await User.findOne({ username: safeUsername }).select('+password role roles username nickname');
  if (!user) {
    throw new SessionError(401, 'NO_USER', '아이디 없음');
  }

  const hashed = String(user.password || '');
  if (!hashed) {
    throw new SessionError(500, 'NO_PASSWORD_FIELD', '계정 비밀번호 필드를 찾을 수 없습니다.');
  }

  const isMatch = await bcrypt.compare(String(password || ''), hashed);
  if (!isMatch) {
    throw new SessionError(401, 'BAD_PASSWORD', '비밀번호 틀림');
  }

  // 로그인 시간 갱신(베스트 에포트)
  user.last_login = new Date();
  user.save().catch(() => {});

  const token = signToken(user);
  const refreshToken = signRefreshToken(user);
  const role = resolveRole(user);
  const roles = Array.isArray(user.roles) ? user.roles : (role ? [role] : []);
  const isAdmin = resolveIsAdmin(user);

  return { user, token, refreshToken, role, roles, isAdmin, expiresIn: JWT_EXPIRES_IN };
}

// ======================================================
// Refresh Token 검증 + Access Token 재발급
// ======================================================
async function rotateTokensFromRefresh(token) {
  if (!token) {
    throw new SessionError(401, 'no_refresh_token', '리프레시 토큰이 없습니다.');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    const code = e?.name === 'TokenExpiredError' ? 'refresh_token_expired' : 'refresh_token_invalid';
    throw new SessionError(401, code, '리프레시 토큰이 유효하지 않습니다.');
  }
  if (decoded.type !== 'refresh') {
    throw new SessionError(401, 'refresh_token_invalid', '리프레시 토큰이 유효하지 않습니다.');
  }

  const user = await User.findById(decoded.sub).select('nickname username role roles isAdmin');
  if (!user) {
    throw new SessionError(401, 'user_not_found', '사용자를 찾을 수 없습니다.');
  }

  const newAccessToken = signToken(user);
  const newRefreshToken = signRefreshToken(user);
  return { newAccessToken, newRefreshToken, expiresIn: JWT_EXPIRES_IN };
}

// ======================================================
// 세션/JWT 겸용 로그인 상태 조회 (하위호환 /userinfo)
// ======================================================
async function resolveUserInfo(req) {
  if (req.session?.user?._id) {
    return {
      via: 'session',
      uid: String(req.session.user._id),
      nickname: req.session.user.nickname || null,
    };
  }

  const token = extractTokenFromReq(req, COOKIE_NAME);
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const uid = String(decoded.sub || '');
      const u = await User.findById(uid).select('nickname');
      return { via: 'jwt', uid, nickname: u?.nickname || null };
    } catch (e) {
      // ignore: 토큰이 없거나 무효하면 비로그인으로 취급
    }
  }
  return { via: null, uid: null, nickname: null };
}

module.exports = {
  SessionError,
  JWT_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
  COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  msFromJwtExpiry,
  extractTokenFromReq,
  authenticateUser,
  rotateTokensFromRefresh,
  resolveUserInfo,
  // ✅ 이메일 인증 로그인(emailAuthService)이 동일한 JWT 발급 로직을 재사용하기 위해 export.
  //    (다른 로그인 수단이 추가돼도 토큰 payload/만료 규칙이 갈라지지 않도록 단일 진실 공급원 유지)
  signToken,
  signRefreshToken,
  resolveRole,
  resolveIsAdmin,
};
