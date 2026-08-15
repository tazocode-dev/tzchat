// src/services/system/accountDeletionService.js
// ────────────────────────────────────────────────────────────
// 회원 탈퇴 신청/취소/상태조회 도메인 서비스 (지침 §1). routes/system/accountDeletionRouter.js에서 분리.
// ────────────────────────────────────────────────────────────

const { User } = require('@/models');
const retention = require('@/config/retention');

class AccountDeletionError extends Error {
  constructor(status, payload) {
    super(payload?.message || payload?.error);
    this.status = status;
    this.payload = payload;
  }
}

function applyRequestDeletionFields(userDoc) {
  const days = retention?.DELETION_GRACE_DAYS ?? 14;
  const now = new Date();
  userDoc.status = 'pendingDeletion';
  userDoc.deletionRequestedAt = now;
  userDoc.deletionDueAt = new Date(now.getTime() + days * 86400000);
}
function applyCancelDeletionFields(userDoc) {
  userDoc.status = 'active';
  userDoc.deletionRequestedAt = null;
  userDoc.deletionDueAt = null;
}

function resolveUserId(req) {
  return req._uid || req.user?._id || req.auth?.userId || req.session?.user?._id;
}

async function getStatus(req) {
  const userId = resolveUserId(req);
  if (!userId) throw new AccountDeletionError(401, { error: 'Unauthorized' });

  const user = await User.findById(userId).lean();
  if (!user) throw new AccountDeletionError(404, { error: 'User not found' });

  const isPending = user.status === 'pendingDeletion';
  return {
    status: isPending ? 'pendingDeletion' : 'active',
    pendingDeletion: isPending
      ? {
          requestedAt: user.deletionRequestedAt || null,
          scheduledAt: user.deletionDueAt || null,
        }
      : null,
  };
}

async function requestDeletion(req) {
  const userId = resolveUserId(req);
  if (!userId) throw new AccountDeletionError(401, { message: 'Unauthorized' });

  const user = await User.findById(userId);
  if (!user) throw new AccountDeletionError(404, { message: 'User not found' });

  if (user.status === 'pendingDeletion' || user.status === 'deleted') {
    return {
      alreadyRequested: true,
      message: 'Already requested',
      status: user.status,
      deletionDueAt: user.deletionDueAt || null,
    };
  }

  if (typeof user.requestDeletion === 'function') user.requestDeletion();
  else applyRequestDeletionFields(user);

  await user.save();
  return {
    alreadyRequested: false,
    message: 'Deletion pending',
    status: user.status,
    deletionDueAt: user.deletionDueAt || null,
  };
}

async function cancelDeletion(req) {
  const userId = resolveUserId(req);
  if (!userId) throw new AccountDeletionError(401, { message: 'Unauthorized' });

  const user = await User.findById(userId);
  if (!user) throw new AccountDeletionError(404, { message: 'User not found' });

  const now = new Date();
  const isInGrace =
    user.status === 'pendingDeletion' &&
    user.deletionDueAt instanceof Date &&
    user.deletionDueAt > now;

  if (!isInGrace) {
    throw new AccountDeletionError(400, {
      message: 'Cancellation not allowed (not in pendingDeletion or grace period passed).',
      status: user.status,
      deletionDueAt: user.deletionDueAt || null,
    });
  }

  if (typeof user.cancelDeletion === 'function') user.cancelDeletion();
  else applyCancelDeletionFields(user);

  await user.save();
  return { message: 'Deletion canceled', status: user.status };
}

module.exports = { AccountDeletionError, getStatus, requestDeletion, cancelDeletion };
