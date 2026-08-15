// tzchatback/src/services/push/sender.js
// -------------------------------------------------------------
// Android/iOS/Web FCM 발송 헬퍼. Firebase 미구성 시 서버는 계속 동작하며
// 호출자에게 토큰 값이 없는 안전한 발송 요약만 반환한다.
// -------------------------------------------------------------
const { DeviceToken, User } = require('@/models');
const retention = require('@/config/retention');
const firebase = require('./firebase');

const MAX_TOKENS_PER_BATCH = 500;
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const SHOULD_DELETE_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);

function tokenActivityUpdate() {
  const now = new Date();
  const staleDays = Number(retention.DEVICE_TOKEN_STALE_DAYS || 180);
  return { lastSeenAt: now, expiresAt: new Date(now.getTime() + staleDays * 24 * 60 * 60 * 1000) };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function isValidRoomId(value) {
  return OBJECT_ID_PATTERN.test(String(value || ''));
}

function computeDeeplink(payload = {}) {
  const requestedDeeplink = String(payload.deeplink || '');
  if (requestedDeeplink) {
    if (requestedDeeplink.startsWith('tzchat://chat/')) {
      const roomId = requestedDeeplink.slice('tzchat://chat/'.length);
      return isValidRoomId(roomId) ? requestedDeeplink : 'tzchat://home';
    }
    if (['tzchat://friends/received', 'tzchat://friends/speed', 'tzchat://friends/friends', 'tzchat://friends/sent', 'tzchat://home'].includes(requestedDeeplink)) {
      return requestedDeeplink;
    }
  }
  const type = String(payload.type || '');
  const roomId = String(payload.roomId || '');
  if (type === 'chat' && isValidRoomId(roomId)) return `tzchat://chat/${roomId}`;
  if (type === 'friend_request') return 'tzchat://friends/received';
  if (type === 'speed_match_request') return 'tzchat://friends/speed';
  if (type === 'friend_request_accepted') return 'tzchat://friends/friends';
  if (type === 'friend_request_result') return 'tzchat://friends/sent';
  return 'tzchat://home';
}

// 세 플랫폼 모두 Firebase registration token을 사용한다. 플랫폼 값은
// 운영 진단용으로 보존하되 전송 transport를 나누는 데 사용하지 않는다.
function splitTokensByTransport(tokensDoc = []) {
  return {
    fcmTokens: uniq(tokensDoc
      .filter(tokenDoc => ['android', 'ios', 'web'].includes(tokenDoc.platform))
      .map(tokenDoc => tokenDoc.token)
      .filter(Boolean)),
  };
}

function webLinkFor(payload = {}) {
  if (payload.type === 'chat' && isValidRoomId(payload.roomId)) return `/home/chat/${payload.roomId}`;
  if (payload.type === 'friend_request') return '/home/3page?tab=received';
  if (payload.type === 'speed_match_request') return '/home/3page?tab=premium';
  if (payload.type === 'friend_request_accepted') return '/home/3page?tab=friends';
  if (payload.type === 'friend_request_result') return '/home/3page?tab=sent';
  return '/home/6page';
}

// 호출자가 전달한 닉네임·메시지 본문이 잠금화면 또는 data에 섞이지 않도록
// 알림 종류별 비식별 고정 문구만 사용한다.
function safeNotificationFor(payload = {}) {
  switch (String(payload.type || '')) {
    case 'chat':
      return { title: '새 메시지', body: '새 메시지가 도착했습니다.' };
    case 'friend_request':
      return { title: '매칭 신청 도착', body: '새 매칭 신청이 도착했습니다.' };
    case 'speed_match_request':
      return { title: '스피드 매칭 신청 도착', body: '새 스피드 매칭 신청이 도착했습니다.' };
    case 'friend_request_accepted':
      return { title: '매칭 신청 수락', body: '보낸 매칭 신청이 수락되었습니다.' };
    case 'friend_request_result':
      return { title: '매칭 신청 결과', body: '보낸 매칭 신청 상태가 변경되었습니다.' };
    default:
      return { title: 'TZChat 알림', body: '새 알림이 있습니다.' };
  }
}

function emptySummary(configured, extra = {}) {
  return { configured, success: 0, failure: 0, invalidRemoved: 0, ...extra };
}

async function sendPushToUser(userId, payload = {}, dependencies = {}) {
  const DeviceTokenModel = dependencies.DeviceTokenModel || DeviceToken;
  const UserModel = dependencies.UserModel || User;
  const firebaseAdmin = Object.hasOwn(dependencies, 'admin') ? dependencies.admin : firebase.admin;
  const configured = dependencies.isInitialized ? dependencies.isInitialized() : firebase.isInitialized();

  if (!configured || !firebaseAdmin) return emptySummary(false, { skipped: 'not_configured' });

  try {
    // 설정 OFF가 된 뒤 큐에 들어온 이벤트도 발송되지 않게 발송 직전에 재확인한다.
    const target = await UserModel.findById(userId).select('search_allowNotifications').lean();
    if (String(target?.search_allowNotifications || '').toUpperCase() !== 'ON') {
      return emptySummary(true, { skipped: 'notifications_disabled' });
    }

    const tokensDoc = await DeviceTokenModel.find({ userId }).lean();
    const { fcmTokens } = splitTokensByTransport(tokensDoc);
    if (!fcmTokens.length) return emptySummary(true, { skipped: 'no_tokens' });

    const notification = safeNotificationFor(payload);
    const roomId = isValidRoomId(payload.roomId) ? String(payload.roomId) : '';
    const deeplink = computeDeeplink({ ...payload, roomId });
    const baseMessage = {
      notification,
      data: {
        type: String(payload.type || ''),
        roomId,
        deeplink,
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      android: {
        priority: 'high',
        notification: { channelId: 'tzchat_alerts_v2', sound: 'default', visibility: 'private' },
      },
      apns: {
        payload: { aps: { sound: 'default', badge: 1 } },
      },
      webpush: {
        fcmOptions: { link: payload.webLink || webLinkFor(payload) },
      },
    };

    let totalSuccess = 0;
    let totalFailure = 0;
    const tokensToDelete = [];
    for (const batch of chunk(fcmTokens, MAX_TOKENS_PER_BATCH)) {
      const response = await firebaseAdmin.messaging().sendEachForMulticast({ ...baseMessage, tokens: batch });
      totalSuccess += response.successCount || 0;
      totalFailure += response.failureCount || 0;
      response.responses.forEach((result, index) => {
        if (!result.success && SHOULD_DELETE_CODES.has(result.error?.code)) tokensToDelete.push(batch[index]);
      });
      const successTokens = batch.filter((_, index) => response.responses[index]?.success);
      if (successTokens.length) {
        await DeviceTokenModel.updateMany(
          { token: { $in: successTokens } },
          { $set: tokenActivityUpdate() },
        ).catch(() => {});
      }
    }

    const invalidTokens = uniq(tokensToDelete);
    let invalidRemoved = 0;
    if (invalidTokens.length) {
      const deletion = await DeviceTokenModel.deleteMany({ token: { $in: invalidTokens } }).catch(() => null);
      invalidRemoved = Number(deletion?.deletedCount || 0);
    }
    const summary = {
      configured: true,
      success: totalSuccess,
      failure: totalFailure,
      invalidRemoved,
    };
    console.log('[push] 발송 결과:', { ...summary, userId: String(userId) });
    return summary;
  } catch (error) {
    console.error('[push] 발송 오류:', { code: error?.code || 'send_failed' });
    return emptySummary(true, { failure: 1, skipped: 'send_error' });
  }
}

module.exports = {
  isValidRoomId,
  computeDeeplink,
  splitTokensByTransport,
  webLinkFor,
  safeNotificationFor,
  sendPushToUser,
};
