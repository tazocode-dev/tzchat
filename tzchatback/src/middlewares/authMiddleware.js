// /middlewares/authMiddleware.js
// ------------------------------------------------------------
// 인증 + 사용자 로드 미들웨어
// - 세션/JWT로 userId 식별 → DB 조회 → req.user 주입
// - 공통 컨텍스트: req._uid, req.auth.userId
// - ✅ 공개(무인증) 경로 화이트리스트 추가: 로그인/헬스체크 등
// - ✅ CORS 사전요청(OPTIONS) 통과
// ------------------------------------------------------------
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('@/config/secrets');
const { getForcedAccountRole } = require('@/config/emailAuthPolicy');
const { getForcedPhoneRole } = require('@/config/phoneAuthPolicy');
const { getAccountRestriction } = require('@/services/auth/accountStatusService');

const JWT_COOKIE_NAME = process.env.JWT_COOKIE_NAME || 'tzchat.jwt';

// ✅ 무인증(오픈) 경로: 인증 없이 통과
//    - login: 하위 호환 아이디·비밀번호 로그인
//    - health: 헬스체크
const OPEN_PATHS = [
  /^\/api\/login(?:\/|$)/,
  /^\/api\/token\/refresh(?:\/|$)/, // refresh token 자체는 access token 없이도 호출 가능해야 함

  /^\/api\/health(?:\/|$)/,
  /^\/healthz(?:\/|$)/,
];

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
  throw new Error('[authMiddleware] User 모델을 찾을 수 없습니다.');
})();

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
    } catch {}
  }
  return null;
}

function pickUserId(decoded) {
  return String(decoded?.sub || decoded?.userId || decoded?.id || decoded?._id || '') || '';
}

function createAuthMiddleware({ allowPendingDeletion = false, UserModel = User, verifyTokenFn = jwt.verify } = {}) {
  return async function authMiddleware(req, res, next) {
    try {
      const url = req.originalUrl || req.url || '';

      // 상위 라우터에서 같거나 더 엄격한 계정 제한 검사까지 끝난 경우만 DB 조회를 생략한다.
      const priorRestrictionPolicy = req.auth?.accountRestrictionPolicy;
      const canReuseLoadedUser = priorRestrictionPolicy === 'default' ||
        (allowPendingDeletion && priorRestrictionPolicy === 'pending-allowed');
      if (req.user?._id && req.auth?.userId && canReuseLoadedUser) return next();

      // ✅ CORS preflight는 통과
      if (req.method === 'OPTIONS') return next();

      // ✅ 공개 경로는 인증 없이 통과
      if (OPEN_PATHS.some(rx => rx.test(url))) return next();

      // 1) 세션 기반 우선
      let userId = req.session?.user?._id ? String(req.session.user._id) : '';

      // 2) JWT (세션 없을 때)
      if (!userId) {
        const token = extractJwtFromReq(req);
        if (!token) {
          return res.status(401).json({ ok: false, code: 'no_token', error: '로그인이 필요합니다.' });
        }

        let decoded;
        try {
          decoded = verifyTokenFn(token, JWT_SECRET);
        } catch (e) {
          const code = e?.name === 'TokenExpiredError' ? 'token_expired' : 'token_invalid';
          return res.status(401).json({ ok: false, code, error: '토큰이 유효하지 않습니다.' });
        }

        userId = pickUserId(decoded);
        if (!userId) {
          return res.status(401).json({ ok: false, code: 'token_no_subject', error: '토큰이 유효하지 않습니다.' });
        }

        // (선택) 세션 보조 주입
        if (req.session) {
          req.session.user = req.session.user || {};
          req.session.user._id = req.session.user._id || userId;
        }
        req.auth = Object.assign({}, req.auth, { userId, via: 'jwt' });
      } else {
        req.auth = Object.assign({}, req.auth, { userId, via: 'session' });
      }

      // 3) 사용자 로드
      const query = UserModel.findById(userId)
        .select('_id username nickname role email phone birthDate birthyear gender profileOnboardingCompletedAt suspended status deletionDueAt isDeleted');
      const me = typeof query.lean === 'function' ? await query.lean() : await query;
      if (!me) {
        return res.status(404).json({ ok: false, error: '사용자를 찾을 수 없습니다.' });
      }

      const restriction = getAccountRestriction(me, { allowPendingDeletion });
      if (restriction) {
        return res.status(restriction.status).json({
          ok: false,
          code: restriction.code,
          error: restriction.message,
        });
      }

      // 지정 테스트 계정은 기존 토큰/세션으로 접근해도 DB와 현재 요청 권한을 보정한다.
      const forcedRole = getForcedPhoneRole(me.phone) || getForcedAccountRole(me.email);
      if (forcedRole && me.role !== forcedRole) {
        await UserModel.updateOne({ _id: me._id }, { $set: { role: forcedRole } });
        me.role = forcedRole;
      }

      // 4) 컨텍스트 주입
      req._uid = String(me._id);
      req.user = me;
      req.auth = Object.assign({}, req.auth, {
        userId: String(me._id),
        accountRestrictionPolicy: allowPendingDeletion ? 'pending-allowed' : 'default',
      });

      return next();
    } catch (err) {
      console.error('[AUTH][ERR]', {
        step: 'authMiddleware.catch',
        name: err?.name,
        message: err?.message,
        path: req.path || '/',
      });
      return res.status(500).json({ ok: false, error: '서버 오류' });
    }
  }
}

const authMiddleware = createAuthMiddleware();
authMiddleware.allowPendingDeletion = createAuthMiddleware({ allowPendingDeletion: true });
authMiddleware.createAuthMiddleware = createAuthMiddleware;

module.exports = authMiddleware;
