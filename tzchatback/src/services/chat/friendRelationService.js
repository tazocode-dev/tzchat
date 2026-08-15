// src/services/chat/friendRelationService.js
// ────────────────────────────────────────────────────────────
// 친구/차단 관계 도메인 서비스 (지침 §1). routes/chat/friendRelationRouter.js에서 분리.
// ────────────────────────────────────────────────────────────

const mongoose = require('mongoose');
const { isValidObjectId } = mongoose;
const { User, FriendRequest } = require('@/models');
const { getUnreadTotal } = require('@/services/chat/chatRoomService');

class FriendRelationError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const USER_MIN_FIELDS = 'username nickname birthyear gender';
const SAFE_USER_FIELDS =
  'username nickname birthyear gender region1 region2 preference profileImages profileMain ' +
  'search_birthyear1 search_birthyear2 search_region1 search_region2 search_preference user_level ' +
  'last_login marriage createdAt updatedAt';

const NOTIFICATION_FIELDS = Object.freeze({
  friendRequests: 'friendRequestsAt',
  speedResults: 'speedResultsAt',
  friends: 'friendsAt',
  blocks: 'blocksAt',
});

function notificationField(category) {
  const field = NOTIFICATION_FIELDS[String(category || '')];
  if (!field) throw new FriendRelationError(400, '올바르지 않은 알림 유형입니다.');
  return field;
}

function isNewer(changedAt, seenAt) {
  if (!changedAt) return false;
  return new Date(changedAt).getTime() > (seenAt ? new Date(seenAt).getTime() : 0);
}

function buildNotificationCategories(changes = {}, seen = {}) {
  return Object.fromEntries(
    Object.entries(NOTIFICATION_FIELDS).map(([category, field]) => [
      category,
      isNewer(changes[field], seen[field]),
    ])
  );
}

function newestDate(...values) {
  return values
    .filter(Boolean)
    .map(value => new Date(value))
    .filter(value => Number.isFinite(value.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0] || null;
}

async function markNotificationChanged(userIds, category) {
  const field = notificationField(category);
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean).map(String))]
    .filter(isValidObjectId)
    .map(id => new mongoose.Types.ObjectId(id));
  if (!ids.length) return;
  await User.updateMany(
    { _id: { $in: ids } },
    { $currentDate: { [`notificationChanges.${field}`]: true } }
  );
}

async function getNotificationStatus(myId) {
  const [user, chatUnreadTotal, latestGeneralRequest, latestSpeedResult] = await Promise.all([
    User.findById(myId).select('notificationChanges notificationSeenAt').lean(),
    getUnreadTotal(myId),
    FriendRequest.findOne({
      to: myId,
      status: 'pending',
      $or: [{ matchType: 'general' }, { matchType: { $exists: false } }],
    }).sort({ createdAt: -1 }).select('createdAt').lean(),
    FriendRequest.findOne({
      matchType: 'speed',
      status: { $in: ['pending', 'accepted'] },
      $or: [{ from: myId }, { to: myId }],
    }).sort({ updatedAt: -1, createdAt: -1 }).select('updatedAt createdAt').lean(),
  ]);
  if (!user) throw new FriendRelationError(404, '내 정보가 없습니다.');

  const changes = {
    ...(user.notificationChanges || {}),
    friendRequestsAt: newestDate(user.notificationChanges?.friendRequestsAt, latestGeneralRequest?.createdAt),
    speedResultsAt: newestDate(
      user.notificationChanges?.speedResultsAt,
      latestSpeedResult?.updatedAt,
      latestSpeedResult?.createdAt
    ),
  };
  const seen = user.notificationSeenAt || {};
  const categories = buildNotificationCategories(changes, seen);
  categories.friendRequests = categories.friendRequests && Boolean(latestGeneralRequest);
  categories.speedResults = categories.speedResults && Boolean(latestSpeedResult);

  return { chatUnreadTotal, categories };
}

async function markNotificationRead(myId, category) {
  const field = notificationField(category);
  const result = await User.updateOne(
    { _id: myId },
    { $set: { [`notificationSeenAt.${field}`]: new Date() } }
  );
  if (!result.matchedCount) throw new FriendRelationError(404, '내 정보가 없습니다.');
  return getNotificationStatus(myId);
}

