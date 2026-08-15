// src/services/search/emergencyModeService.js
// ────────────────────────────────────────────────────────────
// Emergency 모드 도메인 서비스 (지침 §1). routes/search/emergencyRouter.js에서 분리.
// ────────────────────────────────────────────────────────────

const { User } = require('@/models');
const {
  EMERGENCY_DURATION_SECONDS,
  computeSessionRemaining,
  getSpeedMatchingAvailabilityForEmail,
} = require('@/config/emergency');
const { isSpeedMatchingTestEmail } = require('@/config/emailAuthPolicy');

class EmergencyError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// ✅ 만료 판정(순수 함수) — DB를 만지지 않고 emergency 서브도큐먼트만 보고 판단한다.
//    accountService.js(/api/me)와 이 서비스의 syncExpirationIfNeeded()가 각자
//    같은 "활성인데 남은 시간이 없으면 만료" 판정을 따로 구현하고 있던 것을 하나로 모았다.
function evaluateEmergencyState(emergency, nowMs = Date.now()) {
  const wasVisible = emergency?.isActive === true;
  const activatedAt = emergency?.activatedAt || null;
  const expiresAt = emergency?.expiresAt || (
    activatedAt
      ? new Date(new Date(activatedAt).getTime() + EMERGENCY_DURATION_SECONDS * 1000)
      : null
  );
  const remainingSeconds = computeSessionRemaining({ ...emergency, activatedAt, expiresAt }, nowMs);
  const hasSession = Boolean(activatedAt) && remainingSeconds > 0;
  const expired = Boolean(activatedAt) && remainingSeconds <= 0;

  return {
    isActive: hasSession && wasVisible,
    hasSession,
    activatedAt,
    expiresAt,
    slotKey: emergency?.slotKey || '',
    remainingSeconds,
    expired,
  };
}

// 🧹 만료 동기화: 활성 중 만료되었으면 자동 OFF
async function syncExpirationIfNeeded(userId) {
  const me = await User.findById(userId).select('emergency').lean();
  const { expired } = evaluateEmergencyState(me?.emergency);
  if (!expired) return;

  await User.findByIdAndUpdate(userId, {
    $set: { 'emergency.isActive': false }
  });
  console.log('🧹[SYNC][AUTO_OFF]', { userId });
}

async function turnOn(userId, dependencies = {}) {
  const UserModel = dependencies.UserModel || User;
  const now = dependencies.now ? new Date(dependencies.now) : new Date();
  const user = await UserModel.findById(userId).select('email emergency').lean();
  if (!user) throw new EmergencyError(404, '사용자를 찾을 수 없습니다.');

  const availability = getSpeedMatchingAvailabilityForEmail(user.email, now.getTime());
  const isTestAccount = isSpeedMatchingTestEmail(user.email);

  const previous = evaluateEmergencyState(user.emergency, now.getTime());
  if (previous.hasSession) {
    await UserModel.findByIdAndUpdate(userId, { $set: { 'emergency.isActive': true } });
    return {
      isActive: true,
      hasSession: true,
      resumed: true,
      activatedAt: previous.activatedAt,
      expiresAt: previous.expiresAt,
      slotKey: previous.slotKey,
      remainingSeconds: previous.remainingSeconds,
      durationSeconds: EMERGENCY_DURATION_SECONDS,
      availability,
    };
  }

  if (!availability.isOpen) {
    throw new EmergencyError(403, '지금은 스피드 매칭 시작 시간이 아닙니다.', { availability });
  }

  const slotKey = availability.currentWindow.slotKey;
  if (!isTestAccount && previous.slotKey === slotKey) {
    throw new EmergencyError(409, '이번 시간대의 스피드 매칭 1시간을 이미 사용했습니다.', { availability });
  }

  const expiresAt = new Date(now.getTime() + EMERGENCY_DURATION_SECONDS * 1000);
  await UserModel.findByIdAndUpdate(userId, {
    $set: {
      'emergency.isActive': true,
      'emergency.activatedAt': now,
      'emergency.expiresAt': expiresAt,
      'emergency.slotKey': slotKey,
    }
  });

  return {
    isActive: true,
    hasSession: true,
    resumed: false,
    activatedAt: now,
    expiresAt,
    slotKey,
    remainingSeconds: EMERGENCY_DURATION_SECONDS,
    durationSeconds: EMERGENCY_DURATION_SECONDS,
    availability,
  };
}

async function turnOff(userId) {
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { 'emergency.isActive': false } },
    { new: true }
  ).select('email emergency').lean();
  if (!user) throw new EmergencyError(404, '사용자를 찾을 수 없습니다.');

  const state = evaluateEmergencyState(user.emergency);
  return {
    ...state,
    isActive: false,
    durationSeconds: EMERGENCY_DURATION_SECONDS,
    availability: getSpeedMatchingAvailabilityForEmail(user.email),
  };
}

function enrich(users) {
  return (users || []).map(u => ({
    ...u,
    emergency: {
      ...(u.emergency || {}),
      ...evaluateEmergencyState(u?.emergency),
    }
  }));
}

async function listActiveUsers(requesterEmail = '') {
  const now = new Date();
  const windowAgo = new Date(now.getTime() - EMERGENCY_DURATION_SECONDS * 1000);
  const users = await User.find({
    'emergency.isActive': true,
    $or: [
      { 'emergency.expiresAt': { $gt: now } },
      {
        'emergency.expiresAt': { $in: [null] },
        'emergency.activatedAt': { $gte: windowAgo },
      },
    ],
  }).select('-password').lean();

  return {
    users: enrich(users),
    durationSeconds: EMERGENCY_DURATION_SECONDS,
    availability: getSpeedMatchingAvailabilityForEmail(requesterEmail),
  };
}

async function filterActiveUsersByRegion(regions, requesterEmail = '') {
  const now = new Date();
  const windowAgo = new Date(now.getTime() - EMERGENCY_DURATION_SECONDS * 1000);

  const baseCondition = {
    'emergency.isActive': true,
    $or: [
      { 'emergency.expiresAt': { $gt: now } },
      {
        'emergency.expiresAt': { $in: [null] },
        'emergency.activatedAt': { $gte: windowAgo },
      },
    ],
  };

  const useAll = !regions || regions.length === 0 || regions.some(r => r.region1 === '전체');

  const orConditions = useAll ? [] : regions.map(({ region1, region2 }) => {
    return (region2 === '전체') ? { region1 } : { region1, region2 };
  });

  const query = useAll
    ? baseCondition
    : { $and: [baseCondition, { $or: orConditions }] };

  console.log('[DB][QRY]', { model: 'User', op: 'find', criteria: query });

  const users = await User.find(query).select('-password').lean();
  return {
    users: enrich(users),
    durationSeconds: EMERGENCY_DURATION_SECONDS,
    availability: getSpeedMatchingAvailabilityForEmail(requesterEmail),
  };
}

module.exports = {
  EmergencyError,
  evaluateEmergencyState,
  syncExpirationIfNeeded,
  turnOn,
  turnOff,
  listActiveUsers,
  filterActiveUsersByRegion,
};
