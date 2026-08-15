const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { AccountVerification, User } = require('@/models');
const { sendMail } = require('@/services/mail/tzmailClient');
const { sendVerificationSms } = require('@/services/sms/tzphoneClient');
const { normalizeEmail } = require('@/config/emailAuthPolicy');

const EXPIRES_MINUTES = 5;
const RESEND_SECONDS = 60;
const MAX_ATTEMPTS = 5;
const MAX_REQUESTS_PER_HOUR = 10;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PUBLIC_PHONE_CHANGE_ACCEPTED = Object.freeze({
  accepted: true,
  expiresInSeconds: EXPIRES_MINUTES * 60,
  resendAfterSeconds: RESEND_SECONDS,
});

class AccountVerificationError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    Object.assign(this, extra);
  }
}

function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function normalizePhoneKR(raw = '') {
  const clean = String(raw || '').replace(/[^\d+]/g, '');
  if (!clean) return '';
  let normalized = clean;
  if (clean.startsWith('0')) normalized = `+82${clean.slice(1)}`;
  else if (clean.startsWith('82')) normalized = `+${clean}`;
  else if (!clean.startsWith('+')) normalized = `+82${clean}`;
  return /^\+8210\d{8}$/.test(normalized) ? normalized : '';
}

function maskEmail(email = '') {
  const [local, domain] = String(email).split('@');
  if (!local || !domain) return '';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

function maskPhone(phone = '') {
  const value = String(phone || '');
  const local = value.startsWith('+82') ? `0${value.slice(3)}` : value.replace(/\D/g, '');
  return local.length === 11 ? `${local.slice(0, 3)}-****-${local.slice(-4)}` : '';
}

async function getUser(userId, UserModel = User) {
  const user = await UserModel.findById(userId).select('email emailVerifiedAt phone phoneVerifiedAt +loginPhone');
  if (!user) throw new AccountVerificationError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
  return user;
}

async function createChallenge({ userId, channel, purpose, destination, ip, code, sendFn, VerificationModel }) {
  const Model = VerificationModel || AccountVerification;
  const query = { userId, purpose, destination };
  const last = await Model.findOne(query).sort({ createdAt: -1 }).select('createdAt');
  if (last) {
    const elapsed = (Date.now() - last.createdAt.getTime()) / 1000;
    if (elapsed < RESEND_SECONDS) {
      throw new AccountVerificationError(429, 'RESEND_TOO_SOON', '잠시 후 다시 시도해주세요.', {
        retryAfterSeconds: Math.ceil(RESEND_SECONDS - elapsed),
      });
    }
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const count = await Model.countDocuments({ userId, createdAt: { $gte: hourAgo } });
  if (count >= MAX_REQUESTS_PER_HOUR) {
    throw new AccountVerificationError(429, 'TOO_MANY_REQUESTS', '인증 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
  }

  await Model.updateMany({ ...query, used: false }, { $set: { used: true, usedAt: new Date() } });
  const codeHash = await bcrypt.hash(code, 10);
  const doc = await Model.create({
    userId,
    channel,
    purpose,
    destination,
    codeHash,
    expiresAt: new Date(Date.now() + EXPIRES_MINUTES * 60 * 1000),
    ip: ip || '',
  });

  try {
    await sendFn(code);
  } catch (error) {
    await Model.deleteOne({ _id: doc._id }).catch(() => null);
    if (error?.code === 'ENV_MISSING') {
      throw new AccountVerificationError(503, 'PROVIDER_NOT_CONFIGURED', '인증 발송 설정을 확인해주세요.');
    }
    throw new AccountVerificationError(
      502,
      channel === 'email' ? 'EMAIL_DELIVERY_FAILED' : 'SMS_DELIVERY_FAILED',
      channel === 'email' ? '인증 메일 발송에 실패했습니다.' : '인증 문자 발송에 실패했습니다.'
    );
  }

  return { expiresInSeconds: EXPIRES_MINUTES * 60, resendAfterSeconds: RESEND_SECONDS };
}

async function sendEmailChallenge({ userId, purpose, destination, ip }, dependencies = {}) {
  const code = generateCode();
  const result = await createChallenge({
    userId,
    channel: 'email',
    purpose,
    destination,
    ip,
    code,
    VerificationModel: dependencies.VerificationModel,
    sendFn: async (plainCode) => {
      const mailFn = dependencies.sendMailFn || sendMail;
      await mailFn({
        to: destination,
        subject: 'TZChat 계정정보 변경 인증번호',
        text: `TZChat 인증번호는 ${plainCode}입니다. ${EXPIRES_MINUTES}분 이내에 입력해주세요.`,
        html: `<p>TZChat 인증번호는 <strong>${plainCode}</strong>입니다.</p><p>${EXPIRES_MINUTES}분 이내에 입력해주세요.</p>`,
      });
    },
  });
  return { ...result, sent: true, reviewLogin: false };
}

async function requestEmailCode({ userId, kind, newEmail, ip }, dependencies = {}) {
  const UserModel = dependencies.UserModel || User;
  const user = await getUser(userId, UserModel);

  if (kind === 'current') {
    if (!user.email || !user.emailVerifiedAt) {
      throw new AccountVerificationError(409, 'EMAIL_NOT_VERIFIED', '먼저 이메일 인증을 완료해주세요.');
    }
    return sendEmailChallenge({
      userId,
      purpose: 'email_change_current',
      destination: normalizeEmail(user.email),
      ip,
    }, dependencies);
  }

  if (kind !== 'new') {
    throw new AccountVerificationError(400, 'INVALID_KIND', '인증 요청 종류가 올바르지 않습니다.');
  }
  const email = normalizeEmail(newEmail);
  if (!EMAIL_REGEX.test(email) || email.length > 320) {
    throw new AccountVerificationError(400, 'INVALID_EMAIL', '올바른 이메일 형식이 아닙니다.');
  }
  if (normalizeEmail(user.email) === email) {
    throw new AccountVerificationError(409, 'SAME_EMAIL', '현재 이메일과 다른 이메일을 입력해주세요.');
  }
  const duplicate = await UserModel.findOne({ email, _id: { $ne: userId } }).select('_id').lean();
  if (duplicate) throw new AccountVerificationError(409, 'EMAIL_IN_USE', '이미 사용 중인 이메일입니다.');

  return sendEmailChallenge({
    userId,
    purpose: user.emailVerifiedAt ? 'email_change_new' : 'email_verify_new',
    destination: email,
    ip,
  }, dependencies);
}

async function requestPhoneEmailCode({ userId, ip }, dependencies = {}) {
  const user = await getUser(userId, dependencies.UserModel || User);
  if (!user.email || !user.emailVerifiedAt) {
    throw new AccountVerificationError(409, 'EMAIL_NOT_VERIFIED', '전화번호를 변경하려면 먼저 이메일 인증이 필요합니다.');
  }
  return sendEmailChallenge({
    userId,
    purpose: 'phone_change_email',
    destination: normalizeEmail(user.email),
    ip,
  }, dependencies);
}

async function requestPhoneSmsCode({ userId, newPhone, ip }, dependencies = {}) {
  const user = await getUser(userId, dependencies.UserModel || User);
  const changingVerifiedPhone = !!user.phone && !!user.phoneVerifiedAt;
  if (changingVerifiedPhone && (!user.email || !user.emailVerifiedAt)) {
    throw new AccountVerificationError(409, 'EMAIL_NOT_VERIFIED', '전화번호를 변경하려면 먼저 이메일 인증이 필요합니다.');
  }
  const phone = normalizePhoneKR(newPhone);
  if (!phone) throw new AccountVerificationError(400, 'INVALID_PHONE', '010으로 시작하는 휴대전화 번호를 입력해주세요.');
  if (phone === user.phone) throw new AccountVerificationError(409, 'SAME_PHONE', '현재 전화번호와 다른 번호를 입력해주세요.');
  const code = generateCode();
  const result = await createChallenge({
    userId,
    channel: 'sms',
    purpose: 'phone_change_sms',
    destination: phone,
    ip,
    code,
    VerificationModel: dependencies.VerificationModel,
    sendFn: (plainCode) => (dependencies.sendSmsFn || sendVerificationSms)({ phone, code: plainCode }),
  });
  return { ...result, sent: true, testPhone: false };
}

function validatePublicPhoneChangeIdentity({ currentPhone, currentEmail, newPhone }) {
  const phone = normalizePhoneKR(currentPhone);
  const email = normalizeEmail(currentEmail);
  if (!phone) throw new AccountVerificationError(400, 'INVALID_PHONE', '기존 전화번호 형식을 확인해주세요.');
  if (!EMAIL_REGEX.test(email) || email.length > 320) {
    throw new AccountVerificationError(400, 'INVALID_EMAIL', '올바른 이메일 형식이 아닙니다.');
  }
  if (newPhone === undefined) return { phone, email };
  const nextPhone = normalizePhoneKR(newPhone);
  if (!nextPhone) throw new AccountVerificationError(400, 'INVALID_NEW_PHONE', '새 전화번호 형식을 확인해주세요.');
  return { phone, email, nextPhone };
}

async function findPublicPhoneChangeUser({ phone, email }, UserModel = User) {
  const user = await UserModel.findOne({ loginPhone: phone, email })
    .select('email emailVerifiedAt phone phoneVerifiedAt +loginPhone');
  if (!user || !user.emailVerifiedAt || !user.phoneVerifiedAt || user.phone !== phone) return null;
  return user;
}

async function publicPhoneChangeDuplicate(UserModel, userId, nextPhone) {
  const duplicate = await UserModel.findOne({ loginPhone: nextPhone, _id: { $ne: userId } }).select('_id').lean();
  return Boolean(duplicate);
}

async function requestPublicPhoneChangeEmailCode({ currentPhone, currentEmail, ip }, dependencies = {}) {
  const UserModel = dependencies.UserModel || User;
  const identity = validatePublicPhoneChangeIdentity({ currentPhone, currentEmail });
  const user = await findPublicPhoneChangeUser(identity, UserModel);
  if (!user) return { ...PUBLIC_PHONE_CHANGE_ACCEPTED };

  try {
    await sendEmailChallenge({
      userId: user._id,
      purpose: 'public_phone_change_email',
      destination: identity.email,
      ip,
    }, dependencies);
  } catch (error) {
    // 공개 화면에서는 계정 존재 여부를 발송 성공/실패 차이로 노출하지 않는다.
    if (!(error instanceof AccountVerificationError)) throw error;
  }
  return { ...PUBLIC_PHONE_CHANGE_ACCEPTED };
}

async function requestPublicPhoneChangeSmsCode({ currentPhone, currentEmail, newPhone, emailCode, ip }, dependencies = {}) {
  const UserModel = dependencies.UserModel || User;
  const VerificationModel = dependencies.VerificationModel || AccountVerification;
  const identity = validatePublicPhoneChangeIdentity({ currentPhone, currentEmail, newPhone });
  const user = await findPublicPhoneChangeUser(identity, UserModel);
  if (!user || identity.nextPhone === identity.phone) return { ...PUBLIC_PHONE_CHANGE_ACCEPTED };
  if (await publicPhoneChangeDuplicate(UserModel, user._id, identity.nextPhone)) {
    return { ...PUBLIC_PHONE_CHANGE_ACCEPTED };
  }

  try {
    // 새 번호 문자 발송 자체가 계정 존재 여부의 오라클이 되지 않도록 기존 이메일 코드를 먼저 확인한다.
    // 여기서는 소비하지 않고 최종 변경 성공 시 문자 코드와 함께 소비한다.
    await assertCode({
      userId: user._id,
      purpose: 'public_phone_change_email',
      destination: identity.email,
      code: emailCode,
    }, VerificationModel);
    const code = generateCode();
    await createChallenge({
      userId: user._id,
      channel: 'sms',
      purpose: 'public_phone_change_sms',
      destination: identity.nextPhone,
      ip,
      code,
      VerificationModel,
      sendFn: (plainCode) => (dependencies.sendSmsFn || sendVerificationSms)({ phone: identity.nextPhone, code: plainCode }),
    });
  } catch (error) {
    // 계정 불일치, 번호 충돌, 재발송 제한 및 공급자 상태를 같은 공개 응답으로 처리한다.
    if (!(error instanceof AccountVerificationError)) throw error;
  }
  return { ...PUBLIC_PHONE_CHANGE_ACCEPTED };
}

async function assertCode({ userId, purpose, destination, code }, VerificationModel = AccountVerification) {
  const value = String(code || '').trim();
  if (!/^\d{6}$/.test(value)) {
    throw new AccountVerificationError(400, 'INVALID_CODE_FORMAT', '인증번호는 6자리 숫자입니다.');
  }
  const doc = await VerificationModel.findOne({ userId, purpose, destination, used: false })
    .sort({ createdAt: -1 })
    .select('+codeHash');
  if (!doc) throw new AccountVerificationError(400, 'CODE_NOT_FOUND', '인증번호를 다시 요청해주세요.');
  if (doc.expiresAt.getTime() < Date.now()) {
    throw new AccountVerificationError(410, 'CODE_EXPIRED', '인증번호가 만료되었습니다. 다시 요청해주세요.');
  }
  if (doc.attempts >= MAX_ATTEMPTS) {
    doc.used = true;
    doc.usedAt = new Date();
    await doc.save();
    throw new AccountVerificationError(429, 'TOO_MANY_ATTEMPTS', '인증 시도 횟수를 초과했습니다.');
  }
  if (!(await bcrypt.compare(value, doc.codeHash))) {
    doc.attempts += 1;
    await doc.save();
    throw new AccountVerificationError(400, 'CODE_MISMATCH', '인증번호가 일치하지 않습니다.');
  }
  return doc;
}

async function consume(docs) {
  const now = new Date();
  await Promise.all(docs.map((doc) => {
    doc.used = true;
    doc.usedAt = now;
    return doc.save();
  }));
}

async function commitEmailChange({ userId, newEmail, currentCode, newCode }, dependencies = {}) {
  const UserModel = dependencies.UserModel || User;
  const VerificationModel = dependencies.VerificationModel || AccountVerification;
  const user = await getUser(userId, UserModel);
  const email = normalizeEmail(newEmail);
  if (!EMAIL_REGEX.test(email) || email.length > 320) {
    throw new AccountVerificationError(400, 'INVALID_EMAIL', '올바른 이메일 형식이 아닙니다.');
  }
  const duplicate = await UserModel.findOne({ email, _id: { $ne: userId } }).select('_id').lean();
  if (duplicate) throw new AccountVerificationError(409, 'EMAIL_IN_USE', '이미 사용 중인 이메일입니다.');

  const docs = [];
  if (user.email && user.emailVerifiedAt) {
    docs.push(await assertCode({
      userId,
      purpose: 'email_change_current',
      destination: normalizeEmail(user.email),
      code: currentCode,
    }, VerificationModel));
    docs.push(await assertCode({ userId, purpose: 'email_change_new', destination: email, code: newCode }, VerificationModel));
  } else {
    docs.push(await assertCode({ userId, purpose: 'email_verify_new', destination: email, code: newCode }, VerificationModel));
  }

  user.email = email;
  user.emailVerifiedAt = new Date();
  try {
    await user.save();
  } catch (error) {
    if (error?.code === 11000) throw new AccountVerificationError(409, 'EMAIL_IN_USE', '이미 사용 중인 이메일입니다.');
    throw error;
  }
  await consume(docs);
  return { email, emailMasked: maskEmail(email), emailVerified: true };
}

async function commitPhoneChange({ userId, newPhone, emailCode, smsCode }, dependencies = {}) {
  const UserModel = dependencies.UserModel || User;
  const VerificationModel = dependencies.VerificationModel || AccountVerification;
  const user = await getUser(userId, UserModel);
  const changingVerifiedPhone = !!user.phone && !!user.phoneVerifiedAt;
  if (changingVerifiedPhone && (!user.email || !user.emailVerifiedAt)) {
    throw new AccountVerificationError(409, 'EMAIL_NOT_VERIFIED', '전화번호를 변경하려면 먼저 이메일 인증이 필요합니다.');
  }
  const phone = normalizePhoneKR(newPhone);
  if (!phone) throw new AccountVerificationError(400, 'INVALID_PHONE', '010으로 시작하는 휴대전화 번호를 입력해주세요.');

  const emailDoc = changingVerifiedPhone
    ? await assertCode({
      userId,
      purpose: 'phone_change_email',
      destination: normalizeEmail(user.email),
      code: emailCode,
    }, VerificationModel)
    : null;
  const smsDoc = await assertCode({
    userId,
    purpose: 'phone_change_sms',
    destination: phone,
    code: smsCode,
  }, VerificationModel);

  user.phone = phone;
  if (user.loginPhone) user.loginPhone = phone;
  user.phoneVerifiedAt = new Date();
  user.phoneVerifiedBy = changingVerifiedPhone ? 'SMS+EMAIL' : 'SMS';
  await user.save();
  await consume([emailDoc, smsDoc].filter(Boolean));
  return { phoneMasked: maskPhone(phone), phoneVerified: true };
}

async function commitPublicPhoneChange({ currentPhone, currentEmail, newPhone, emailCode, smsCode }, dependencies = {}) {
  const UserModel = dependencies.UserModel || User;
  const VerificationModel = dependencies.VerificationModel || AccountVerification;
  const identity = validatePublicPhoneChangeIdentity({ currentPhone, currentEmail, newPhone });
  const user = await findPublicPhoneChangeUser(identity, UserModel);
  if (!user || identity.nextPhone === identity.phone) {
    throw new AccountVerificationError(400, 'PUBLIC_PHONE_CHANGE_FAILED', '입력 정보 또는 인증번호를 확인해주세요.');
  }
  if (await publicPhoneChangeDuplicate(UserModel, user._id, identity.nextPhone)) {
    throw new AccountVerificationError(400, 'PUBLIC_PHONE_CHANGE_FAILED', '입력 정보 또는 인증번호를 확인해주세요.');
  }

  let emailDoc;
  let smsDoc;
  try {
    emailDoc = await assertCode({
      userId: user._id,
      purpose: 'public_phone_change_email',
      destination: identity.email,
      code: emailCode,
    }, VerificationModel);
    smsDoc = await assertCode({
      userId: user._id,
      purpose: 'public_phone_change_sms',
      destination: identity.nextPhone,
      code: smsCode,
    }, VerificationModel);
  } catch (error) {
    if (error instanceof AccountVerificationError) {
      throw new AccountVerificationError(400, 'PUBLIC_PHONE_CHANGE_FAILED', '입력 정보 또는 인증번호를 확인해주세요.');
    }
    throw error;
  }

  user.phone = identity.nextPhone;
  user.loginPhone = identity.nextPhone;
  user.phoneVerifiedAt = new Date();
  user.phoneVerifiedBy = 'SMS+EMAIL_PUBLIC_CHANGE';
  try {
    await user.save();
  } catch (error) {
    if (error?.code === 11000) {
      throw new AccountVerificationError(400, 'PUBLIC_PHONE_CHANGE_FAILED', '입력 정보 또는 인증번호를 확인해주세요.');
    }
    throw error;
  }
  await consume([emailDoc, smsDoc]);
  return { phoneMasked: maskPhone(identity.nextPhone), phoneVerified: true };
}

module.exports = {
  AccountVerificationError,
  normalizePhoneKR,
  maskEmail,
  maskPhone,
  requestEmailCode,
  requestPhoneEmailCode,
  requestPhoneSmsCode,
  commitEmailChange,
  commitPhoneChange,
  requestPublicPhoneChangeEmailCode,
  requestPublicPhoneChangeSmsCode,
  commitPublicPhoneChange,
};
