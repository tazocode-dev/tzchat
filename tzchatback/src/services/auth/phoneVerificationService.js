const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { PhoneVerification } = require('@/models');
const { sendVerificationSms } = require('@/services/sms/tzphoneClient');
const { localPhoneDigits, getPhoneLoginPolicy } = require('@/config/phoneAuthPolicy');

const EXPIRES_MINUTES = 5;
const RESEND_SECONDS = 60;
const MAX_ATTEMPTS = 5;
const MAX_REQUESTS_PER_PHONE_PER_HOUR = 5;
const MAX_REQUESTS_PER_IP_PER_HOUR = 20;

class PhoneVerificationError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    Object.assign(this, extra);
  }
}

function normalizeLoginPhone(rawPhone) {
  const localPhone = localPhoneDigits(rawPhone);
  const policy = getPhoneLoginPolicy(localPhone);
  if (!policy && !/^010\d{8}$/.test(localPhone)) {
    throw new PhoneVerificationError(400, 'INVALID_PHONE', '010으로 시작하는 휴대전화 번호를 입력해주세요.');
  }
  const phone = localPhone.startsWith('0') ? `+82${localPhone.slice(1)}` : `+82${localPhone}`;
  return { localPhone, phone, policy };
}

function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

async function requestCode({ phone: rawPhone, ip }, dependencies = {}) {
  const VerificationModel = dependencies.VerificationModel || PhoneVerification;
  const sendSmsFn = dependencies.sendSmsFn || sendVerificationSms;
  const { phone, policy } = normalizeLoginPhone(rawPhone);

  const last = await VerificationModel.findOne({ phone }).sort({ createdAt: -1 }).select('createdAt');
  if (last) {
    const elapsedSeconds = (Date.now() - last.createdAt.getTime()) / 1000;
    if (elapsedSeconds < RESEND_SECONDS) {
      throw new PhoneVerificationError(429, 'RESEND_TOO_SOON', '잠시 후 다시 시도해주세요.', {
        retryAfterSeconds: Math.ceil(RESEND_SECONDS - elapsedSeconds),
        sent: !policy?.code,
        reviewLogin: policy?.type === 'review',
      });
    }
  }

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [phoneCount, ipCount] = await Promise.all([
    VerificationModel.countDocuments({ phone, createdAt: { $gte: hourAgo } }),
    ip ? VerificationModel.countDocuments({ ip, createdAt: { $gte: hourAgo } }) : Promise.resolve(0),
  ]);
  if (phoneCount >= MAX_REQUESTS_PER_PHONE_PER_HOUR || (ip && ipCount >= MAX_REQUESTS_PER_IP_PER_HOUR)) {
    throw new PhoneVerificationError(429, 'TOO_MANY_REQUESTS', '인증 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
  }

  await VerificationModel.updateMany({ phone, used: false }, { $set: { used: true, usedAt: new Date() } });
  const code = policy?.code || generateCode();
  const verification = await VerificationModel.create({
    phone,
    codeHash: await bcrypt.hash(code, 10),
    expiresAt: new Date(Date.now() + EXPIRES_MINUTES * 60 * 1000),
    ip: ip || '',
  });

  if (!policy?.code) {
    try {
      await sendSmsFn({ phone, code });
    } catch (error) {
      await VerificationModel.deleteOne({ _id: verification._id }).catch(() => null);
      if (error?.code === 'ENV_MISSING') {
        throw new PhoneVerificationError(503, 'PROVIDER_NOT_CONFIGURED', '문자 발송 설정을 확인해주세요.');
      }
      throw new PhoneVerificationError(502, 'SMS_DELIVERY_FAILED', '인증 문자 발송에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
  }

  return {
    expiresInSeconds: EXPIRES_MINUTES * 60,
    resendAfterSeconds: RESEND_SECONDS,
    sent: !policy?.code,
    reviewLogin: policy?.type === 'review',
    fixedLogin: Boolean(policy?.code),
  };
}

async function verifyCode({ phone: rawPhone, code: rawCode }, dependencies = {}) {
  const VerificationModel = dependencies.VerificationModel || PhoneVerification;
  const { phone, localPhone, policy } = normalizeLoginPhone(rawPhone);
  const code = String(rawCode || '').trim();
  if (!/^\d{6}$/.test(code)) {
    throw new PhoneVerificationError(400, 'INVALID_CODE_FORMAT', '인증번호는 6자리 숫자입니다.');
  }

  const doc = await VerificationModel.findOne({ phone, used: false })
    .sort({ createdAt: -1 })
    .select('+codeHash');
  if (!doc) throw new PhoneVerificationError(400, 'CODE_NOT_FOUND', '인증번호를 다시 요청해주세요.');
  if (doc.expiresAt.getTime() < Date.now()) {
    throw new PhoneVerificationError(410, 'CODE_EXPIRED', '인증번호가 만료되었습니다. 다시 요청해주세요.');
  }
  if (doc.attempts >= MAX_ATTEMPTS) {
    await VerificationModel.updateOne({ _id: doc._id, used: false }, { $set: { used: true, usedAt: new Date() } });
    throw new PhoneVerificationError(429, 'TOO_MANY_ATTEMPTS', '인증 시도 횟수를 초과했습니다. 다시 요청해주세요.');
  }
  if (!(await bcrypt.compare(code, doc.codeHash))) {
    await VerificationModel.updateOne({ _id: doc._id, used: false }, { $inc: { attempts: 1 } });
    throw new PhoneVerificationError(400, 'CODE_MISMATCH', '인증번호가 일치하지 않습니다.');
  }

  const consumed = await VerificationModel.findOneAndUpdate(
    { _id: doc._id, used: false, expiresAt: { $gt: new Date() } },
    { $set: { used: true, usedAt: new Date() } },
    { new: true }
  );
  if (!consumed) throw new PhoneVerificationError(400, 'CODE_NOT_FOUND', '인증번호를 다시 요청해주세요.');
  return { phone, localPhone, policy };
}

module.exports = { PhoneVerificationError, normalizeLoginPhone, requestCode, verifyCode };
