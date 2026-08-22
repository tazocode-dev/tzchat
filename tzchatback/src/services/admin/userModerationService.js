const mongoose = require('mongoose');
const { User, AdminLog } = require('@/models');

const MAX_REASON_LENGTH = 300;
const ALLOWED_FIELDS = new Set(['suspended', 'reason']);

class UserModerationError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function validateSuspensionInput(targetUserId, adminUserId, body = {}) {
  const targetId = String(targetUserId || '');
  const adminId = String(adminUserId || '');
  if (!mongoose.isValidObjectId(targetId)) {
    throw new UserModerationError(400, 'INVALID_TARGET_USER', '유효한 대상 사용자 ID가 필요합니다.');
  }
  if (!mongoose.isValidObjectId(adminId)) {
    throw new UserModerationError(401, 'AUTH_REQUIRED', '관리자 로그인이 필요합니다.');
  }
  if (targetId === adminId) {
    throw new UserModerationError(400, 'SELF_SUSPENSION_NOT_ALLOWED', '관리자는 자기 자신을 정지할 수 없습니다.');
  }
  const unknownFields = Object.keys(body || {}).filter(field => !ALLOWED_FIELDS.has(field));
  if (unknownFields.length) {
    throw new UserModerationError(400, 'UNKNOWN_FIELDS', '허용되지 않은 정지 요청 필드가 있습니다.');
  }
  if (typeof body.suspended !== 'boolean') {
    throw new UserModerationError(400, 'INVALID_SUSPENDED_VALUE', 'suspended는 boolean 값이어야 합니다.');
  }
  if (body.reason != null && typeof body.reason !== 'string') {
    throw new UserModerationError(400, 'INVALID_SUSPENSION_REASON', '정지 사유는 문자열이어야 합니다.');
  }
  const reason = String(body.reason || '').trim();
  if (reason.length > MAX_REASON_LENGTH) {
    throw new UserModerationError(400, 'SUSPENSION_REASON_TOO_LONG', `정지 사유는 ${MAX_REASON_LENGTH}자 이하로 입력해 주세요.`);
  }
  if (body.suspended && !reason) {
    throw new UserModerationError(400, 'SUSPENSION_REASON_REQUIRED', '정지 사유가 필요합니다.');
  }
  return { targetId, adminId, suspended: body.suspended, reason };
}

function safeModerationUser(user) {
  return {
    _id: user._id,
    nickname: user.nickname,
    role: user.role,
    suspended: user.suspended === true,
    suspendedReason: user.suspendedReason || '',
    suspendedAt: user.suspendedAt || null,
    suspendedBy: user.suspendedBy || null,
  };
}

async function updateUserSuspension(targetUserId, adminUserId, body, dependencies = {}) {
  const input = validateSuspensionInput(targetUserId, adminUserId, body);
  const UserModel = dependencies.UserModel || User;
  const AdminLogModel = dependencies.AdminLogModel || AdminLog;
  const now = dependencies.now || new Date();
  const user = await UserModel.findById(input.targetId);
  if (!user) throw new UserModerationError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.');
  if (String(user.role || '').toLowerCase() === 'master') {
    throw new UserModerationError(403, 'MASTER_SUSPENSION_NOT_ALLOWED', 'master 계정은 정지할 수 없습니다.');
  }

  user.suspended = input.suspended;
  user.suspendedReason = input.suspended ? input.reason : '';
  user.suspendedAt = input.suspended ? now : null;
  user.suspendedBy = input.suspended ? input.adminId : null;
  await user.save();

  await AdminLogModel.create({
    adminId: input.adminId,
    action: input.suspended ? 'user_suspended' : 'user_unsuspended',
    targetId: input.targetId,
    meta: input.suspended ? { reason: input.reason } : {},
  });

  return safeModerationUser(user);
}

module.exports = {
  MAX_REASON_LENGTH,
  UserModerationError,
  validateSuspensionInput,
  updateUserSuspension,
};
