require('module-alias/register');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'user-suspension-test-secret';
process.env.SESSION_SECRET ||= 'user-suspension-test-session-secret';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  UserModerationError,
  validateSuspensionInput,
  updateUserSuspension,
} = require('../src/services/admin/userModerationService');
const { getAccountRestriction } = require('../src/services/auth/accountStatusService');
const { PhoneAuthError, verifyAndLogin: verifyPhoneAndLogin } = require('../src/services/auth/phoneAuthService');
const { EmailAuthError } = require('../src/services/auth/emailAuthService');
const { SessionError, rotateTokensFromRefresh } = require('../src/services/sessionService');
const { respondVerifyError } = require('../src/controllers/auth/emailAuth.controller');
const { disconnectSuspendedUser } = require('../src/controllers/admin/userModeration.controller');
const { disconnectDeletingUser } = require('../src/controllers/system/accountDeletion.controller');
const { disconnectUserSockets } = require('../src/socket/userConnections');

const ADMIN = '64b000000000000000000001';
const USER = '64b000000000000000000002';

test('관리자 정지 입력은 boolean·사유 길이·자기 자신·허용 필드만 받는다', () => {
  const input = validateSuspensionInput(USER, ADMIN, { suspended: true, reason: '  반복 신고 확인  ' });
  assert.equal(input.reason, '반복 신고 확인');
  for (const args of [
    [USER, ADMIN, { suspended: 'true', reason: '사유' }],
    [USER, ADMIN, { suspended: true, reason: '' }],
    [USER, ADMIN, { suspended: true, reason: 'x'.repeat(301) }],
    [USER, ADMIN, { suspended: true, reason: '사유', role: 'user' }],
    [ADMIN, ADMIN, { suspended: true, reason: '사유' }],
  ]) {
    assert.throws(() => validateSuspensionInput(...args), UserModerationError);
  }
});

test('master 대상 정지를 거부하고 DB나 로그를 변경하지 않는다', async () => {
  let saved = false;
  let logged = false;
  await assert.rejects(
    updateUserSuspension(USER, ADMIN, { suspended: true, reason: '사유' }, {
      UserModel: { async findById() { return { _id: USER, role: 'master', async save() { saved = true; } }; } },
      AdminLogModel: { async create() { logged = true; } },
    }),
    error => error.code === 'MASTER_SUSPENSION_NOT_ALLOWED' && error.status === 403
  );
  assert.equal(saved, false);
  assert.equal(logged, false);
});

test('정지·해제 필드를 갱신하고 각 AdminLog를 기록한다', async () => {
  const user = { _id: USER, nickname: '사용자', role: 'user', suspended: false, async save() {} };
  const logs = [];
  const now = new Date('2026-08-17T03:00:00.000Z');
  const dependencies = {
    UserModel: { async findById() { return user; } },
    AdminLogModel: { async create(value) { logs.push(value); } },
    now,
  };

  await updateUserSuspension(USER, ADMIN, { suspended: true, reason: ' 운영 정책 위반 ' }, dependencies);
  assert.equal(user.suspended, true);
  assert.equal(user.suspendedReason, '운영 정책 위반');
  assert.equal(user.suspendedAt, now);
  assert.equal(user.suspendedBy, ADMIN);
  assert.equal(logs[0].action, 'user_suspended');
  assert.equal(logs[0].meta.reason, '운영 정책 위반');

  await updateUserSuspension(USER, ADMIN, { suspended: false, reason: '무시되는 값' }, dependencies);
  assert.equal(user.suspended, false);
  assert.equal(user.suspendedReason, '');
  assert.equal(user.suspendedAt, null);
  assert.equal(user.suspendedBy, null);
  assert.equal(logs[1].action, 'user_unsuspended');
});

test('계정 상태 helper는 정지·삭제·탈퇴 대기를 명확한 403 코드로 구분한다', () => {
  assert.deepEqual(getAccountRestriction({ suspended: true }), {
    status: 403, code: 'ACCOUNT_SUSPENDED', message: '정지된 계정입니다.',
  });
  assert.equal(getAccountRestriction({ status: 'deleted' }).code, 'ACCOUNT_DELETED');
  assert.equal(getAccountRestriction({ status: 'pendingDeletion', isDeleted: true }).code, 'ACCOUNT_PENDING_DELETION');
  assert.equal(getAccountRestriction(
    { status: 'pendingDeletion', isDeleted: true },
    { allowPendingDeletion: true }
  ), null);
  assert.equal(getAccountRestriction(
    { status: 'deleted', isDeleted: true, deletionDueAt: new Date() },
    { allowPendingDeletion: true }
  ).code, 'ACCOUNT_DELETED');
});

test('전화 로그인은 정지 계정에 토큰을 서명하지 않는다', async () => {
  let signed = false;
  const user = { _id: USER, suspended: true, async save() {} };
  await assert.rejects(
    verifyPhoneAndLogin({ phone: '01012345678', code: '123456' }, {
      verifyCodeFn: async () => ({ phone: '+821012345678' }),
      findOrCreateUserByPhoneFn: async () => ({ user, isNewUser: false }),
      signTokenFn: () => { signed = true; return 'token'; },
      signRefreshTokenFn: () => { signed = true; return 'refresh'; },
    }),
    error => error instanceof PhoneAuthError && error.status === 403 && error.code === 'ACCOUNT_SUSPENDED'
  );
  assert.equal(signed, false);
});

test('refresh token 재발급은 정지 계정에 새 토큰을 서명하지 않는다', async () => {
  let signed = false;
  const UserModel = {
    findById() {
      return { async select() { return { _id: USER, suspended: true }; } };
    },
  };
  await assert.rejects(
    rotateTokensFromRefresh('refresh', {
      verifyTokenFn: () => ({ sub: USER, type: 'refresh' }),
      UserModel,
      signTokenFn: () => { signed = true; return 'token'; },
      signRefreshTokenFn: () => { signed = true; return 'refresh'; },
    }),
    error => error instanceof SessionError && error.status === 403 && error.code === 'ACCOUNT_SUSPENDED'
  );
  assert.equal(signed, false);
});

test('호환 이메일 verify는 정지 오류의 403 code와 message를 그대로 반환한다', () => {
  const response = { statusCode: 0, body: null };
  const res = {
    status(value) { response.statusCode = value; return this; },
    json(value) { response.body = value; return this; },
  };
  const error = new EmailAuthError(403, 'ACCOUNT_SUSPENDED', '정지된 계정입니다.');
  assert.equal(respondVerifyError(res, error), res);
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body, {
    ok: false,
    code: 'ACCOUNT_SUSPENDED',
    message: '정지된 계정입니다.',
  });
});

test('정지·탈퇴 신청 후 개인룸 소켓을 best-effort로 모두 끊고 해제는 건드리지 않는다', () => {
  const calls = [];
  const io = {
    in(room) {
      return { disconnectSockets(close) { calls.push({ room, close }); } };
    },
  };
  const req = {
    _uid: USER,
    app: { get(name) { return name === 'io' ? io : null; } },
  };

  assert.equal(disconnectSuspendedUser(req, { _id: USER, suspended: true }), true);
  assert.equal(disconnectSuspendedUser(req, { _id: USER, suspended: false }), false);
  assert.equal(disconnectDeletingUser(req), true);
  assert.deepEqual(calls, [
    { room: `user:${USER}`, close: true },
    { room: `user:${USER}`, close: true },
  ]);

  assert.equal(disconnectUserSockets(null, USER), false);
  assert.equal(disconnectUserSockets({ in() { throw new Error('unavailable'); } }, USER), false);
});