async function getFriendList(myId) {
  const user = await User.findById(myId).populate('friendlist', USER_MIN_FIELDS);
  return user?.friendlist || [];
}

async function removeFriend(myId, targetId) {
  if (!isValidObjectId(targetId)) throw new FriendRelationError(400, '유효하지 않은 사용자 ID입니다.');

  const myObjId = new mongoose.Types.ObjectId(myId);
  const targetObjId = new mongoose.Types.ObjectId(targetId);

  const [r1, r2] = await Promise.all([
    User.updateOne({ _id: myObjId },    { $pull: { friendlist: targetObjId } }),
    User.updateOne({ _id: targetObjId },{ $pull: { friendlist: myObjId } }),
  ]);

  if ((r1.modifiedCount || 0) + (r2.modifiedCount || 0) > 0) {
    await markNotificationChanged([myId, targetId], 'friends');
  }

  return { modifiedA: r1.modifiedCount || 0, modifiedB: r2.modifiedCount || 0 };
}

async function getBlockList(myId) {
  const user = await User.findById(myId).populate('blocklist', USER_MIN_FIELDS);
  return user?.blocklist || [];
}

async function createBlock(myId, targetId) {
  if (!isValidObjectId(targetId)) throw new FriendRelationError(400, '유효하지 않은 사용자 ID입니다.');
  if (myId === targetId) throw new FriendRelationError(400, '자기 자신을 차단할 수 없습니다.');

  const myObjId = new mongoose.Types.ObjectId(myId);
  const targetObjId = new mongoose.Types.ObjectId(targetId);

  const [rBlock, rPullA, rPullB, rReject] = await Promise.all([
    User.updateOne({ _id: myObjId },    { $addToSet: { blocklist: targetObjId } }),
    User.updateOne({ _id: myObjId },    { $pull: { friendlist: targetObjId } }),
    User.updateOne({ _id: targetObjId },{ $pull: { friendlist: myObjId } }),
    FriendRequest.updateMany(
      { status: 'pending', $or: [ { from: myObjId, to: targetObjId }, { from: targetObjId, to: myObjId } ] },
      { $set: { status: 'rejected' } }
    ),
  ]);

  if (rBlock.modifiedCount) await markNotificationChanged(myId, 'blocks');
  if ((rPullA.modifiedCount || 0) + (rPullB.modifiedCount || 0) > 0) {
    await markNotificationChanged([myId, targetId], 'friends');
  }

  return {
    blockAdded: rBlock.modifiedCount || 0,
    removedA: rPullA.modifiedCount || 0,
    removedB: rPullB.modifiedCount || 0,
    rejectedPending: rReject.modifiedCount || 0,
  };
}

async function removeBlock(myId, targetId) {
  if (!isValidObjectId(targetId)) throw new FriendRelationError(400, '유효하지 않은 사용자 ID입니다.');

  const myObjId = new mongoose.Types.ObjectId(myId);
  const targetObjId = new mongoose.Types.ObjectId(targetId);

  const r = await User.updateOne({ _id: myObjId }, { $pull: { blocklist: targetObjId } });
  if (r.modifiedCount) await markNotificationChanged(myId, 'blocks');
  return { modified: r.modifiedCount || 0 };
}

async function getUserProfileWithRelation(myId, targetId) {
  const targetUser = await User.findById(targetId).select(SAFE_USER_FIELDS).lean();
  if (!targetUser) throw new FriendRelationError(404, '사용자를 찾을 수 없습니다.');

  const me = await User.findById(myId).select('friendlist blocklist').lean();
  if (!me) throw new FriendRelationError(404, '내 정보가 없습니다.');

  const isFriend = (me.friendlist || []).some(fid => String(fid) === targetId);
  const isBlocked = (me.blocklist || []).some(bid => String(bid) === targetId);

  return { ...targetUser, isFriend, isBlocked };
}

module.exports = {
  FriendRelationError,
  getFriendList,
  removeFriend,
  getBlockList,
  createBlock,
  removeBlock,
  getUserProfileWithRelation,
  markNotificationChanged,
  getNotificationStatus,
  markNotificationRead,
  buildNotificationCategories,
};
