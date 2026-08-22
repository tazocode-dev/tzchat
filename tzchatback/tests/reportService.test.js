require('module-alias/register');
process.env.JWT_SECRET ||= 'report-service-test-secret';
process.env.SESSION_SECRET ||= 'report-service-test-session-secret';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ReportError,
  validateCreateReportInput,
  validateAdminStatusInput,
  parseAdminListQuery,
  createReport,
  updateReportStatus,
} = require('../src/services/system/reportService');

const REPORTER_ID = '64b000000000000000000001';
const REPORTED_ID = '64b000000000000000000002';
const ADMIN_ID = '64b000000000000000000003';
const ROOM_ID = '64b000000000000000000004';
const REPORT_ID = '64b000000000000000000005';

function validBody(overrides = {}) {
  return {
    reportedUserId: REPORTED_ID,
    reason: 'harassment',
    details: '반복적인 괴롭힘이 있었습니다.',
    contextType: 'profile',
    ...overrides,
  };
}

test('신고 입력은 허용 enum과 길이를 검증하고 문자열을 정리한다', () => {
  const input = validateCreateReportInput(REPORTER_ID, validBody({ details: '  상세 내용  ' }));
  assert.equal(input.details, '상세 내용');
  assert.equal(input.contextType, 'profile');

  for (const body of [
    validBody({ reason: 'invalid' }),
    validBody({ contextType: 'invalid' }),
    validBody({ details: 'x'.repeat(1001) }),
    validBody({ unexpected: true }),
  ]) {
    assert.throws(() => validateCreateReportInput(REPORTER_ID, body), ReportError);
  }
});

test('자기 자신 신고와 잘못된 ID를 거부한다', () => {
  assert.throws(
    () => validateCreateReportInput(REPORTER_ID, validBody({ reportedUserId: REPORTER_ID })),
    error => error.code === 'SELF_REPORT_NOT_ALLOWED'
  );
  assert.throws(
    () => validateCreateReportInput(REPORTER_ID, validBody({ reportedUserId: 'bad-id' })),
    error => error.code === 'INVALID_REPORTED_USER'
  );
});

test('채팅 신고는 두 사용자가 참여한 유효한 채팅방을 요구한다', async () => {
  const dependencies = {
    UserModel: { async exists() { return true; } },
    ChatRoomModel: {
      findOne() {
        return { select() { return this; }, async lean() { return null; } };
      },
    },
    ReportModel: { async exists() { return false; }, async create() { throw new Error('호출되면 안 됨'); } },
  };
  await assert.rejects(
    createReport(REPORTER_ID, validBody({ contextType: 'chat', chatRoomId: ROOM_ID }), dependencies),
    error => error.code === 'CHAT_REPORT_FORBIDDEN' && error.status === 403
  );
});

test('동일 신고자·피신고자·context의 pending 중복 신고를 409로 거부한다', async () => {
  const dependencies = {
    UserModel: { async exists() { return true; } },
    ReportModel: { async exists() { return true; }, async create() { throw new Error('호출되면 안 됨'); } },
  };
  await assert.rejects(
    createReport(REPORTER_ID, validBody(), dependencies),
    error => error.code === 'PENDING_REPORT_EXISTS' && error.status === 409
  );
});

test('관리자 신고 상태와 목록 필터 enum을 검증한다', () => {
  assert.deepEqual(
    validateAdminStatusInput(REPORT_ID, ADMIN_ID, { status: 'resolved' }),
    { reportId: REPORT_ID, adminUserId: ADMIN_ID, status: 'resolved' }
  );
  assert.throws(
    () => validateAdminStatusInput(REPORT_ID, ADMIN_ID, { status: 'blocked' }),
    error => error.code === 'INVALID_REPORT_STATUS'
  );
  assert.throws(
    () => parseAdminListQuery({ status: 'blocked' }),
    error => error.code === 'INVALID_REPORT_STATUS'
  );
});

test('관리자 상태 변경은 처리자·시각과 AdminLog를 기록한다', async () => {
  const saved = [];
  const logs = [];
  const report = {
    _id: REPORT_ID,
    reportedUserId: REPORTED_ID,
    status: 'pending',
    async save() { saved.push(this.status); },
    toObject() {
      return {
        _id: this._id,
        reportedUserId: this.reportedUserId,
        status: this.status,
        reviewedBy: this.reviewedBy,
        reviewedAt: this.reviewedAt,
      };
    },
  };
  const result = await updateReportStatus(REPORT_ID, ADMIN_ID, { status: 'reviewed' }, {
    ReportModel: { async findById() { return report; } },
    AdminLogModel: { async create(value) { logs.push(value); } },
  });

  assert.deepEqual(saved, ['reviewed']);
  assert.equal(result.reviewedBy, ADMIN_ID);
  assert.ok(result.reviewedAt instanceof Date);
  assert.equal(logs[0].action, 'report_status_updated');
  assert.equal(logs[0].meta.previousStatus, 'pending');
  assert.equal(logs[0].meta.status, 'reviewed');
});

test('관리자가 pending으로 되돌릴 때 중복 인덱스 충돌은 409로 변환한다', async () => {
  const report = {
    status: 'resolved',
    reportedUserId: REPORTED_ID,
    async save() {
      const error = new Error('duplicate key');
      error.code = 11000;
      throw error;
    },
  };
  await assert.rejects(
    updateReportStatus(REPORT_ID, ADMIN_ID, { status: 'pending' }, {
      ReportModel: { async findById() { return report; } },
      AdminLogModel: { async create() { throw new Error('호출되면 안 됨'); } },
    }),
    error => error.code === 'PENDING_REPORT_EXISTS' && error.status === 409
  );
});
