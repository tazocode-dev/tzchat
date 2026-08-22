// src/services/chat/friendRequestManageService.js
// ────────────────────────────────────────────────────────────
// 친구 신청 처리(수락/거절/차단)/목록 도메인 서비스 (지침 §1).
// routes/chat/friendRequestManageRouter.js에서 분리.
// ────────────────────────────────────────────────────────────

const mongoose = require('mongoose');
const { isValidObjectId } = mongoose;
const { Message, FriendRequest, User } = require('@/models');
const { createOrGetChatRoom } = require('@/services/chat/chatRoomService');
const { markNotificationChanged } = require('@/services/chat/friendRelationService');
const { areUsersBlocked } = require('@/services/chat/blockPolicyService');

class FriendRequestManageError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const USER_MIN_FIELDS = 'username nickname birthyear gender';

function matchTypeCondition(matchType = 'general') {
  if (matchType === 'speed') return { matchType: 'speed' };
  if (matchType === 'all') return {};
  return { $or: [{ matchType: 'general' }, { matchType: { $exists: false } }] };
}

async function populateRequest(doc) {
  if (!doc) return null;
  return doc.populate([
    { path: 'from', select: USER_MIN_FIELDS },
    { path: 'to',   select: USER_MIN_FIELDS },
  ]);
}

/* =========================
 *  🤝 수락 (채팅방 ID 반환)
 * ========================= */
async function acceptRequest(myId, id, dependencies = {}) {
  if (!isValidObjectId(id)) throw new FriendRequestManageError(400, '유효하지 않은 요청 ID입니다.');

  const FriendRequestModel = dependencies.FriendRequestModel || FriendRequest;
  const checkBlocked = dependencies.areUsersBlocked || areUsersBlocked;
  const pendingRequest = await FriendRequestModel.findOne({ _id: id, to: myId, status: 'pending' });
  if (!pendingRequest) throw new FriendRequestManageError(403, '권한 없음 또는 신청 없음/이미 처리됨');
  if (await checkBlocked(myId, pendingRequest.from, dependencies)) {
    throw new FriendRequestManageError(403, '차단 관계에서는 신청을 수락할 수 없습니다.');
  }

  const request = await FriendRequestModel.findOneAndUpdate(
    { _id: id, to: myId, status: 'pending' },
    { $set: { status: 'accepted' } },
    { new: true }
  );
  if (!request) throw new FriendRequestManageError(403, '권한 없음 또는 신청 없음/이미 처리됨');

  const fromId = String(request.from);
  const toId   = String(request.to);

  const toObjId   = new mongoose.Types.ObjectId(toId);
  const fromObjId = new mongoose.Types.ObjectId(fromId);

  await Promise.all([
    User.updateOne({ _id: toObjId },   { $addToSet: { friendlist: fromObjId } }),
    User.updateOne({ _id: fromObjId }, { $addToSet: { friendlist: toObjId   } }),
    markNotificationChanged([fromId, toId], 'friends'),
    ...(request.matchType === 'speed'
      ? [markNotificationChanged([fromId, toId], 'speedResults')]
      : []),
  ]);

  let roomId = null;
  try {
    // ✅ chatRoomService.createOrGetChatRoom()로 통일 — 이전에는 이 파일이
    //    find-or-create 로직을 별도로 재구현하고 있었다(chatRoom.controller.js의
    //    /create 엔드포인트가 쓰는 것과 동일한 로직의 중복).
    const { chatRoom } = await createOrGetChatRoom(toId, fromId);

    roomId = String(chatRoom._id);

    const systemMessage = await Message.create({
      chatRoom: chatRoom._id,
      sender: toObjId, // myId
      content: '채팅이 시작되었습니다.',
    });
    chatRoom.messages.push(systemMessage._id);
    await chatRoom.save();
  } catch (chatErr) {
    console.error('[friendRequestManageService][ERR] chat/message create failed (ignored)', chatErr);
  }

  return { request, fromId, toId, roomId };
}

/* =========================
 *  ❌ 거절
 * ========================= */
async function rejectRequest(myId, id) {
  const request = await FriendRequest.findOneAndUpdate(
    { _id: id, to: myId, status: 'pending' },
    { $set: { status: 'rejected' } },
    { new: true }
  );
  if (!request) throw new FriendRequestManageError(403, '권한 없음 또는 신청 없음/이미 처리됨');
  if (request.matchType === 'speed') {
    await markNotificationChanged([request.from, request.to], 'speedResults');
  }
  return request;
}

/* =========================
 *  🚫 받은 신청에서 즉시 차단
 * ========================= */
async function blockFromRequest(myId, id) {
  const request = await FriendRequest.findOneAndUpdate(
    { _id: id, to: myId, status: 'pending' },
    { $set: { status: 'rejected' } },
    { new: true }
  );
  if (!request) throw new FriendRequestManageError(403, '권한 없음 또는 신청 없음/이미 처리됨');

  const fromId = String(request.from);
  if (!isValidObjectId(fromId)) throw new FriendRequestManageError(400, '유효하지 않은 사용자 ID입니다.');

  const myObjId = new mongoose.Types.ObjectId(myId);
  const fromObjId = new mongoose.Types.ObjectId(fromId);

  await Promise.all([
    User.updateOne({ _id: myObjId },   { $addToSet: { blocklist: fromObjId }, $pull: { friendlist: fromObjId } }),
    User.updateOne({ _id: fromObjId }, { $pull: { friendlist: myObjId } }),
    FriendRequest.updateMany(
      { status: 'pending', $or: [ { from: myObjId, to: fromObjId }, { from: fromObjId, to: myObjId } ] },
      { $set: { status: 'rejected' } }
    )
  ]);

  await Promise.all([
    markNotificationChanged(myId, 'blocks'),
    ...(request.matchType === 'speed'
      ? [markNotificationChanged([request.from, request.to], 'speedResults')]
      : []),
  ]);

  return { request, fromId };
}

/* =========================
 *  📬 받은/보낸 목록
 * ========================= */
async function getReceivedRequests(myId, matchType = 'general') {
  return FriendRequest.find({ to: myId, status: 'pending', ...matchTypeCondition(matchType) })
    .sort({ createdAt: -1 })
    .populate('from', USER_MIN_FIELDS);
}

async function getSentRequests(myId, matchType = 'general') {
  return FriendRequest.find({ from: myId, status: 'pending', ...matchTypeCondition(matchType) })
    .sort({ createdAt: -1 })
    .populate('to', USER_MIN_FIELDS);
}

async function getSpeedResults(myId) {
  return FriendRequest.find({
    matchType: 'speed',
    status: { $in: ['pending', 'accepted'] },
    $or: [{ from: myId }, { to: myId }],
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .populate('from', USER_MIN_FIELDS)
    .populate('to', USER_MIN_FIELDS);
}

module.exports = {
  FriendRequestManageError,
  populateRequest,
  acceptRequest,
  rejectRequest,
  blockFromRequest,
  getReceivedRequests,
  getSentRequests,
  getSpeedResults,
};
