require('module-alias/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { generateKeyPairSync } = require('node:crypto');

const {
  computeDeeplink,
  splitTokensByTransport,
  safeNotificationFor,
  sendPushToUser,
  webLinkFor,
} = require('../src/services/push/sender');
const { buildApnsPayload, apnsConfig, sendApns } = require('../src/services/push/apns');
const {
  cleanupNativePushForLogout,
  registerToken,
  unregisterToken,
} = require('../src/services/system/pushService');
const {
  validateTestPushInput,
  sendAdminTestPush,
} = require('../src/services/admin/adminPushTestService');

test('푸시 딥링크는 채팅과 친구 알림 종류별 화면으로 제한한다', () => {
  const roomId = '507f1f77bcf86cd799439011';
  assert.equal(computeDeeplink({ type: 'chat', roomId }), `tzchat://chat/${roomId}`);
  assert.equal(computeDeeplink({ type: 'chat', roomId: '../settings' }), 'tzchat://home');
  assert.equal(computeDeeplink({ deeplink: `tzchat://chat/${roomId}?x=1` }), 'tzchat://home');
  assert.equal(webLinkFor({ type: 'chat', roomId: '../settings' }), '/home/6page');
  assert.equal(computeDeeplink({ type: 'friend_request' }), 'tzchat://friends/received');
  assert.equal(computeDeeplink({ type: 'speed_match_request' }), 'tzchat://friends/speed');
  assert.equal(computeDeeplink({ type: 'friend_request_accepted' }), 'tzchat://friends/friends');
  assert.equal(computeDeeplink({ type: 'friend_request_result' }), 'tzchat://friends/sent');
  assert.equal(webLinkFor({ type: 'speed_match_request' }), '/home/3page?tab=premium');
  assert.equal(webLinkFor({ type: 'friend_request_result' }), '/home/3page?tab=sent');
});

test('Android/iOS/Web 토큰을 모두 FCM registration token으로 분류한다', () => {
  const split = splitTokensByTransport([
    { platform: 'android', token: 'fcm-a' },
    { platform: 'web', token: 'fcm-w' },
    { platform: 'ios', token: 'fcm-ios' },
    { platform: 'ios', token: 'fcm-ios' },
  ]);
  assert.deepEqual(split.fcmTokens, ['fcm-a', 'fcm-w', 'fcm-ios']);
  assert.deepEqual(Object.keys(split), ['fcmTokens']);
});

test('APNs alert payload는 기본 소리·badge·라우팅 데이터만 포함한다', () => {
  const roomId = '507f1f77bcf86cd799439011';
  const payload = buildApnsPayload({
    title: '새 메시지',
    body: '새 메시지가 도착했습니다.',
    type: 'chat',
    roomId,
    deeplink: `tzchat://chat/${roomId}`,
    fromUserId: 'private-user-id',
  });
  assert.equal(payload.aps.sound, 'default');
  assert.equal(payload.aps.badge, 1);
  assert.equal(payload.data.roomId, roomId);
  assert.equal(Object.hasOwn(payload.data, 'fromUserId'), false);
});

test('APNs 자격증명이 없으면 준비되지 않은 상태로 명확히 구분한다', () => {
  const previous = {
    APNS_KEY_ID: process.env.APNS_KEY_ID,
    APNS_TEAM_ID: process.env.APNS_TEAM_ID,
    APNS_BUNDLE_ID: process.env.APNS_BUNDLE_ID,
    APNS_PRIVATE_KEY: process.env.APNS_PRIVATE_KEY,
    APNS_ENV: process.env.APNS_ENV,
  };
  delete process.env.APNS_KEY_ID;
  delete process.env.APNS_TEAM_ID;
  delete process.env.APNS_BUNDLE_ID;
  delete process.env.APNS_PRIVATE_KEY;
  delete process.env.APNS_ENV;
  assert.equal(apnsConfig().ready, false);
  Object.entries(previous).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
});

test('잘못된 APNS_ENV는 production으로 대체하지 않고 발송을 차단한다', async () => {
  const keys = ['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_BUNDLE_ID', 'APNS_PRIVATE_KEY', 'APNS_ENV'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.APNS_KEY_ID = 'KEY';
  process.env.APNS_TEAM_ID = 'TEAM';
  process.env.APNS_BUNDLE_ID = 'com.example.app';
  process.env.APNS_PRIVATE_KEY = 'private-key';
  process.env.APNS_ENV = 'prodution';
  assert.equal(apnsConfig().host, '');
  assert.equal(apnsConfig().ready, false);
  assert.deepEqual(await sendApns('a'.repeat(64), {}), { sent: false, reason: 'invalid_environment' });
  keys.forEach(key => {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  });
});

test('APNs 응답이 없으면 제한 시간 뒤 스트림과 연결을 정리한다', async () => {
  const keys = ['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_BUNDLE_ID', 'APNS_PRIVATE_KEY', 'APNS_ENV'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  process.env.APNS_KEY_ID = 'KEY';
  process.env.APNS_TEAM_ID = 'TEAM';
  process.env.APNS_BUNDLE_ID = 'com.example.app';
  process.env.APNS_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
  process.env.APNS_ENV = 'sandbox';

  let requestClosed = false;
  let clientDestroyed = false;
  class FakeRequest extends EventEmitter {
    setEncoding() {}
    end() {}
    close() { requestClosed = true; }
  }
  class FakeClient extends EventEmitter {
    constructor() { super(); this.destroyed = false; }
    request() { return new FakeRequest(); }
    destroy() { this.destroyed = true; clientDestroyed = true; }
    close() {}
  }
  await assert.rejects(
    sendApns('a'.repeat(64), {}, { connect: () => new FakeClient(), timeoutMs: 10 }),
    error => error.code === 'APNS_TIMEOUT',
  );
  assert.equal(requestClosed, true);
  assert.equal(clientDestroyed, true);
  keys.forEach(key => {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  });
});

test('푸시 토큰은 알림을 허용한 로그인 사용자에게 저장하고 타 사용자가 해제하지 못한다', async () => {
  const calls = [];
  const DeviceTokenModel = {
    async findOneAndUpdate(filter, update) { calls.push({ type: 'upsert', filter, update }); },
    async deleteOne(filter) { calls.push({ type: 'delete', filter }); return { deletedCount: 0 }; },
  };
  const UserModel = {
    findById() { return { select() { return this; }, lean: async () => ({ search_allowNotifications: 'ON' }) }; },
  };
  const token = 'fcm-registration-token-1234567890';
  await registerToken({ userId: 'user-a', token, platform: 'android' }, { DeviceTokenModel, UserModel });
  await unregisterToken({ userId: 'user-b', token }, { DeviceTokenModel });

  assert.deepEqual(calls[0].filter, { token });
  assert.equal(calls[0].update.userId, 'user-a');
  assert.deepEqual(calls[1].filter, { token, userId: 'user-b' });
});

test('iOS도 FCM registration token을 허용하고 잘못된 토큰은 공통 거부한다', async () => {
  const calls = [];
  const DeviceTokenModel = {
    async findOneAndUpdate(filter, update) { calls.push({ filter, update }); },
  };
  const UserModel = {
    findById() { return { select() { return this; }, lean: async () => ({ search_allowNotifications: 'ON' }) }; },
  };
  const iosFcmToken = 'ios-fcm-registration-token:1234567890';
  await registerToken(
    { userId: 'user-a', token: iosFcmToken, platform: 'ios' },
    { DeviceTokenModel, UserModel },
  );
  assert.equal(calls[0].update.platform, 'ios');
  await assert.rejects(
    registerToken({ userId: 'user-a', token: 'white space token invalid', platform: 'ios' }, { UserModel }),
    error => error.payload?.error === 'invalid_fcm_token',
  );
});

test('발송 직전 알림 OFF를 확인하고 기기 토큰을 조회하지 않는다', async () => {
  let tokenQueryCount = 0;
  const UserModel = {
    findById() { return { select() { return this; }, lean: async () => ({ search_allowNotifications: 'OFF' }) }; },
  };
  const DeviceTokenModel = {
    find() { tokenQueryCount += 1; return { lean: async () => [] }; },
  };
  const result = await sendPushToUser('user-a', { type: 'chat' }, {
    UserModel,
    DeviceTokenModel,
    admin: { messaging() { throw new Error('must not send'); } },
    isInitialized: () => true,
  });
  assert.deepEqual(result, {
    configured: true, success: 0, failure: 0, invalidRemoved: 0, skipped: 'notifications_disabled',
  });
  assert.equal(tokenQueryCount, 0);
});

test('iOS를 포함한 여러 기기를 FCM 일괄 발송하고 무효 토큰만 정리한다', async () => {
  const roomId = '507f1f77bcf86cd799439011';
  const sentMessages = [];
  const deletedFilters = [];
  const DeviceTokenModel = {
    find() {
      return { lean: async () => [
        { platform: 'android', token: 'android-fcm-token-1234567890' },
        { platform: 'ios', token: 'ios-fcm-token-123456789012345' },
        { platform: 'web', token: 'web-fcm-token-123456789012345' },
      ] };
    },
    async updateMany() {},
    async deleteMany(filter) { deletedFilters.push(filter); return { deletedCount: 1 }; },
  };
  const UserModel = {
    findById() { return { select() { return this; }, lean: async () => ({ search_allowNotifications: 'ON' }) }; },
  };
  const admin = {
    messaging() {
      return {
        async sendEachForMulticast(message) {
          sentMessages.push(message);
          return {
            successCount: 2,
            failureCount: 1,
            responses: [
              { success: true },
              { success: false, error: { code: 'messaging/registration-token-not-registered' } },
              { success: true },
            ],
          };
        },
      };
    },
  };
  const result = await sendPushToUser('user-a', {
    type: 'chat', roomId, title: '사적인 제목', body: '닉네임: 실제 대화 내용', fromUserId: 'private',
  }, { UserModel, DeviceTokenModel, admin, isInitialized: () => true });

  assert.deepEqual(result, { configured: true, success: 2, failure: 1, invalidRemoved: 1 });
  assert.equal(sentMessages[0].tokens.length, 3);
  assert.deepEqual(sentMessages[0].notification, safeNotificationFor({ type: 'chat' }));
  assert.equal(sentMessages[0].notification.body, '새 메시지가 도착했습니다.');
  assert.equal(Object.hasOwn(sentMessages[0].data, 'body'), false);
  assert.equal(Object.hasOwn(sentMessages[0].data, 'fromUserId'), false);
  assert.equal(sentMessages[0].data.roomId, roomId);
  assert.equal(sentMessages[0].apns.payload.aps.sound, 'default');
  assert.deepEqual(deletedFilters, [{ token: { $in: ['ios-fcm-token-123456789012345'] } }]);
});

test('Firebase 미구성은 토큰 조회 없이 명확한 안전 요약을 반환한다', async () => {
  const result = await sendPushToUser('user-a', {}, {
    DeviceTokenModel: { find() { throw new Error('must not query'); } },
    admin: null,
    isInitialized: () => false,
  });
  assert.deepEqual(result, {
    configured: false, success: 0, failure: 0, invalidRemoved: 0, skipped: 'not_configured',
  });
});

test('관리자 테스트 푸시는 종류와 ObjectId 및 채팅 참여 관계를 제한한다', async () => {
  const masterId = '507f1f77bcf86cd799439012';
  const targetUserId = '507f1f77bcf86cd799439013';
  const roomId = '507f1f77bcf86cd799439014';
  assert.deepEqual(validateTestPushInput({ type: 'friend_request' }, masterId), {
    targetUserId: masterId, type: 'friend_request', roomId: '',
  });
  assert.throws(() => validateTestPushInput({ type: 'custom', body: 'arbitrary' }, masterId));
  for (const forbiddenField of ['title', 'body', 'deeplink']) {
    assert.throws(() => validateTestPushInput({
      type: 'friend_request',
      [forbiddenField]: 'not-allowed',
    }, masterId));
  }
  assert.throws(() => validateTestPushInput({ type: 'chat', roomId: '../admin' }, masterId));

  let sent;
  const result = await sendAdminTestPush(
    { targetUserId, type: 'chat', roomId },
    masterId,
    {
      ChatRoomModel: {
        findOne(filter) {
          assert.deepEqual(filter, { _id: roomId, participants: targetUserId });
          return { select() { return this; }, lean: async () => ({ _id: roomId }) };
        },
      },
      sender: async (userId, payload) => {
        sent = { userId, payload };
        return { configured: true, success: 1, failure: 0, invalidRemoved: 0 };
      },
    },
  );
  assert.equal(sent.userId, targetUserId);
  assert.deepEqual(sent.payload, { type: 'chat', roomId });
  assert.equal(result.success, 1);
});

test('로그아웃 푸시 정리는 인증 사용자와 현재 기기 토큰 조합만 해제한다', async () => {
  const calls = [];
  const token = 'logout-fcm-registration-token-1234567890';
  assert.equal(await cleanupNativePushForLogout('user-a', token, async input => calls.push(input)), true);
  assert.deepEqual(calls, [{ userId: 'user-a', token }]);
  assert.equal(await cleanupNativePushForLogout('', token, async input => calls.push(input)), false);
  assert.equal(await cleanupNativePushForLogout('user-a', 'bad token', async input => calls.push(input)), false);
  assert.equal(calls.length, 1);
});
