const crypto = require('crypto');
const { User } = require('@/models');
const {
  signToken,
  signRefreshToken,
  resolveRole,
  resolveIsAdmin,
  JWT_EXPIRES_IN,
} = require('@/services/sessionService');
const { verifyCode } = require('@/services/auth/phoneVerificationService');
const { getForcedPhoneRole } = require('@/config/phoneAuthPolicy');

class PhoneAuthError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function generateUniqueNickname(UserModel = User) {
  for (let index = 0; index < 5; index += 1) {
    const candidate = `user_${crypto.randomBytes(4).toString('hex')}`;
    const duplicate = await UserModel.findOne({ nickname: candidate }).select('_id').lean();
    if (!duplicate) return candidate;
  }
  return `user_${crypto.randomBytes(6).toString('hex')}`;
}

async function findLegacyPhoneUsers(UserModel, phone) {
  const query = UserModel.find({ phone });
  if (typeof query.limit === 'function') return query.limit(2);
  return query;
}

async function findOrCreateUserByPhone(phone, dependencies = {}) {
  const UserModel = dependencies.UserModel || User;
  const forcedRole = getForcedPhoneRole(phone);
  let user = await UserModel.findOne({ loginPhone: phone });
  let isNewUser = false;

  if (!user) {
    const legacyUsers = await findLegacyPhoneUsers(UserModel, phone);
    if (legacyUsers.length > 1) {
      throw new PhoneAuthError(409, 'PHONE_ACCOUNT_AMBIGUOUS', '같은 전화번호를 사용하는 계정이 여러 개입니다. 관리자에게 문의해주세요.');
    }
    user = legacyUsers[0] || null;
  }

  if (!user) {
    isNewUser = true;
    user = await UserModel.create({
      loginPhone: phone,
      phone,
      phoneVerifiedAt: new Date(),
      phoneVerifiedBy: 'SMS_LOGIN',
      nickname: await generateUniqueNickname(UserModel),
      role: forcedRole || 'user',
      heart: 400,
      star: 0,
      ruby: 0,
    });
  } else {
    let changed = false;
    if (!user.loginPhone) { user.loginPhone = phone; changed = true; }
    if (!user.phoneVerifiedAt) { user.phoneVerifiedAt = new Date(); changed = true; }
    if (!user.phoneVerifiedBy) { user.phoneVerifiedBy = 'SMS_LOGIN'; changed = true; }
    if (forcedRole && user.role !== forcedRole) { user.role = forcedRole; changed = true; }
    if (changed) {
      try {
        await user.save();
      } catch (error) {
        if (error?.code === 11000) {
          throw new PhoneAuthError(409, 'PHONE_ACCOUNT_CONFLICT', '이미 다른 계정에 연결된 전화번호입니다.');
        }
        throw error;
      }
    }
  }

  return { user, isNewUser };
}

async function verifyAndLogin({ phone, code }) {
  const verified = await verifyCode({ phone, code });
  const { user, isNewUser } = await findOrCreateUserByPhone(verified.phone);
  user.last_login = new Date();
  await user.save().catch(() => {});

  const token = signToken(user);
  const refreshToken = signRefreshToken(user);
  const role = resolveRole(user);
  const roles = Array.isArray(user.roles) ? user.roles : (role ? [role] : []);
  const isAdmin = resolveIsAdmin(user);
  return { user, isNewUser, token, refreshToken, role, roles, isAdmin, expiresIn: JWT_EXPIRES_IN };
}

module.exports = { PhoneAuthError, findOrCreateUserByPhone, verifyAndLogin };
