// backend/services/auth/emailAuthService.js
// ------------------------------------------------------------
// 이메일 인증번호 검증 성공 이후의 로그인/회원가입 오케스트레이션 (지침 §1).
// - 인증번호 검증 자체는 emailVerificationService가 담당(이 파일은 호출만 한다).
// - 기존 회원(email 일치)이면 로그인, 신규 이메일이면 회원 생성 후 로그인.
// - JWT 발급은 sessionService.signToken/signRefreshToken을 그대로 재사용해
//   기존 requireLogin/authMiddleware/requireMaster와 100% 호환되는 토큰을 만든다.
// - 클라이언트가 보낸 "인증 완료" 상태는 신뢰하지 않는다 — 여기서 서버가 직접
//   emailVerificationService.verifyCode()를 호출해 재검증한 뒤에만 로그인/가입을 진행한다.
// ------------------------------------------------------------
const crypto = require('crypto');
const { User } = require('@/models');
const {
  signToken,
  signRefreshToken,
  resolveRole,
  resolveIsAdmin,
  JWT_EXPIRES_IN,
} = require('@/services/sessionService');
const { verifyCode } = require('@/services/auth/emailVerificationService');
const { normalizeEmail, getForcedAccountRole } = require('@/config/emailAuthPolicy');

class EmailAuthError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// 이메일 가입자에게 부여할 임시 닉네임. 프로필 화면에서 언제든 변경 가능(기존 기능, 여기선 건드리지 않음).
async function generateUniqueNickname(UserModel = User) {
  for (let i = 0; i < 5; i += 1) {
    const candidate = `user_${crypto.randomBytes(4).toString('hex')}`;
    const dup = await UserModel.findOne({ nickname: candidate }).select('_id').lean();
    if (!dup) return candidate;
  }
  // 극히 낮은 확률의 연속 충돌 — 마지막 안전망
  return `user_${crypto.randomBytes(6).toString('hex')}`;
}

async function findOrCreateUserByEmail(rawEmail, dependencies = {}) {
  const UserModel = dependencies.UserModel || User;
  const email = normalizeEmail(rawEmail);
  const forcedRole = getForcedAccountRole(email);
  let user = await UserModel.findOne({ email });
  let isNewUser = false;

  if (!user) {
    isNewUser = true;
    const nickname = await generateUniqueNickname(UserModel);
    user = await UserModel.create({
      email,
      emailVerifiedAt: new Date(),
      nickname,
      role: forcedRole || 'user',
      // signupUser()의 가입 보너스 정책과 동일하게 맞춤(회원가입 경로 일원화 목적은 아니며,
      // 신규 회원 기본값이 기존 정책과 어긋나지 않도록 최소한만 맞춘다)
      heart: 400,
      star: 0,
      ruby: 0,
    });
  } else {
    let changed = false;
    if (!user.emailVerifiedAt) {
      user.emailVerifiedAt = new Date();
      changed = true;
    }
    // 지정 테스트 계정은 DB의 과거 상태와 무관하게 정해진 권한으로 보정한다.
    if (forcedRole && user.role !== forcedRole) {
      user.role = forcedRole;
      changed = true;
    }
    if (changed) await user.save();
  }

  return { user, isNewUser };
}

/**
 * 이메일 인증번호 검증 + 로그인/가입 + JWT 발급을 한 번에 처리한다.
 * @param {{email:string, code:string}} params
 */
async function verifyAndLogin({ email, code }) {
  // ✅ 서버가 직접 재검증한다 — 프론트가 보낸 "인증됨" 상태는 신뢰하지 않는다.
  const { email: verifiedEmail } = await verifyCode({ email, code });

  const { user, isNewUser } = await findOrCreateUserByEmail(verifiedEmail);

  user.last_login = new Date();
  await user.save().catch(() => {});

  const token = signToken(user);
  const refreshToken = signRefreshToken(user);
  const role = resolveRole(user);
  const roles = Array.isArray(user.roles) ? user.roles : (role ? [role] : []);
  const isAdmin = resolveIsAdmin(user);

  return { user, isNewUser, token, refreshToken, role, roles, isAdmin, expiresIn: JWT_EXPIRES_IN };
}

module.exports = { EmailAuthError, findOrCreateUserByEmail, verifyAndLogin };
