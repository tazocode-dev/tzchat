require('module-alias/register');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'socket-auth-test-secret';
process.env.SESSION_SECRET ||= 'socket-auth-test-session-secret';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AUTHENTICATION_ERROR_MESSAGE,
  createSocketAuthMiddleware,
  explicitSocketToken,
} = require('../src/socket/socketAuth');

function userModel(user, lookedUpIds = []) {
  return {
    findById(userId) {
      lookedUpIds.push(String(userId));
      return {
        select() { return this; },
        lean() { return Promise.resolve(user ? { ...user } : null); },
      };
    },
  };
}

async function authenticate({ handshake = {}, session, user, verifyTokenFn = () => ({ sub: 'user-1' }) }) {
  const lookedUpIds = [];
  const socket = { handshake, request: { session } };
  const middleware = createSocketAuthMiddleware({
    UserModel: userModel(user, lookedUpIds),
    verifyTokenFn,
    jwtSecret: 'test-secret',
  });
  let result;
  await middleware(socket, value => { result = value || null; });
  return { lookedUpIds, result, socket };
}

test('Socket 토큰은 handshake.auth와 Authorization만 읽고 URL query token은 무시한다', () => {
  assert.deepEqual(explicitSocketToken({ auth: { token: ' auth-token ' } }), {
    provided: true, token: 'auth-token',
  });
  assert.deepEqual(explicitSocketToken({ headers: { authorization: 'Bearer header-token' } }), {
    provided: true, token: 'header-token',
  });
  assert.deepEqual(explicitSocketToken({ query: { token: 'query-token' } }), {
    provided: false, token: '',
  });
});

test('유효한 명시 토큰은 DB의 활성 사용자를 확인한 뒤 검증된 ID만 주입한다', async () => {
  const result = await authenticate({
    handshake: { auth: { token: 'valid-token' } },
    user: { _id: 'verified-user', status: 'active', suspended: false },
    verifyTokenFn: token => ({ sub: token === 'valid-token' ? 'claimed-user' : '' }),
  });

  assert.equal(result.result, null);
  assert.deepEqual(result.lookedUpIds, ['claimed-user']);
  assert.deepEqual(result.socket.user, { _id: 'verified-user' });
  assert.equal(result.socket.authVia, 'jwt');
});

test('명시 토큰이 잘못되면 유효한 세션이 있어도 조용히 폴백하지 않는다', async () => {
  const result = await authenticate({
    handshake: { auth: { token: 'invalid-token' } },
    session: { user: { _id: 'session-user' } },
    user: { _id: 'session-user', status: 'active' },
    verifyTokenFn: () => { throw new Error('invalid'); },
  });

  assert.equal(result.result.message, AUTHENTICATION_ERROR_MESSAGE);
  assert.deepEqual(result.lookedUpIds, []);
  assert.equal(result.socket.user, undefined);
});

test('토큰이 없으면 세션 ID를 DB 검증한 뒤 허용한다', async () => {
  const result = await authenticate({
    handshake: { query: { token: 'ignored-query-token' } },
    session: { user: { _id: 'session-user' } },
    user: { _id: 'session-user', status: 'active' },
  });

  assert.equal(result.result, null);
  assert.deepEqual(result.lookedUpIds, ['session-user']);
  assert.deepEqual(result.socket.user, { _id: 'session-user' });
  assert.equal(result.socket.authVia, 'session');
});

test('익명·없는 사용자·제한 계정은 모두 같은 연결 오류로 거부한다', async () => {
  const cases = [
    { session: undefined, user: null },
    { session: { user: { _id: 'missing' } }, user: null },
    { session: { user: { _id: 'suspended' } }, user: { _id: 'suspended', suspended: true } },
    { session: { user: { _id: 'pending' } }, user: { _id: 'pending', status: 'pendingDeletion' } },
    { session: { user: { _id: 'deleted' } }, user: { _id: 'deleted', status: 'deleted' } },
    { session: { user: { _id: 'legacy-deleted' } }, user: { _id: 'legacy-deleted', isDeleted: true } },
  ];

  for (const item of cases) {
    const result = await authenticate(item);
    assert.equal(result.result.message, AUTHENTICATION_ERROR_MESSAGE);
    assert.equal(result.socket.user, undefined);
  }
});
