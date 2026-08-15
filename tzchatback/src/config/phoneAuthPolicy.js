const PHONE_DIGITS_PATTERN = /^\d{11}$/;
const CODE_PATTERN = /^\d{6}$/;

function localPhoneDigits(raw) {
  const source = String(raw || '').trim();
  const digits = source.replace(/\D/g, '');
  if (!digits) return '';
  if (source.startsWith('+82') || (digits.startsWith('82') && digits.length === 12)) {
    return `0${digits.slice(2)}`;
  }
  return digits;
}

function parsePhoneList(rawValue, key) {
  const result = new Set();
  const raw = String(rawValue || '').trim();
  if (!raw) return result;

  const entries = raw.split(',');
  for (const [index, rawEntry] of entries.entries()) {
    const phone = localPhoneDigits(rawEntry);
    const label = `${key}의 ${index + 1}번째 항목`;
    if (!PHONE_DIGITS_PATTERN.test(phone)) throw new Error(`${label}은 숫자 11자리여야 합니다.`);
    if (result.has(phone)) throw new Error(`${label}이 앞 항목과 중복됩니다.`);
    result.add(phone);
  }
  return result;
}

function parsePhoneMap(rawValue, { key, valuePattern, valueDescription }) {
  const result = new Map();
  const raw = String(rawValue || '').trim();
  if (!raw) return result;

  const entries = raw.split(',');
  for (const [index, rawEntry] of entries.entries()) {
    const entry = rawEntry.trim();
    const separatorIndex = entry.lastIndexOf(':');
    const phone = localPhoneDigits(separatorIndex >= 0 ? entry.slice(0, separatorIndex) : '');
    const value = separatorIndex >= 0 ? entry.slice(separatorIndex + 1).trim().toLowerCase() : '';
    const label = `${key}의 ${index + 1}번째 항목`;
    if (!PHONE_DIGITS_PATTERN.test(phone)) throw new Error(`${label}의 전화번호는 숫자 11자리여야 합니다.`);
    if (!valuePattern.test(value)) throw new Error(`${label}의 값은 ${valueDescription}이어야 합니다.`);
    if (result.has(phone)) throw new Error(`${label}의 전화번호가 앞 항목과 중복됩니다.`);
    result.set(phone, value);
  }
  return result;
}

function getReviewPhones() {
  return parsePhoneList(process.env.REVIEW_LOGIN_PHONES, 'REVIEW_LOGIN_PHONES');
}

function getReviewCode() {
  return String(process.env.REVIEW_CODE || '').trim();
}

function getFixedLoginCodes() {
  return parsePhoneMap(process.env.PHONE_FIXED_LOGIN_ACCOUNTS, {
    key: 'PHONE_FIXED_LOGIN_ACCOUNTS',
    valuePattern: CODE_PATTERN,
    valueDescription: '6자리 숫자',
  });
}

function getRoleOverrides() {
  return parsePhoneMap(process.env.PHONE_ACCOUNT_ROLE_OVERRIDES, {
    key: 'PHONE_ACCOUNT_ROLE_OVERRIDES',
    valuePattern: /^(?:master|user)$/,
    valueDescription: 'master 또는 user',
  });
}

function getPhoneLoginPolicy(rawPhone) {
  const phone = localPhoneDigits(rawPhone);
  const reviewPhones = getReviewPhones();
  const fixedCodes = getFixedLoginCodes();
  const roleOverrides = getRoleOverrides();

  if (reviewPhones.has(phone)) {
    return { type: 'review', code: getReviewCode(), role: roleOverrides.get(phone) || 'user' };
  }
  if (fixedCodes.has(phone)) {
    return { type: 'fixed', code: fixedCodes.get(phone), role: roleOverrides.get(phone) || 'user' };
  }
  if (roleOverrides.has(phone)) {
    return { type: 'role', code: null, role: roleOverrides.get(phone) };
  }
  return null;
}

function getForcedPhoneRole(rawPhone) {
  return getPhoneLoginPolicy(rawPhone)?.role || null;
}

function validatePhoneAuthPolicyEnv() {
  const reviewPhones = getReviewPhones();
  const reviewCode = getReviewCode();
  const fixedCodes = getFixedLoginCodes();
  getRoleOverrides();

  if (reviewPhones.size > 0 && !CODE_PATTERN.test(reviewCode)) {
    throw new Error('REVIEW_LOGIN_PHONES를 사용하면 REVIEW_CODE는 6자리 숫자여야 합니다.');
  }
  if (reviewPhones.size === 0 && reviewCode) {
    throw new Error('REVIEW_CODE를 사용하려면 REVIEW_LOGIN_PHONES가 필요합니다.');
  }
  for (const phone of reviewPhones) {
    if (fixedCodes.has(phone)) {
      throw new Error('REVIEW_LOGIN_PHONES와 PHONE_FIXED_LOGIN_ACCOUNTS에 중복된 전화번호가 있습니다.');
    }
  }
}

module.exports = {
  localPhoneDigits,
  getPhoneLoginPolicy,
  getForcedPhoneRole,
  validatePhoneAuthPolicyEnv,
};
