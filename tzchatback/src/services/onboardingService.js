const { User } = require('@/models');

const MINIMUM_AGE = 19;
const KOREA_TIME_ZONE = 'Asia/Seoul';

class OnboardingError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function normalizeGender(value) {
  const gender = String(value || '').trim().toLowerCase();
  if (['man', 'male', 'm', '남', '남자', '남성'].includes(gender)) return 'man';
  if (['woman', 'female', 'f', '여', '여자', '여성'].includes(gender)) return 'woman';
  return '';
}

function koreaTodayParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KOREA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const pick = (type) => Number(parts.find((part) => part.type === type)?.value);
  return { year: pick('year'), month: pick('month'), day: pick('day') };
}

function parseBirthDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) {
    throw new OnboardingError(400, 'INVALID_BIRTH_DATE', '생년월일을 정확히 입력해 주세요.');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new OnboardingError(400, 'INVALID_BIRTH_DATE', '생년월일을 정확히 입력해 주세요.');
  }

  return { date, year, month, day };
}

function calculateAge(birth, today = koreaTodayParts()) {
  let age = today.year - birth.year;
  if (today.month < birth.month || (today.month === birth.month && today.day < birth.day)) {
    age -= 1;
  }
  return age;
}

function parseBirthYear(value) {
  const normalized = String(value ?? '').trim();
  if (!/^\d{4}$/.test(normalized)) {
    throw new OnboardingError(400, 'INVALID_BIRTH_YEAR', '출생연도를 정확히 입력해 주세요.');
  }

  const year = Number(normalized);
  if (year < 1900) {
    throw new OnboardingError(400, 'INVALID_BIRTH_YEAR', '출생연도를 정확히 입력해 주세요.');
  }
  return year;
}

function hasStoredBirthYear(user) {
  const birthyear = Number(user?.birthyear);
  return (Number.isInteger(birthyear) && birthyear >= 1900) || !!user?.birthDate;
}

function hasAdultAgeInformation(user, now = new Date()) {
  const today = koreaTodayParts(now);

  // Legacy accounts that stored a full birth date keep the original exact-age rule.
  if (user?.birthDate) {
    const date = new Date(user.birthDate);
    if (Number.isNaN(date.getTime())) return false;
    const birth = {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    };
    return birth.year >= 1900 && calculateAge(birth, today) >= MINIMUM_AGE;
  }

  const birthyear = Number(user?.birthyear);
  return Number.isInteger(birthyear) && birthyear >= 1900 && today.year - birthyear >= MINIMUM_AGE;
}

function isProfileOnboardingComplete(user, now = new Date()) {
  if (!user) return false;
  if (String(user.role || '').toLowerCase() === 'master') return true;
  return hasAdultAgeInformation(user, now) && !!normalizeGender(user.gender);
}

function buildStatus(user, now = new Date()) {
  const isMaster = String(user?.role || '').toLowerCase() === 'master';
  const hasBirthYear = isMaster || hasAdultAgeInformation(user, now);
  const hasGender = isMaster || !!normalizeGender(user?.gender);
  return {
    complete: hasBirthYear && hasGender,
    // 기존 앱 버전과의 호환을 위해 단계 식별자는 birthDate를 유지한다.
    nextStep: !hasBirthYear ? 'birthDate' : !hasGender ? 'gender' : 'complete',
    hasBirthYear,
    hasBirthDate: hasBirthYear,
    hasGender,
    birthyear: user?.birthyear ?? (user?.birthDate ? new Date(user.birthDate).getUTCFullYear() : null),
    gender: normalizeGender(user?.gender) || null,
  };
}

async function getStatus(userId, dependencies = {}) {
  const UserModel = dependencies.UserModel || User;
  const user = await UserModel.findById(userId)
    .select('role birthDate birthyear gender profileOnboardingCompletedAt');
  if (!user) throw new OnboardingError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
  return buildStatus(user, dependencies.now || new Date());
}

async function saveBirthDate(userId, value, dependencies = {}) {
  const UserModel = dependencies.UserModel || User;
  const user = await UserModel.findById(userId)
    .select('role birthDate birthyear gender profileOnboardingCompletedAt');
  if (!user) throw new OnboardingError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
  if (hasAdultAgeInformation(user, dependencies.now || new Date())) {
    throw new OnboardingError(409, 'BIRTH_DATE_LOCKED', '생년월일은 직접 변경할 수 없습니다.');
  }

  const birth = parseBirthDate(value);
  const today = koreaTodayParts(dependencies.now || new Date());
  if (calculateAge(birth, today) < MINIMUM_AGE) {
    throw new OnboardingError(403, 'UNDERAGE_NOT_ALLOWED', '이 서비스는 만 19세 이상만 이용할 수 있습니다.');
  }

  user.birthDate = birth.date;
  user.birthyear = birth.year;
  if (normalizeGender(user.gender)) user.profileOnboardingCompletedAt = new Date();
  await user.save();
  return buildStatus(user, dependencies.now || new Date());
}

async function saveBirthYear(userId, value, dependencies = {}) {
  const UserModel = dependencies.UserModel || User;
  const user = await UserModel.findById(userId)
    .select('role birthDate birthyear gender profileOnboardingCompletedAt');
  if (!user) throw new OnboardingError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
  if (hasAdultAgeInformation(user, dependencies.now || new Date())) {
    throw new OnboardingError(409, 'BIRTH_YEAR_LOCKED', '출생연도는 직접 변경할 수 없습니다.');
  }

  const birthyear = parseBirthYear(value);
  const today = koreaTodayParts(dependencies.now || new Date());
  if (today.year - birthyear < MINIMUM_AGE) {
    throw new OnboardingError(403, 'UNDERAGE_NOT_ALLOWED', '19세가 되는 해부터 이용할 수 있습니다.');
  }

  user.birthyear = birthyear;
  if (normalizeGender(user.gender)) user.profileOnboardingCompletedAt = new Date();
  await user.save();
  return buildStatus(user, dependencies.now || new Date());
}

async function saveGender(userId, value, dependencies = {}) {
  const UserModel = dependencies.UserModel || User;
  const user = await UserModel.findById(userId)
    .select('role birthDate birthyear gender profileOnboardingCompletedAt');
  if (!user) throw new OnboardingError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
  if (!hasAdultAgeInformation(user, dependencies.now || new Date())) {
    throw new OnboardingError(409, 'BIRTH_YEAR_REQUIRED', '출생연도를 먼저 입력해 주세요.');
  }

  const gender = normalizeGender(value);
  if (!gender) {
    throw new OnboardingError(400, 'INVALID_GENDER', '성별을 선택해 주세요.');
  }
  if (normalizeGender(user.gender) && normalizeGender(user.gender) !== gender) {
    throw new OnboardingError(409, 'GENDER_LOCKED', '이미 저장된 성별은 온보딩에서 변경할 수 없습니다.');
  }

  user.gender = gender;
  user.profileOnboardingCompletedAt = new Date();
  await user.save();
  return buildStatus(user, dependencies.now || new Date());
}

module.exports = {
  MINIMUM_AGE,
  OnboardingError,
  normalizeGender,
  parseBirthDate,
  calculateAge,
  parseBirthYear,
  hasStoredBirthYear,
  hasAdultAgeInformation,
  isProfileOnboardingComplete,
  buildStatus,
  getStatus,
  saveBirthDate,
  saveBirthYear,
  saveGender,
};
