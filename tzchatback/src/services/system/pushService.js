// src/services/system/pushService.js
// ────────────────────────────────────────────────────────────
// 디바이스 푸시 토큰 등록/해제 도메인 서비스 (지침 §1). routes/system/pushRouter.js에서 분리.
// ────────────────────────────────────────────────────────────

const { DeviceToken, User } = require('@/models');
const retention = require('@/config/retention');

class PushError extends Error {
  constructor(status, payload) {
    super(payload?.message || payload?.error);
    this.status = status;
    this.payload = payload;
  }
}

function isValidFcmRegistrationToken(token) {
  const value = String(token || '').trim();
  return value.length >= 20
    && value.length <= 4096
    && /^[A-Za-z0-9_:.~-]+$/.test(value);
}

async function isNotificationsAllowed(userId, UserModel = User) {
  const me = await UserModel.findById(userId).select('search_allowNotifications').lean();
  const flag = String(me?.search_allowNotifications || '').toUpperCase();
  return flag === 'ON';
}

// 토큰 등록 (upsert)
// - 프로필에서 알림 OFF면 등록 거부(403) + 기존 토큰 정리
async function registerToken({ userId, token, platform, appVersion }, dependencies = {}) {
  const DeviceTokenModel = dependencies.DeviceTokenModel || DeviceToken;
  const UserModel = dependencies.UserModel || User;
  const normalizedPlatform = String(platform || '').toLowerCase();
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken || !['android', 'ios', 'web'].includes(normalizedPlatform)) {
    throw new PushError(400, { error: 'token, platform 필수' });
  }
  if (!isValidFcmRegistrationToken(normalizedToken)) throw new PushError(400, { error: 'invalid_fcm_token' });

  const allow = await isNotificationsAllowed(userId, UserModel);
  if (!allow) {
    console.warn('[PUSH][BLOCKED]', { userId, reason: 'notifications OFF in profile' });
    try {
      await DeviceTokenModel.deleteMany({ userId, platform: normalizedPlatform });
    } catch {}
    throw new PushError(403, { error: 'notifications_disabled', message: '프로필에서 알림이 꺼져 있습니다.' });
  }

  await DeviceTokenModel.findOneAndUpdate(
    { token: normalizedToken },
    {
      userId,
      platform: normalizedPlatform,
      appVersion: appVersion || '',
      lastSeenAt: new Date(),
      expiresAt: new Date(Date.now() + Number(retention.DEVICE_TOKEN_STALE_DAYS || 180) * 24 * 60 * 60 * 1000),
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  console.log('[PUSH][REG]', { userId, platform: normalizedPlatform });
}

// 토큰 해제
async function unregisterToken({ userId, token }, dependencies = {}) {
  const DeviceTokenModel = dependencies.DeviceTokenModel || DeviceToken;
  if (!token) {
    throw new PushError(400, { error: 'token 필수' });
  }

  const { deletedCount } = await DeviceTokenModel.deleteOne({ token, userId });
  console.log('[PUSH][UNREG]', { userId, deletedCount });
}

async function cleanupNativePushForLogout(userId, token, unregister = unregisterToken) {
  if (!userId || !isValidFcmRegistrationToken(token)) return false;
  await unregister({ userId, token });
  return true;
}

module.exports = {
  PushError,
  isValidFcmRegistrationToken,
  registerToken,
  unregisterToken,
  cleanupNativePushForLogout,
};
