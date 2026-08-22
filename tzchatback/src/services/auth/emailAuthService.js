// backend/services/auth/emailAuthService.js
// ------------------------------------------------------------
// 이메일 인증번호 검증 성공 이후의 기존 계정 로그인 오케스트레이션 (지침 §1).
// - 인증번호 검증 자체는 emailVerificationService가 담당(이 파일은 호출만 한다).
// - 기존 회원(email 일치)만 로그인하며 신규 계정은 전화번호 인증으로만 생성한다.
// - JWT 발급은 sessionService.signToken/signRefreshToken을 그대로 재사용해
//   공통 authMiddleware/requireMaster와 호환되는 토큰을 만든다.
// - 클라이언트가 보낸 "인증 완료" 상태는 신뢰하지 않는다 — 여기서 서버가 직접
//   emailVerificationService.verifyCode()를 호출해 재검증한 뒤에만 로그인을 진행한다.
// ------------------------------------------------------------
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
const { throwIfAccountRestricted } = require('@/services/auth/accountStatusService');

class EmailAuthError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function findExistingUserByEmail(rawEmail, dependencies = {}) {
  const UserModel = dependencies.UserModel || User;
  const email = normalizeEmail(rawEmail);
  const forcedRole = getForcedAccountRole(email);
  const user = await UserModel.findOne({ email });

  if (!user) {
    // 인증번호 검증 뒤에도 계정 존재 여부를 세부적으로 설명하지 않는다.
    throw new EmailAuthError(401, 'EMAIL_LOGIN_UNAVAILABLE', '이메일로 로그인할 수 없습니다.');
  }

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

  return { user, isNewUser: false };
}

/**
 * 이메일 인증번호 검증 + 기존 계정 로그인 + JWT 발급을 한 번에 처리한다.
 * @param {{email:string, code:string}} params
 */
async function verifyAndLogin({ email, code }, dependencies = {}) {
  // ✅ 서버가 직접 재검증한다 — 프론트가 보낸 "인증됨" 상태는 신뢰하지 않는다.
  const verifyCodeFn = dependencies.verifyCodeFn || verifyCode;
  const findUserFn = dependencies.findExistingUserByEmailFn || findExistingUserByEmail;
  const { email: verifiedEmail } = await verifyCodeFn({ email, code }, dependencies);

  const { user, isNewUser } = await findUserFn(verifiedEmail, dependencies);
  throwIfAccountRestricted(user, EmailAuthError);

  user.last_login = new Date();
  await user.save().catch(() => {});

  const token = (dependencies.signTokenFn || signToken)(user);
  const refreshToken = (dependencies.signRefreshTokenFn || signRefreshToken)(user);
  const role = resolveRole(user);
  const roles = role ? [role] : [];
  const isAdmin = resolveIsAdmin(user);

  return { user, isNewUser, token, refreshToken, role, roles, isAdmin, expiresIn: JWT_EXPIRES_IN };
}

module.exports = { EmailAuthError, findExistingUserByEmail, verifyAndLogin };
