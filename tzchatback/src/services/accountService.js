// src/services/accountService.js
// ────────────────────────────────────────────────────────────
// 내 계정 도메인 서비스 (지침 §1). routes/user/accountRouter.js에서 분리.
// ────────────────────────────────────────────────────────────

const bcrypt = require('bcrypt');
const { User } = require('@/models');
const { EMERGENCY_DURATION_SECONDS, getSpeedMatchingAvailabilityForEmail } = require('@/config/emergency');
const { evaluateEmergencyState } = require('@/services/search/emergencyModeService');
const { getForcedAccountRole } = require('@/config/emailAuthPolicy');
const { getForcedPhoneRole } = require('@/config/phoneAuthPolicy');
const { buildStatus: buildOnboardingStatus } = require('@/services/onboardingService');

class AccountError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function resolveRole(u) {
  if (!u) return '';
  return u.role === 'master' ? 'master' : 'user';
}
function resolveIsAdmin(u) {
  return resolveRole(u) === 'master';
}
function formatE164KR(p = '') {
  const s = String(p || '');
  if (!s.startsWith('+82')) return s;
  const tail = s.replace('+82', '');
  const m =
    tail.match(/^10(\d{4})(\d{4})$/) ||
    tail.match(/^(\d{2})(\d{4})(\d{4})$/);
  if (m) {
    const first = (m[0].length === 9 || m[1].length === 2) ? m[1] : '10';
    return `+82 ${first}-${m[2]}-${m[3]}`;
  }
  return s;
}
function maskPhone(p = '') {
  const s = String(p || '');
  if (s.length < 4) return '****';
  const last4 = s.slice(-4);
  return `****-****-${last4}`;
}
// ======================================================
// /me (현재 사용자와 스피드 매칭 상태 포함)
// ======================================================
async function getMyProfile(userId) {
  const userDoc = await User.findById(userId)
    .select([
      'username', 'role', 'nickname', 'birthyear', 'birthDate', 'gender',
      'profileOnboardingCompletedAt',
      'region1', 'region2', 'preference', 'selfintro',
      'profileImages', 'profileMain', 'profileImage', 'last_login',
      'user_level', 'refundCountTotal',
      'search_birthyear1', 'search_birthyear2',
      'search_region1', 'search_region2', 'search_regions',
      'search_preference',
      'search_disconnectLocalContacts', 'search_allowFriendRequests',
      'search_allowNotifications', 'search_onlyWithPhoto', 'search_matchPremiumOnly',
      'marriage', 'search_marriage',
      'friendlist', 'blocklist',
      'emergency',
      'email', 'emailVerifiedAt',
      'phone', 'phoneVerifiedAt', 'phoneVerifiedBy',
      'createdAt', 'updatedAt'
    ])
    .populate('friendlist', 'username nickname birthyear gender')
    .populate('blocklist', 'username nickname birthyear gender');

  if (!userDoc) {
    throw new AccountError(404, '유저 없음');
  }

  // 지정 테스트 계정은 기존 로그인 세션에서도 /me 조회 즉시 권한을 보정한다.
  const forcedRole = getForcedPhoneRole(userDoc.phone) || getForcedAccountRole(userDoc.email);
  if (forcedRole && userDoc.role !== forcedRole) {
    userDoc.role = forcedRole;
    await userDoc.save();
  }

  // 스피드 매칭 남은시간/자동꺼짐 — 판정 로직은 emergencyModeService.evaluateEmergencyState()로 통일
  //  (이전에는 이 파일과 emergencyModeService.syncExpirationIfNeeded()가 같은 판정을 각자 구현했었다)
  const raw = userDoc.toObject();
  const emergencyState = evaluateEmergencyState(raw?.emergency);
  const { expired } = emergencyState;

  if (expired) {
    await User.findByIdAndUpdate(userId, {
      $set: { 'emergency.isActive': false }
    });
    console.log('[AUTH][DBG]', { step: 'me', message: 'emergency auto-off' });
  }

  const role = resolveRole(raw);
  const roles = role ? [role] : [];
  const isAdmin = resolveIsAdmin(raw);
  const searchRegions = Array.isArray(raw.search_regions) ? raw.search_regions : [];

  const user = {
    ...raw,
    role,
    roles,
    isAdmin,
    onboarding: buildOnboardingStatus(raw),
    searchRegions,
    phoneFormatted: raw.phone ? formatE164KR(raw.phone) : null,
    phoneMasked: raw.phone ? maskPhone(raw.phone) : null,
    emergency: {
      ...(raw.emergency || {}),
      ...emergencyState,
      availability: getSpeedMatchingAvailabilityForEmail(raw.email),
    },
    // null/undefined 가드
    search_birthyear1: raw.search_birthyear1 ?? null,
    search_birthyear2: raw.search_birthyear2 ?? null,
    search_region1: raw.search_region1 ?? '전체',
    search_region2: raw.search_region2 ?? '전체',
    search_preference: raw.search_preference ?? '이성친구 - 전체',
    search_disconnectLocalContacts: raw.search_disconnectLocalContacts ?? 'OFF',
    search_allowFriendRequests: raw.search_allowFriendRequests ?? 'OFF',
    search_allowNotifications: raw.search_allowNotifications ?? 'OFF',
    search_onlyWithPhoto: raw.search_onlyWithPhoto ?? 'OFF',
    search_matchPremiumOnly: raw.search_matchPremiumOnly ?? 'OFF',
    marriage: raw.marriage ?? '미혼',
    search_marriage: raw.search_marriage ?? '전체',
  };

  return { user, durationSeconds: EMERGENCY_DURATION_SECONDS };
}

// ======================================================
// 내 친구 ID 목록
// ======================================================
async function getMyFriendIds(userId) {
  const me = await User.findById(userId).select('friendlist');
  if (!me) throw new AccountError(404, '사용자 없음');
  return me.friendlist;
}

// ======================================================
// 비밀번호 변경
// ======================================================
async function changePassword(userId, current, next) {
  if (!current || !next) {
    throw new AccountError(400, '현재/새 비밀번호를 모두 입력해 주세요.');
  }
  if (String(next).length < 4) {
    throw new AccountError(400, '새 비밀번호는 4자 이상을 권장합니다.');
  }

  const user = await User.findById(userId).select('+password');
  if (!user) {
    throw new AccountError(404, '사용자를 찾을 수 없습니다.');
  }

  const isMatch = await bcrypt.compare(String(current), String(user.password));
  if (!isMatch) {
    throw new AccountError(400, '현재 비밀번호가 올바르지 않습니다.');
  }

  const isReuse = await bcrypt.compare(String(next), String(user.password));
  if (isReuse) {
    throw new AccountError(400, '이전과 다른 새 비밀번호를 사용해 주세요.');
  }

  user.password = await bcrypt.hash(String(next), 10);
  await user.save();
}

module.exports = { AccountError, getMyProfile, getMyFriendIds, changePassword };
