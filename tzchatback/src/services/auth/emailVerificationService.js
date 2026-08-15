// backend/services/auth/emailVerificationService.js
// ------------------------------------------------------------
// 이메일 인증번호 발급/검증 도메인 서비스 (지침 §1: route/controller에는 비즈니스 로직을 두지 않는다).
// - 6자리 숫자 인증번호를 생성해 bcrypt 해시로만 저장한다(원문 미저장).
// - 재발송 쿨다운(60초), 시간당 요청 횟수(이메일/IP), 검증 시도 횟수를 모두 이 파일에서 제어한다.
// - 실제 메일 발송은 services/mail/tzmailClient.js에만 위임한다.
// - 정확히 허용된 심사용 로그인 이메일만 고정 번호를 사용하며 그 외 이메일은 항상 실제 메일 발송 흐름을 탄다.
// ------------------------------------------------------------
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { EmailVerification } = require('@/models');
const { sendMail } = require('@/services/mail/tzmailClient');
const {
  normalizeEmail,
  isReviewLoginEmail,
  getReviewLoginCode,
  isEmailDevProvider,
} = require('@/config/emailAuthPolicy');

class EmailVerificationError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    Object.assign(this, extra);
  }
}

// ── 정책값 (지침에 따라 env로 조정 가능, 미설정 시 안전한 기본값 사용) ──
function getExpiresMinutes() {
  const n = Number(process.env.EMAIL_VERIFICATION_EXPIRES_MINUTES);
  return Number.isFinite(n) && n > 0 ? n : 5;
}
function getResendSeconds() {
  const n = Number(process.env.EMAIL_VERIFICATION_RESEND_SECONDS);
  return Number.isFinite(n) && n > 0 ? n : 60;
}
function getMaxAttempts() {
  const n = Number(process.env.EMAIL_CODE_MAX_ATTEMPTS);
  return Number.isFinite(n) && n > 0 ? n : 5;
}
// 시간당 과도 요청 차단 상한(이메일 인증 도메인 전용 — 코드 레벨 상수)
const MAX_REQUESTS_PER_EMAIL_PER_HOUR = 5;
const MAX_REQUESTS_PER_IP_PER_HOUR = 20;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return EMAIL_REGEX.test(email) && email.length <= 320;
}
function generateCode() {
  // crypto.randomInt: Math.random 대비 예측 불가 — 무차별 대입/추측 방지
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

// ======================================================
// 인증번호 요청
// ======================================================
async function requestCode({ email: rawEmail, ip }, dependencies = {}) {
  const VerificationModel = dependencies.VerificationModel || EmailVerification;
  const sendMailFn = dependencies.sendMailFn || sendMail;
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) {
    throw new EmailVerificationError(400, 'INVALID_EMAIL', '올바른 이메일 형식이 아닙니다.');
  }

  // 재발송 쿨다운
  const last = await VerificationModel.findOne({ email }).sort({ createdAt: -1 }).select('createdAt');
  if (last) {
    const elapsedSec = (Date.now() - last.createdAt.getTime()) / 1000;
    const resendSeconds = getResendSeconds();
    if (elapsedSec < resendSeconds) {
      const retryAfterSeconds = Math.ceil(resendSeconds - elapsedSec);
      const reviewLogin = isReviewLoginEmail(email);
      throw new EmailVerificationError(429, 'RESEND_TOO_SOON', '잠시 후 다시 시도해주세요.', {
        retryAfterSeconds,
        reviewLogin,
        sent: !reviewLogin && !isEmailDevProvider(),
      });
    }
  }

  // 시간당 과도 요청 차단 (이메일 기준 / IP 기준)
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [emailCount, ipCount] = await Promise.all([
    VerificationModel.countDocuments({ email, createdAt: { $gte: hourAgo } }),
    ip ? VerificationModel.countDocuments({ ip, createdAt: { $gte: hourAgo } }) : Promise.resolve(0),
  ]);
  if (emailCount >= MAX_REQUESTS_PER_EMAIL_PER_HOUR) {
    throw new EmailVerificationError(429, 'TOO_MANY_REQUESTS', '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
  }
  if (ip && ipCount >= MAX_REQUESTS_PER_IP_PER_HOUR) {
    throw new EmailVerificationError(429, 'TOO_MANY_REQUESTS', '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
  }

  // 같은 이메일의 이전 미사용 인증번호 무효화
  await VerificationModel.updateMany({ email, used: false }, { $set: { used: true, usedAt: new Date() } });

  const expiresMinutes = getExpiresMinutes();

  // 완전 일치하는 심사용 로그인 이메일만 고정 번호를 사용한다.
  // 일반 이메일은 로컬 개발을 포함해 항상 임의 번호 + TZMail 발송 흐름을 탄다.
  const reviewLoginCode = getReviewLoginCode(email);
  if (isReviewLoginEmail(email) && !reviewLoginCode) {
    throw new EmailVerificationError(503, 'REVIEW_LOGIN_NOT_CONFIGURED', '심사용 로그인 설정을 확인해주세요.');
  }
  if (!reviewLoginCode && String(process.env.MAIL_PROVIDER || '').trim().toLowerCase() === 'tzmail') {
    // 실제 provider 설정 누락을 레코드 생성 전에 드러낸다.
    for (const key of ['TZMAIL_BASE_URL', 'TZMAIL_APP_ID', 'TZMAIL_API_KEY']) {
      if (!String(process.env[key] || '').trim()) {
        throw new EmailVerificationError(503, 'PROVIDER_NOT_CONFIGURED', '인증 메일 발송 설정을 확인해주세요.');
      }
    }
  }
  const code = reviewLoginCode || generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000);

  const verification = await VerificationModel.create({ email, codeHash, expiresAt, ip: ip || '' });

  const devProvider = !reviewLoginCode && isEmailDevProvider();
  if (!reviewLoginCode && !devProvider) {
    try {
      await sendMailFn({
        to: email,
        subject: 'TZChat 이메일 인증번호',
        text: `TZChat 이메일 인증번호는 ${code}입니다. ${expiresMinutes}분 이내에 입력해주세요.`,
        html: `<p>TZChat 이메일 인증번호는 <strong>${code}</strong>입니다.</p><p>${expiresMinutes}분 이내에 입력해주세요.</p>`,
      });
    } catch (err) {
      console.error('[EMAIL_VERIFICATION][SEND_FAILED]', { message: err?.message });

      // 발송되지 않은 인증번호가 재발송 쿨다운/시간당 제한에 포함되면
      // 사용자는 설정 오류가 해결된 뒤에도 429만 받게 된다. 방금 만든 실패 레코드만 제거한다.
      try {
        await VerificationModel.deleteOne({ _id: verification._id });
      } catch (cleanupError) {
        console.error('[EMAIL_VERIFICATION][CLEANUP_FAILED]', { message: cleanupError?.message });
      }

      throw new EmailVerificationError(502, 'EMAIL_DELIVERY_FAILED', '인증 메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
  }

  return {
    expiresInSeconds: expiresMinutes * 60,
    resendAfterSeconds: getResendSeconds(),
    sent: !reviewLoginCode && !devProvider,
    reviewLogin: Boolean(reviewLoginCode),
    ...(devProvider ? { devCode: code } : {}),
  };
}

// ======================================================
// 인증번호 검증
// ======================================================
async function verifyCode({ email: rawEmail, code: rawCode }, dependencies = {}) {
  const VerificationModel = dependencies.VerificationModel || EmailVerification;
  const email = normalizeEmail(rawEmail);
  const code = String(rawCode || '').trim();

  if (!isValidEmail(email)) {
    throw new EmailVerificationError(400, 'INVALID_EMAIL', '올바른 이메일 형식이 아닙니다.');
  }
  if (!/^\d{6}$/.test(code)) {
    throw new EmailVerificationError(400, 'INVALID_CODE_FORMAT', '인증번호는 6자리 숫자입니다.');
  }

  const doc = await VerificationModel.findOne({ email, used: false })
    .sort({ createdAt: -1 })
    .select('+codeHash');

  if (!doc) {
    throw new EmailVerificationError(400, 'CODE_NOT_FOUND', '인증번호를 다시 요청해주세요.');
  }

  if (doc.expiresAt.getTime() < Date.now()) {
    throw new EmailVerificationError(410, 'CODE_EXPIRED', '인증번호가 만료되었습니다. 다시 요청해주세요.');
  }

  const maxAttempts = getMaxAttempts();
  if (doc.attempts >= maxAttempts) {
    doc.used = true;
    doc.usedAt = new Date();
    await doc.save();
    throw new EmailVerificationError(429, 'TOO_MANY_ATTEMPTS', '인증 시도 횟수를 초과했습니다. 다시 요청해주세요.');
  }

  const isMatch = await bcrypt.compare(code, doc.codeHash);
  if (!isMatch) {
    doc.attempts += 1;
    await doc.save();
    throw new EmailVerificationError(400, 'CODE_MISMATCH', '인증번호가 일치하지 않습니다.');
  }

  // 인증 성공 — 즉시 사용 완료 처리(1회성)
  doc.used = true;
  doc.usedAt = new Date();
  await doc.save();

  return { email };
}

module.exports = { EmailVerificationError, normalizeEmail, isValidEmail, requestCode, verifyCode };
