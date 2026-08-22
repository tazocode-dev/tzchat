require('module-alias/register');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'login-attempt-test-secret';
process.env.SESSION_SECRET ||= 'login-attempt-test-session-secret';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_IP_LIMIT,
  DEFAULT_PRINCIPAL_LIMIT,
  DEFAULT_WINDOW_MS,
  LoginAttemptLimiter,
} = require('../src/services/auth/loginAttemptLimiter');
const { SessionError, authenticateUser } = require('../src/services/sessionService');
const { respondLoginRateLimit } = require('../src/controllers/session.controller');

function userModel(user) {
  return {
    findOne() {
      return { async select() { return user; } };
    },
  };
}

test('legacy 로그인 존재 여부와 비밀번호 오류는 같은 401 계약을 사용한다', async () => {
  const attempts = [
    authenticateUser('missing', 'password', {
      UserModel: userModel(null),
      comparePasswordFn: async () => false,
    }),
    authenticateUser('existing', 'wrong', {
      UserModel: userModel({ _id: 'user-1', password: 'hash' }),
      comparePasswordFn: async () => false,
    }),
    authenticateUser('legacy', 'password', {
      UserModel: userModel({ _id: 'user-2', password: '' }),
      comparePasswordFn: async () => false,
    }),
  ];

  for (const attempt of attempts) {
    await assert.rejects(attempt, error =>
      error instanceof SessionError &&
      error.status === 401 &&
      error.code === 'INVALID_CREDENTIALS' &&
      error.message === '아이디 또는 비밀번호가 올바르지 않습니다.'
    );
  }
});

test('기본 제한은 15분 동안 principal 5회와 IP 전체 30회다', () => {
  assert.equal(DEFAULT_WINDOW_MS, 15 * 60 * 1000);
  assert.equal(DEFAULT_PRINCIPAL_LIMIT, 5);
  assert.equal(DEFAULT_IP_LIMIT, 30);
});

test('principal 제한은 입력을 정규화하고 만료 후 자동 해제된다', () => {
  let now = 1000;
  const limiter = new LoginAttemptLimiter({
    now: () => now,
    windowMs: 900_000,
    principalLimit: 3,
    ipLimit: 30,
  });

  assert.equal(limiter.recordFailure(' 127.0.0.1 ', ' Admin ').limited, false);
  assert.equal(limiter.recordFailure('127.0.0.1', 'admin').limited, false);
  const blocked = limiter.recordFailure('127.0.0.1', 'ADMIN');
  assert.equal(blocked.limited, true);
  assert.equal(blocked.retryAfterSeconds, 900);

  now += 900_001;
  assert.equal(limiter.check('127.0.0.1', 'admin').limited, false);
  assert.deepEqual(limiter.entryCounts(), { principals: 0, ips: 0 });
});

test('Retry-After는 밀리초 경계에서도 올림한 정수 초를 반환한다', () => {
  let now = 1234;
  const limiter = new LoginAttemptLimiter({
    now: () => now,
    windowMs: 1501,
    principalLimit: 1,
    ipLimit: 30,
  });

  const blocked = limiter.recordFailure('127.0.0.1', 'admin');
  assert.equal(blocked.retryAfterSeconds, 2);
  assert.equal(Number.isInteger(blocked.retryAfterSeconds), true);

  now += 1001;
  assert.equal(limiter.check('127.0.0.1', 'admin').retryAfterSeconds, 1);
});

test('429 로그인 응답은 정수 Retry-After와 일반화된 공개 오류만 반환한다', () => {
  const response = { headers: {}, statusCode: 0, body: null };
  const res = {
    setHeader(name, value) { response.headers[name] = value; },
    status(value) { response.statusCode = value; return this; },
    json(value) { response.body = value; return this; },
  };

  respondLoginRateLimit(res, 37);
  assert.equal(response.headers['Retry-After'], '37');
  assert.equal(response.statusCode, 429);
  assert.deepEqual(response.body, {
    ok: false,
    code: 'LOGIN_RATE_LIMITED',
    message: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  });
});

test('IP 전체 제한은 여러 username에 합산되고 성공은 해당 principal만 초기화한다', () => {
  const limiter = new LoginAttemptLimiter({ principalLimit: 2, ipLimit: 3 });

  limiter.recordFailure('10.0.0.1', 'first');
  limiter.recordSuccess('10.0.0.1', 'first');
  assert.equal(limiter.recordFailure('10.0.0.1', 'first').limited, false);
  assert.equal(limiter.recordFailure('10.0.0.1', 'second').limited, true);
});

test('해시 키와 최대 엔트리 수로 원문 보관과 무한 Map 증가를 막는다', () => {
  const limiter = new LoginAttemptLimiter({
    principalLimit: 100,
    ipLimit: 100,
    maxPrincipalEntries: 2,
    maxIpEntries: 2,
  });

  for (let index = 0; index < 5; index += 1) {
    limiter.recordFailure(`192.0.2.${index}`, `User-${index}-${'x'.repeat(300)}`);
  }
  assert.deepEqual(limiter.entryCounts(), { principals: 2, ips: 2 });
  for (const key of [...limiter.principalAttempts.keys(), ...limiter.ipAttempts.keys()]) {
    assert.match(key, /^[a-f0-9]{64}$/);
    assert.equal(key.includes('User-'), false);
  }
});
