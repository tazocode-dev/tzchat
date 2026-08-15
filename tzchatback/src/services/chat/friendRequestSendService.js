// src/services/chat/friendRequestSendService.js
// ────────────────────────────────────────────────────────────
// 친구 신청 발송/취소 도메인 서비스 (지침 §1). routes/chat/friendRequestSendRouter.js에서 분리.
// - 초기 홍보 정책에 따라 모든 신청은 무료다.
// - 일반/스피드 신청은 matchType으로 구분해 결과 화면에서도 출처를 유지한다.
// ────────────────────────────────────────────────────────────

const mongoose = require('mongoose');
const { isValidObjectId } = mongoose;
const { FriendRequest, User } = require('@/models');
const { sendPushToUser } = require('@/services/push/sender');
const { evaluateEmergencyState } = require('@/services/search/emergencyModeService');
const { markNotificationChanged } = require('@/services/chat/friendRelationService');

class FriendRequestSendError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const MATCH_CONFIG = {
  general: { label: '일반 매칭' },
  speed: { label: '스피드 매칭' },
};

async function validateRequestTargets(fromId, toId, matchType) {
  if (!toId) throw new FriendRequestSendError(400, '대상 사용자(to)가 필요합니다.');
  if (!isValidObjectId(toId)) throw new FriendRequestSendError(400, '유효하지 않은 사용자 ID입니다.');
  if (fromId === toId) throw new FriendRequestSendError(400, '자기 자신에게 친구 신청할 수 없습니다');

  const [fromUserLean, toUser] = await Promise.all([
    User.findById(fromId).select('_id nickname suspended friendlist blocklist emergency').lean(),
    User.findById(toId).select('_id nickname suspended friendlist blocklist emergency').lean()
  ]);
  if (!fromUserLean) throw new FriendRequestSendError(404, '내 사용자 정보를 찾을 수 없습니다.');
  if (!toUser) throw new FriendRequestSendError(404, '대상 사용자를 찾을 수 없습니다.');
  if (fromUserLean.suspended || toUser.suspended) throw new FriendRequestSendError(403, '정지된 계정입니다.');

  if ((fromUserLean.friendlist || []).some(fid => String(fid) === toId)) {
    throw new FriendRequestSendError(400, '이미 친구 상태입니다.');
  }

  const iBlockedHim = (fromUserLean.blocklist || []).some(bid => String(bid) === toId);
  const heBlockedMe = (toUser.blocklist || []).some(bid => String(bid) === fromId);
  if (iBlockedHim || heBlockedMe) {
    throw new FriendRequestSendError(400, '차단 상태에서는 친구 신청이 불가합니다.');
  }

  if (matchType === 'speed') {
    const fromSpeed = evaluateEmergencyState(fromUserLean.emergency);
    const toSpeed = evaluateEmergencyState(toUser.emergency);
    if (!fromSpeed.isActive) {
      throw new FriendRequestSendError(403, '스피드 매칭에 참여 중일 때만 신청할 수 있습니다.');
    }
    if (!toSpeed.isActive) {
      throw new FriendRequestSendError(409, '상대방의 스피드 매칭 참여가 종료되었습니다.');
    }
  }

  const exists = await FriendRequest.findOne({
    $or: [
      { from: fromId, to: toId, status: 'pending' },
      { from: toId,   to: fromId, status: 'pending' },
    ]
  }).lean();
  if (exists) throw new FriendRequestSendError(400, '이미 진행 중인 친구 신청이 있습니다.');

  return { fromUserLean, toUser };
}

/**
 * @param {'general'|'speed'} matchType
 */
async function sendFriendRequest(fromId, toId, message, matchType = 'general') {
  if (!MATCH_CONFIG[matchType]) {
    throw new FriendRequestSendError(400, '올바르지 않은 매칭 유형입니다.');
  }
  const { fromUserLean } = await validateRequestTargets(fromId, toId, matchType);

  const createdReq = await FriendRequest.create({
    from: fromId,
    to: toId,
    message: message || '',
    matchType,
    status: 'pending',
  });

  await Promise.all([
    User.updateOne({ _id: fromId }, { $inc: { sentRequestCountTotal: 1 } }),
    User.updateOne({ _id: toId },   { $inc: { receivedRequestCountTotal: 1 } }),
    markNotificationChanged(toId, matchType === 'speed' ? 'speedResults' : 'friendRequests'),
  ]);

  return { createdReq, fromUserLean };
}

async function notifyRequestCreated({ emit, createdReq, toId, fromNick }) {
  try {
    if (emit && emit.friendRequestCreated) emit.friendRequestCreated(createdReq);
  } catch (e) { console.error('[friendRequestSendService][ERR] socket-emit failed', e); }
  try {
    const isSpeed = createdReq?.matchType === 'speed';
    await sendPushToUser(toId, {
      title: isSpeed ? '스피드 매칭 신청 도착' : '매칭 신청 도착',
      // 잠금 화면에서 상대 닉네임이나 신청 메시지를 노출하지 않는다.
      body: `새 ${isSpeed ? '스피드 ' : ''}매칭 신청이 도착했습니다.`,
      type: isSpeed ? 'speed_match_request' : 'friend_request',
      roomId: '',
    });
  } catch (pushErr) { console.error('[friendRequestSendService][ERR] push failed', pushErr); }
}

async function cancelFriendRequest(fromId, id) {
  const USER_MIN_FIELDS = 'username nickname birthyear gender';
  const deleted = await FriendRequest
    .findOneAndDelete({ _id: id, from: fromId, status: 'pending' })
    .populate('from to', USER_MIN_FIELDS);

  if (!deleted) throw new FriendRequestSendError(404, '삭제할 친구 신청이 없거나 권한이 없습니다.');
  if (deleted.matchType === 'speed') {
    await markNotificationChanged([deleted.from?._id || deleted.from, deleted.to?._id || deleted.to], 'speedResults');
  }
  return deleted;
}

module.exports = {
  FriendRequestSendError,
  MATCH_CONFIG,
  sendFriendRequest,
  notifyRequestCreated,
  cancelFriendRequest,
};
