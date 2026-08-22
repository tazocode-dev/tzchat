require('module-alias/register');

const test = require('node:test');
const assert = require('node:assert/strict');

const controller = require('../src/controllers/search/contacts.controller');
const {
  INVALID_CONTACT_HASHES_CODE,
  INVALID_CONTACT_HASHES_MESSAGE,
  MAX_CONTACT_HASHES,
  saveContactHashes,
  validateAndNormalizeContactHashes,
} = require('../src/services/search/contactsService');

const hashFor = index => index.toString(16).padStart(64, '0');

function recordingUserModel(writes) {
  return {
    findByIdAndUpdate(userId, update) {
      writes.push({ userId, update });
      return {
        async select() {
          return { _id: userId, ...update.$set };
        },
      };
    },
  };
}

function allowedDependencies(writes = []) {
  return {
    requireCurrentActiveOptIn: async () => {},
    UserModel: recordingUserModel(writes),
  };
}

function assertInvalid(error) {
  return error?.status === 400 &&
    error?.code === INVALID_CONTACT_HASHES_CODE &&
    error?.message === INVALID_CONTACT_HASHES_MESSAGE;
}

test('연락처 해시는 배열만 허용하고 비배열 요청은 같은 400 계약으로 거부한다', async () => {
  for (const input of [undefined, null, {}, '01012345678', 123]) {
    const writes = [];
    await assert.rejects(
      saveContactHashes('user-1', input, allowedDependencies(writes)),
      assertInvalid,
    );
    assert.equal(writes.length, 0);
  }
});

test('2000개 경계는 허용하고 2001개 요청은 DB 쓰기 전에 전체 거부한다', async () => {
  const atLimit = Array.from({ length: MAX_CONTACT_HASHES }, (_, index) => hashFor(index));
  const writes = [];
  const result = await saveContactHashes('user-1', atLimit, allowedDependencies(writes));

  assert.equal(result.count, MAX_CONTACT_HASHES);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].update.$set.localContactHashes.length, MAX_CONTACT_HASHES);

  const rejectedWrites = [];
  await assert.rejects(
    saveContactHashes('user-1', [...atLimit, hashFor(MAX_CONTACT_HASHES)], allowedDependencies(rejectedWrites)),
    assertInvalid,
  );
  assert.equal(rejectedWrites.length, 0);
});

test('대문자 SHA-256 hex는 소문자로 정규화하고 정규화 후 중복을 제거한다', async () => {
  const uppercase = 'ABCDEF'.repeat(10) + 'ABCD';
  const lowercase = uppercase.toLowerCase();
  const other = 'F'.repeat(64);
  const writes = [];

  await saveContactHashes(
    'user-1',
    [uppercase, lowercase, other],
    allowedDependencies(writes),
  );

  assert.deepEqual(writes[0].update.$set.localContactHashes, [lowercase, other.toLowerCase()]);
});

test('전화번호·공백 포함·짧은 값·non-hex·비문자 항목은 하나만 섞여도 전체 거부한다', async () => {
  const valid = 'a'.repeat(64);
  const invalidValues = [
    '01012345678',
    ` ${valid}`,
    valid.slice(0, 63),
    `${valid.slice(0, 63)}g`,
    123,
  ];

  for (const invalid of invalidValues) {
    const writes = [];
    await assert.rejects(
      saveContactHashes('user-1', [valid, invalid], allowedDependencies(writes)),
      assertInvalid,
    );
    assert.equal(writes.length, 0);
  }
});

test('빈 배열은 선택 동의 없이도 기존 연락처 해시 정리에 사용할 수 있다', async () => {
  const writes = [];
  let consentChecks = 0;
  const result = await saveContactHashes('user-1', [], {
    requireCurrentActiveOptIn: async () => { consentChecks += 1; },
    UserModel: recordingUserModel(writes),
  });

  assert.equal(result.count, 0);
  assert.equal(consentChecks, 0);
  assert.deepEqual(writes[0].update.$set.localContactHashes, []);
});

test('유효한 해시도 현재 contacts 선택 동의가 없으면 기존 403 계약으로 쓰지 않는다', async () => {
  const writes = [];
  const consentError = Object.assign(new Error('이 기능을 사용하려면 현재 선택 동의가 필요합니다.'), {
    status: 403,
    code: 'OPTIONAL_CONSENT_REQUIRED',
    details: { slug: 'contacts-consent' },
  });

  await assert.rejects(
    saveContactHashes('user-1', [hashFor(1)], {
      requireCurrentActiveOptIn: async () => { throw consentError; },
      UserModel: recordingUserModel(writes),
    }),
    error => error === consentError,
  );
  assert.equal(writes.length, 0);
});

test('controller는 잘못된 payload를 표준 code/message 400 응답으로 반환한다', async () => {
  const response = { status: 200, body: null };
  const res = {
    status(status) { response.status = status; return this; },
    json(body) { response.body = body; return this; },
  };
  let forwardedError = null;

  await controller.postHashes(
    { user: { _id: 'user-1' }, body: { hashes: ['01012345678'] } },
    res,
    error => { forwardedError = error; },
  );

  assert.equal(forwardedError, null);
  assert.equal(response.status, 400);
  assert.deepEqual(response.body, {
    ok: false,
    code: INVALID_CONTACT_HASHES_CODE,
    message: INVALID_CONTACT_HASHES_MESSAGE,
    error: INVALID_CONTACT_HASHES_MESSAGE,
  });
});

test('공통 helper도 빈 배열 허용과 strict SHA-256 형식을 동일하게 적용한다', () => {
  assert.deepEqual(validateAndNormalizeContactHashes([]), []);
  assert.deepEqual(validateAndNormalizeContactHashes(['A'.repeat(64)]), ['a'.repeat(64)]);
  assert.throws(() => validateAndNormalizeContactHashes(['a'.repeat(64) + ' ']), assertInvalid);
});
