const mongoose = require('mongoose');
const { User, ChatRoom, Report, AdminLog } = require('@/models');

const REPORT_REASONS = new Set([
  'inappropriate_profile',
  'sexual_content',
  'harassment',
  'impersonation',
  'spam',
  'other',
]);
const REPORT_CONTEXT_TYPES = new Set(['profile', 'chat']);
const REPORT_STATUSES = new Set(['pending', 'reviewed', 'resolved', 'rejected']);
const CREATE_FIELDS = new Set(['reportedUserId', 'reason', 'details', 'contextType', 'chatRoomId']);
const STATUS_FIELDS = new Set(['status']);
const MAX_DETAILS_LENGTH = 1000;
const MAX_CREATE_PAYLOAD_LENGTH = 4096;
const MAX_STATUS_PAYLOAD_LENGTH = 256;

class ReportError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function serializedLength(value) {
  try {
    return JSON.stringify(value || {}).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function validateAllowedFields(body, allowedFields) {
  const unknown = Object.keys(body || {}).filter(key => !allowedFields.has(key));
  if (unknown.length) {
    throw new ReportError(400, 'UNKNOWN_FIELDS', '허용되지 않은 신고 요청 필드가 있습니다.');
  }
}

function validateCreateReportInput(reporterUserId, body = {}) {
  if (serializedLength(body) > MAX_CREATE_PAYLOAD_LENGTH) {
    throw new ReportError(413, 'REPORT_PAYLOAD_TOO_LARGE', '신고 요청 내용이 너무 깁니다.');
  }
  validateAllowedFields(body, CREATE_FIELDS);

  const reporterId = String(reporterUserId || '');
  const reportedUserId = String(body.reportedUserId || '');
  const reason = String(body.reason || '').trim();
  const details = String(body.details || '').trim();
  const contextType = String(body.contextType || '').trim();
  const chatRoomId = body.chatRoomId == null ? '' : String(body.chatRoomId).trim();

  if (!mongoose.isValidObjectId(reporterId)) {
    throw new ReportError(401, 'AUTH_REQUIRED', '로그인이 필요합니다.');
  }
  if (!mongoose.isValidObjectId(reportedUserId)) {
    throw new ReportError(400, 'INVALID_REPORTED_USER', '유효한 신고 대상 사용자 ID가 필요합니다.');
  }
  if (reporterId === reportedUserId) {
    throw new ReportError(400, 'SELF_REPORT_NOT_ALLOWED', '자기 자신을 신고할 수 없습니다.');
  }
  if (!REPORT_REASONS.has(reason)) {
    throw new ReportError(400, 'INVALID_REPORT_REASON', '유효한 신고 사유를 선택해 주세요.');
  }
  if (details.length > MAX_DETAILS_LENGTH) {
    throw new ReportError(400, 'REPORT_DETAILS_TOO_LONG', `상세 내용은 ${MAX_DETAILS_LENGTH}자 이하로 입력해 주세요.`);
  }
  if (!REPORT_CONTEXT_TYPES.has(contextType)) {
    throw new ReportError(400, 'INVALID_REPORT_CONTEXT', '유효한 신고 위치가 필요합니다.');
  }
  if (contextType === 'chat' && !mongoose.isValidObjectId(chatRoomId)) {
    throw new ReportError(400, 'CHAT_ROOM_REQUIRED', '채팅 신고에는 유효한 채팅방 ID가 필요합니다.');
  }
  if (contextType === 'profile' && chatRoomId) {
    throw new ReportError(400, 'CHAT_ROOM_NOT_ALLOWED', '프로필 신고에는 채팅방 ID를 사용할 수 없습니다.');
  }

  return {
    reporterUserId: reporterId,
    reportedUserId,
    reason,
    details,
    contextType,
    chatRoomId: chatRoomId || null,
  };
}

function validateAdminStatusInput(reportId, adminUserId, body = {}) {
  if (serializedLength(body) > MAX_STATUS_PAYLOAD_LENGTH) {
    throw new ReportError(413, 'REPORT_PAYLOAD_TOO_LARGE', '상태 변경 요청 내용이 너무 깁니다.');
  }
  validateAllowedFields(body, STATUS_FIELDS);

  const normalizedReportId = String(reportId || '');
  const normalizedAdminId = String(adminUserId || '');
  const status = String(body.status || '').trim();
  if (!mongoose.isValidObjectId(normalizedReportId)) {
    throw new ReportError(400, 'INVALID_REPORT_ID', '유효한 신고 ID가 필요합니다.');
  }
  if (!mongoose.isValidObjectId(normalizedAdminId)) {
    throw new ReportError(401, 'AUTH_REQUIRED', '관리자 로그인이 필요합니다.');
  }
  if (!REPORT_STATUSES.has(status)) {
    throw new ReportError(400, 'INVALID_REPORT_STATUS', '유효한 신고 처리 상태가 필요합니다.');
  }
  return { reportId: normalizedReportId, adminUserId: normalizedAdminId, status };
}

function safeReport(report) {
  const value = typeof report?.toObject === 'function' ? report.toObject() : { ...(report || {}) };
  delete value.__v;
  delete value.expiresAt;
  return value;
}

async function createReport(reporterUserId, body, dependencies = {}) {
  const input = validateCreateReportInput(reporterUserId, body);
  const UserModel = dependencies.UserModel || User;
  const ChatRoomModel = dependencies.ChatRoomModel || ChatRoom;
  const ReportModel = dependencies.ReportModel || Report;

  const reportedExists = await UserModel.exists({ _id: input.reportedUserId });
  if (!reportedExists) {
    throw new ReportError(404, 'REPORTED_USER_NOT_FOUND', '신고 대상 사용자를 찾을 수 없습니다.');
  }

  if (input.contextType === 'chat') {
    const room = await ChatRoomModel.findOne({
      _id: input.chatRoomId,
      participants: { $all: [input.reporterUserId, input.reportedUserId] },
    }).select('_id').lean();
    if (!room) {
      throw new ReportError(403, 'CHAT_REPORT_FORBIDDEN', '두 사용자가 참여한 채팅방에서만 신고할 수 있습니다.');
    }
  }

  const duplicate = await ReportModel.exists({
    reporterUserId: input.reporterUserId,
    reportedUserId: input.reportedUserId,
    contextType: input.contextType,
    status: 'pending',
  });
  if (duplicate) {
    throw new ReportError(409, 'PENDING_REPORT_EXISTS', '이미 처리 대기 중인 신고가 있습니다.');
  }

  try {
    const report = await ReportModel.create(input);
    return safeReport(report);
  } catch (error) {
    if (error?.code === 11000) {
      throw new ReportError(409, 'PENDING_REPORT_EXISTS', '이미 처리 대기 중인 신고가 있습니다.');
    }
    if (error?.name === 'ValidationError') {
      throw new ReportError(400, 'INVALID_REPORT', '신고 내용을 확인해 주세요.');
    }
    throw error;
  }
}

function parseAdminListQuery(query = {}) {
  const status = String(query.status || '').trim();
  if (status && !REPORT_STATUSES.has(status)) {
    throw new ReportError(400, 'INVALID_REPORT_STATUS', '유효한 신고 상태가 필요합니다.');
  }
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit, 10) || 30));
  return { status, page, limit };
}

