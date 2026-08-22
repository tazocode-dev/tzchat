const mongoose = require('mongoose');
const { User } = require('@/models');

class BlockPolicyError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function normalizeUserId(value, label = '사용자') {
  const id = String(value || '');
  if (!mongoose.isValidObjectId(id)) {
    throw new BlockPolicyError(400, `유효하지 않은 ${label} ID입니다.`);
  }
  return id;
}

function containsUserId(values, userId) {
  return (values || []).some(value => String(value?._id || value) === String(userId));
}

function isBidirectionallyBlocked(firstUser, secondUser) {
  if (!firstUser || !secondUser) return false;
  const firstId = String(firstUser._id || firstUser);
  const secondId = String(secondUser._id || secondUser);
  if (firstId === secondId) return false;
  return containsUserId(firstUser.blocklist, secondId) || containsUserId(secondUser.blocklist, firstId);
}

async function areUsersBlocked(firstUserId, secondUserId, dependencies = {}) {
  const firstId = normalizeUserId(firstUserId, '요청자');
  const secondId = normalizeUserId(secondUserId, '상대방');
  if (firstId === secondId) return false;

  const UserModel = dependencies.UserModel || User;
  const users = await UserModel.find({ _id: { $in: [firstId, secondId] } })
    .select('_id blocklist')
    .lean();
  const first = users.find(user => String(user._id) === firstId);
  const second = users.find(user => String(user._id) === secondId);
  return isBidirectionallyBlocked(first, second);
}

async function getBlockedUserIdSet(requesterId, dependencies = {}) {
  const normalizedRequesterId = normalizeUserId(requesterId, '요청자');
  const UserModel = dependencies.UserModel || User;
  const requesterObjectId = new mongoose.Types.ObjectId(normalizedRequesterId);
  const [requester, blockedByUsers] = await Promise.all([
    UserModel.findById(requesterObjectId).select('blocklist').lean(),
    UserModel.find({ blocklist: requesterObjectId }).select('_id').lean(),
  ]);

  const ids = new Set((requester?.blocklist || []).map(value => String(value?._id || value)));
  for (const user of blockedByUsers || []) ids.add(String(user._id));
  ids.delete(normalizedRequesterId);
  return ids;
}

function buildDiscoverableUserFilter(requesterId, blockedUserIds = []) {
  const normalizedRequesterId = normalizeUserId(requesterId, '요청자');
  const excludedIds = [...new Set([
    normalizedRequesterId,
    ...Array.from(blockedUserIds || [], value => String(value)),
  ])].filter(mongoose.isValidObjectId);

  return {
    _id: { $nin: excludedIds.map(id => new mongoose.Types.ObjectId(id)) },
    suspended: { $ne: true },
    status: { $nin: ['pendingDeletion', 'deleted'] },
    isDeleted: { $ne: true },
  };
}

module.exports = {
  BlockPolicyError,
  normalizeUserId,
  containsUserId,
  isBidirectionallyBlocked,
  areUsersBlocked,
  getBlockedUserIdSet,
  buildDiscoverableUserFilter,
};
