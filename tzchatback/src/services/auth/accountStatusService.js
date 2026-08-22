function getAccountRestriction(user, { allowPendingDeletion = false } = {}) {
  if (!user) return null;
  if (user.suspended === true) {
    return { status: 403, code: 'ACCOUNT_SUSPENDED', message: '정지된 계정입니다.' };
  }
  if (user.status === 'deleted') {
    return { status: 403, code: 'ACCOUNT_DELETED', message: '삭제된 계정입니다.' };
  }
  const isPendingDeletion = user.status === 'pendingDeletion' || Boolean(user.deletionDueAt);
  if (isPendingDeletion) {
    if (allowPendingDeletion) return null;
    return { status: 403, code: 'ACCOUNT_PENDING_DELETION', message: '탈퇴 처리 중인 계정입니다.' };
  }
  if (user.isDeleted === true) {
    return { status: 403, code: 'ACCOUNT_DELETED', message: '삭제된 계정입니다.' };
  }
  return null;
}

function throwIfAccountRestricted(user, ErrorClass, options) {
  const restriction = getAccountRestriction(user, options);
  if (restriction) {
    throw new ErrorClass(restriction.status, restriction.code, restriction.message);
  }
}

module.exports = { getAccountRestriction, throwIfAccountRestricted };