async function listReports(query = {}, dependencies = {}) {
  const { status, page, limit } = parseAdminListQuery(query);
  const ReportModel = dependencies.ReportModel || Report;
  const filter = status ? { status } : {};
  const [reports, total] = await Promise.all([
    ReportModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate([
        { path: 'reporterUserId', select: '_id nickname' },
        { path: 'reportedUserId', select: '_id nickname' },
        { path: 'reviewedBy', select: '_id nickname' },
      ])
      .lean(),
    ReportModel.countDocuments(filter),
  ]);
  return {
    reports: reports.map(safeReport),
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

async function updateReportStatus(reportId, adminUserId, body, dependencies = {}) {
  const input = validateAdminStatusInput(reportId, adminUserId, body);
  const ReportModel = dependencies.ReportModel || Report;
  const AdminLogModel = dependencies.AdminLogModel || AdminLog;
  const report = await ReportModel.findById(input.reportId);
  if (!report) throw new ReportError(404, 'REPORT_NOT_FOUND', '신고를 찾을 수 없습니다.');

  const previousStatus = report.status;
  report.status = input.status;
  report.reviewedBy = input.adminUserId;
  report.reviewedAt = new Date();
  try {
    await report.save();
  } catch (error) {
    if (error?.code === 11000) {
      throw new ReportError(409, 'PENDING_REPORT_EXISTS', '같은 신고 관계에 이미 처리 대기 중인 신고가 있습니다.');
    }
    throw error;
  }

  await AdminLogModel.create({
    adminId: input.adminUserId,
    action: 'report_status_updated',
    targetId: input.reportId,
    meta: {
      previousStatus,
      status: input.status,
      reportedUserId: String(report.reportedUserId || ''),
    },
  });

  return safeReport(report);
}

module.exports = {
  REPORT_REASONS,
  REPORT_CONTEXT_TYPES,
  REPORT_STATUSES,
  MAX_DETAILS_LENGTH,
  MAX_CREATE_PAYLOAD_LENGTH,
  ReportError,
  validateCreateReportInput,
  validateAdminStatusInput,
  parseAdminListQuery,
  createReport,
  listReports,
  updateReportStatus,
};
