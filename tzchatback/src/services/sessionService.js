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
const { throwIfAccountRestricted } = require('@/services/auth/accountStatusService');

const INVALID_CREDENTIALS = {
  status: 401,
  code: 'INVALID_CREDENTIALS',
  message: '아이디 또는 비밀번호가 올바르지 않습니다.',
};
// 존재하지 않는 계정도 bcrypt 검사를 수행해 공개 응답 시간 차이를 줄인다.
const DUMMY_PASSWORD_HASH = '$2b$10$rUaEz6LSXCHTXTgzgsWQsOHGgGMvwALtQDkJeo0l8FrYbCtqAW0Ti';

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
  return u.role === 'master' ? 'master' : 'user';
}
function resolveIsAdmin(u) {
  return resolveRole(u) === 'master';
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
async function authenticateUser(username, password, dependencies = {}) {
  const safeUsername = s(username).slice(0, 128);
  const UserModel = dependencies.UserModel || User;
  const user = await UserModel.findOne({ username: safeUsername })
    .select('+password role username nickname suspended status deletionDueAt isDeleted');
  const hashed = String(user?.password || '');
  let isMatch = false;
  try {
    isMatch = await (dependencies.comparePasswordFn || bcrypt.compare)(
      String(password || ''),
      hashed || DUMMY_PASSWORD_HASH,
    );
  } catch {}
  if (!user || !hashed || !isMatch) {
    throw new SessionError(
      INVALID_CREDENTIALS.status,
      INVALID_CREDENTIALS.code,
      INVALID_CREDENTIALS.message,
    );
  }
  throwIfAccountRestricted(user, SessionError);

  // 로그인 시간 갱신(베스트 에포트)
  user.last_login = new Date();
  user.save().catch(() => {});

  const token = (dependencies.signTokenFn || signToken)(user);
  const refreshToken = (dependencies.signRefreshTokenFn || signRefreshToken)(user);
  const role = resolveRole(user);
  const roles = role ? [role] : [];
  const isAdmin = resolveIsAdmin(user);

  return { user, token, refreshToken, role, roles, isAdmin, expiresIn: JWT_EXPIRES_IN };
}

// ======================================================
// Refresh Token 검증 + Access Token 재발급
// ======================================================
async function rotateTokensFromRefresh(token, dependencies = {}) {
  if (!token) {
    throw new SessionError(401, 'no_refresh_token', '리프레시 토큰이 없습니다.');
  }

  let decoded;
  try {
    decoded = (dependencies.verifyTokenFn || jwt.verify)(token, JWT_SECRET);
  } catch (e) {
    const code = e?.name === 'TokenExpiredError' ? 'refresh_token_expired' : 'refresh_token_invalid';
    throw new SessionError(401, code, '리프레시 토큰이 유효하지 않습니다.');
  }
  if (decoded.type !== 'refresh') {
    throw new SessionError(401, 'refresh_token_invalid', '리프레시 토큰이 유효하지 않습니다.');
  }

  const UserModel = dependencies.UserModel || User;
  const user = await UserModel.findById(decoded.sub)
    .select('nickname username role suspended status deletionDueAt isDeleted');
  if (!user) {
    throw new SessionError(401, 'user_not_found', '사용자를 찾을 수 없습니다.');
  }
  throwIfAccountRestricted(user, SessionError);

  const newAccessToken = (dependencies.signTokenFn || signToken)(user);
  const newRefreshToken = (dependencies.signRefreshTokenFn || signRefreshToken)(user);
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
