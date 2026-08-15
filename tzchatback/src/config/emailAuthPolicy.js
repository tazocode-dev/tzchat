// 계정별 로그인 고정번호와 권한 보정은 환경별 파일에서 관리한다.
// - EMAIL_FIXED_LOGIN_ACCOUNTS=email@example.com:123456,...
// - EMAIL_ACCOUNT_ROLE_OVERRIDES=email@example.com:master,...
// 고정번호는 이메일 로그인에만 적용하며 이메일 변경 등 로그인 외 인증에는 사용하지 않는다.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIXED_LOGIN_CODES_KEY = 'EMAIL_FIXED_LOGIN_ACCOUNTS';
const ROLE_OVERRIDES_KEY = 'EMAIL_ACCOUNT_ROLE_OVERRIDES';

// 테스트 중 운영 시간과 무관하게 스피드 매칭을 시작할 수 있는 계정이다.
// 심사용 로그인 목록과 정책 목적이 다르므로 별도 allowlist로 관리한다.
const SPEED_MATCHING_TEST_EMAILS = new Set([
  'test@tazocode.com',
  'test1@tazocode.com',
  'test2@tazocode.com',
  'test3@tazocode.com',
  'test4@tazocode.com',
]);

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function parseAccountMap(rawValue, { key, valuePattern, valueDescription }) {
  const result = new Map();
  const raw = String(rawValue || '').trim();
  if (!raw) return result;

  const entries = raw.split(',');
  for (const [index, rawEntry] of entries.entries()) {
    const entry = rawEntry.trim();
    const itemLabel = `${key}의 ${index + 1}번째 항목`;
    if (!entry) throw new Error(`${itemLabel}이 비어 있습니다.`);

    const separatorIndex = entry.lastIndexOf(':');
    const email = normalizeEmail(separatorIndex >= 0 ? entry.slice(0, separatorIndex) : '');
    const value = separatorIndex >= 0 ? entry.slice(separatorIndex + 1).trim().toLowerCase() : '';
    if (!EMAIL_REGEX.test(email) || email.length > 320) {
      throw new Error(`${itemLabel}의 이메일 형식이 올바르지 않습니다.`);
    }
    if (!valuePattern.test(value)) {
      throw new Error(`${itemLabel}의 값은 ${valueDescription}이어야 합니다.`);
    }
    if (result.has(email)) {
      throw new Error(`${itemLabel}의 이메일이 앞 항목과 중복됩니다.`);
    }
    result.set(email, value);
  }

  return result;
}

function getFixedLoginCodes() {
  return parseAccountMap(process.env[FIXED_LOGIN_CODES_KEY], {
    key: FIXED_LOGIN_CODES_KEY,
    valuePattern: /^\d{6}$/,
    valueDescription: '6자리 숫자',
  });
}

function getRoleOverrides() {
  return parseAccountMap(process.env[ROLE_OVERRIDES_KEY], {
    key: ROLE_OVERRIDES_KEY,
    valuePattern: /^(?:master|user)$/,
    valueDescription: 'master 또는 user',
  });
}

function validateEmailAuthPolicyEnv() {
  getFixedLoginCodes();
  getRoleOverrides();
}

function isReviewLoginEmail(rawEmail) {
  return getFixedLoginCodes().has(normalizeEmail(rawEmail));
}

function getReviewLoginCode(rawEmail) {
  return getFixedLoginCodes().get(normalizeEmail(rawEmail)) || null;
}

function isEmailDevProvider() {
  return String(process.env.NODE_ENV || '') === 'test'
    && String(process.env.MAIL_PROVIDER || '').trim().toLowerCase() === 'dev';
}

function isTemporaryAdminEmail(rawEmail) {
  return getForcedAccountRole(rawEmail) === 'master';
}

function getForcedAccountRole(rawEmail) {
  return getRoleOverrides().get(normalizeEmail(rawEmail)) || null;
}

function isSpeedMatchingTestEmail(rawEmail) {
  return SPEED_MATCHING_TEST_EMAILS.has(normalizeEmail(rawEmail));
}

module.exports = {
  normalizeEmail,
  isReviewLoginEmail,
  getReviewLoginCode,
  isEmailDevProvider,
  isTemporaryAdminEmail,
  getForcedAccountRole,
  isSpeedMatchingTestEmail,
  validateEmailAuthPolicyEnv,
};
