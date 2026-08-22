require('module-alias/register');
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ACCOUNT_DELETION_CODES,
  AccountDeletionError,
  cancelDeletion,
  getStatus,
  requestDeletion,
} = require('../src/services/system/accountDeletionService');
const {
  INTERNAL_ERROR_MESSAGE,
  respondInternalError,
} = require('../src/controllers/system/accountDeletion.controller');

function documentModel(user) {
  return { async findById() { return user; } };
}

function leanModel(user) {
  return { findById() { return { async lean() { return user; } }; } };
}

function assertDeletionError(status, code, message) {
  return error => error instanceof AccountDeletionError &&
    error.status === status &&
    error.payload.code === code &&
    error.payload.message === message &&
    error.payload.error === message;
}

test('인증정보와 사용자가 없을 때 한국어 code/message/error 계약을 사용한다', async () => {
  for (const operation of [getStatus, requestDeletion, cancelDeletion]) {
    await assert.rejects(
      operation({}, { UserModel: documentModel(null) }),
      assertDeletionError(401, ACCOUNT_DELETION_CODES.AUTH_REQUIRED, '로그인이 필요합니다.'),
    );
  }

  await assert.rejects(
    getStatus({ _uid: 'missing' }, { UserModel: leanModel(null) }),
    assertDeletionError(404, ACCOUNT_DELETION_CODES.USER_NOT_FOUND, '사용자를 찾을 수 없습니다.'),
  );
  for (const operation of [requestDeletion, cancelDeletion]) {
    await assert.rejects(
      operation({ _uid: 'missing' }, { UserModel: documentModel(null) }),
      assertDeletionError(404, ACCOUNT_DELETION_CODES.USER_NOT_FOUND, '사용자를 찾을 수 없습니다.'),
    );
  }
});

test('탈퇴 신청과 중복 신청 성공 응답은 한국어 code/message를 반환한다', async () => {
  let saves = 0;
  const activeUser = { status: 'active', async save() { saves += 1; } };
  const requested = await requestDeletion(
    { _uid: 'user-1' },
    { UserModel: documentModel(activeUser) },
  );

  assert.equal(requested.code, ACCOUNT_DELETION_CODES.PENDING);
  assert.equal(requested.message, '탈퇴 신청이 완료되었습니다.');
  assert.equal(requested.status, 'pendingDeletion');
  assert.equal(saves, 1);

  const existingDueAt = new Date(Date.now() + 60_000);
  const duplicate = await requestDeletion(
    { _uid: 'user-1' },
    { UserModel: documentModel({ status: 'pendingDeletion', deletionDueAt: existingDueAt }) },
  );
  assert.equal(duplicate.code, ACCOUNT_DELETION_CODES.ALREADY_REQUESTED);
  assert.equal(duplicate.message, '이미 탈퇴가 신청된 계정입니다.');
  assert.equal(duplicate.deletionDueAt, existingDueAt);
});

test('유예기간 내 취소는 한국어 성공 계약과 active 상태를 저장한다', async () => {
  let saves = 0;
  const user = {
    status: 'pendingDeletion',
    deletionRequestedAt: new Date(),
    deletionDueAt: new Date(Date.now() + 60_000),
    async save() { saves += 1; },
  };

  const result = await cancelDeletion(
    { _uid: 'user-1' },
    { UserModel: documentModel(user) },
  );

  assert.deepEqual(result, {
    code: ACCOUNT_DELETION_CODES.CANCELED,
    message: '탈퇴 신청이 취소되었습니다.',
    status: 'active',
  });
  assert.equal(user.deletionRequestedAt, null);
  assert.equal(user.deletionDueAt, null);
  assert.equal(saves, 1);
});

test('취소 불가 상태와 예상하지 못한 서버 오류도 일관된 한국어 오류 계약을 사용한다', async () => {
  await assert.rejects(
    cancelDeletion(
      { _uid: 'user-1' },
      { UserModel: documentModel({ status: 'active', deletionDueAt: null }) },
    ),
    assertDeletionError(
      400,
      ACCOUNT_DELETION_CODES.CANCEL_NOT_ALLOWED,
      '탈퇴 신청을 취소할 수 없는 상태이거나 취소 가능 기간이 지났습니다.',
    ),
  );

  const response = { statusCode: 200, body: null };
  const res = {
    status(value) { response.statusCode = value; return this; },
    json(value) { response.body = value; return this; },
  };
  respondInternalError(res);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, {
    ok: false,
    code: ACCOUNT_DELETION_CODES.INTERNAL_ERROR,
    message: INTERNAL_ERROR_MESSAGE,
    error: INTERNAL_ERROR_MESSAGE,
  });
});
