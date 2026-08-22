// src/services/system/accountDeletionService.js
// ────────────────────────────────────────────────────────────
// 회원 탈퇴 신청/취소/상태조회 도메인 서비스 (지침 §1). routes/system/accountDeletionRouter.js에서 분리.
// ────────────────────────────────────────────────────────────

const { User } = require('@/models');
const retention = require('@/config/retention');

const ACCOUNT_DELETION_CODES = Object.freeze({
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  USER_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  ALREADY_REQUESTED: 'ACCOUNT_DELETION_ALREADY_REQUESTED',
  PENDING: 'ACCOUNT_DELETION_PENDING',
  CANCELED: 'ACCOUNT_DELETION_CANCELED',
  CANCEL_NOT_ALLOWED: 'ACCOUNT_DELETION_CANCEL_NOT_ALLOWED',
  INTERNAL_ERROR: 'ACCOUNT_DELETION_INTERNAL_ERROR',
});

class AccountDeletionError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.payload = { code, message, error: message, ...details };
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

async function getStatus(req, dependencies = {}) {
  const userId = resolveUserId(req);
  if (!userId) {
    throw new AccountDeletionError(
      401,
      ACCOUNT_DELETION_CODES.AUTH_REQUIRED,
      '로그인이 필요합니다.',
    );
  }

  const UserModel = dependencies.UserModel || User;
  const user = await UserModel.findById(userId).lean();
  if (!user) {
    throw new AccountDeletionError(
      404,
      ACCOUNT_DELETION_CODES.USER_NOT_FOUND,
      '사용자를 찾을 수 없습니다.',
    );
  }

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

async function requestDeletion(req, dependencies = {}) {
  const userId = resolveUserId(req);
  if (!userId) {
    throw new AccountDeletionError(
      401,
      ACCOUNT_DELETION_CODES.AUTH_REQUIRED,
      '로그인이 필요합니다.',
    );
  }

  const UserModel = dependencies.UserModel || User;
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new AccountDeletionError(
      404,
      ACCOUNT_DELETION_CODES.USER_NOT_FOUND,
      '사용자를 찾을 수 없습니다.',
    );
  }

  if (user.status === 'pendingDeletion' || user.status === 'deleted') {
    return {
      alreadyRequested: true,
      code: ACCOUNT_DELETION_CODES.ALREADY_REQUESTED,
      message: '이미 탈퇴가 신청된 계정입니다.',
      status: user.status,
      deletionDueAt: user.deletionDueAt || null,
    };
  }

  if (typeof user.requestDeletion === 'function') user.requestDeletion();
  else applyRequestDeletionFields(user);

  await user.save();
  return {
    alreadyRequested: false,
    code: ACCOUNT_DELETION_CODES.PENDING,
    message: '탈퇴 신청이 완료되었습니다.',
    status: user.status,
    deletionDueAt: user.deletionDueAt || null,
  };
}

async function cancelDeletion(req, dependencies = {}) {
  const userId = resolveUserId(req);
  if (!userId) {
    throw new AccountDeletionError(
      401,
      ACCOUNT_DELETION_CODES.AUTH_REQUIRED,
      '로그인이 필요합니다.',
    );
  }

  const UserModel = dependencies.UserModel || User;
  const user = await UserModel.findById(userId);
  if (!user) {
    throw new AccountDeletionError(
      404,
      ACCOUNT_DELETION_CODES.USER_NOT_FOUND,
      '사용자를 찾을 수 없습니다.',
    );
  }

  const now = new Date();
  const isInGrace =
    user.status === 'pendingDeletion' &&
    user.deletionDueAt instanceof Date &&
    user.deletionDueAt > now;

  if (!isInGrace) {
    throw new AccountDeletionError(
      400,
      ACCOUNT_DELETION_CODES.CANCEL_NOT_ALLOWED,
      '탈퇴 신청을 취소할 수 없는 상태이거나 취소 가능 기간이 지났습니다.',
      {
        status: user.status,
        deletionDueAt: user.deletionDueAt || null,
      },
    );
  }

  if (typeof user.cancelDeletion === 'function') user.cancelDeletion();
  else applyCancelDeletionFields(user);

  await user.save();
  return {
    code: ACCOUNT_DELETION_CODES.CANCELED,
    message: '탈퇴 신청이 취소되었습니다.',
    status: user.status,
  };
}

module.exports = {
  ACCOUNT_DELETION_CODES,
  AccountDeletionError,
  cancelDeletion,
  getStatus,
  requestDeletion,
};
