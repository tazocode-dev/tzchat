require('module-alias/register');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'auth-security-policy-test-secret';
process.env.SESSION_SECRET ||= 'auth-security-policy-test-session-secret';

const test = require('node:test');
const assert = require('node:assert/strict');

const authMiddleware = require('../src/middlewares/authMiddleware');
const requireMaster = require('../src/middlewares/requireMaster');
const { resolveRole, resolveIsAdmin } = require('../src/services/sessionService');
const { extractHttpToken } = require('../src/utils/authToken');

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function createUserModel(user) {
  return {
    findById() {
      return {
        select() { return this; },
        lean() { return Promise.resolve(user ? { ...user } : null); },
      };
    },
    async updateOne() {},
  };
}

function authenticatedRequest(path = '/api/users') {
  return {
    method: 'GET',
    originalUrl: path,
    url: path,
    path,
    headers: {},
    session: { user: { _id: 'user-id' } },
  };
}

async function runMiddleware(middleware, user) {
  const req = authenticatedRequest();
  const res = responseRecorder();
  let nextCalled = false;
  await middleware(req, res, () => { nextCalled = true; });
  return { req, res, nextCalled };
}

test('기본 인증 미들웨어는 탈퇴 대기·정지·삭제 계정을 보호 API에서 차단한다', async () => {
  for (const [user, expectedCode] of [
    [{ _id: 'user-id', role: 'user', status: 'pendingDeletion', deletionDueAt: new Date(Date.now() + 60_000) }, 'ACCOUNT_PENDING_DELETION'],
    [{ _id: 'user-id', role: 'user', status: 'active', suspended: true }, 'ACCOUNT_SUSPENDED'],
    [{ _id: 'user-id', role: 'user', status: 'deleted', isDeleted: true }, 'ACCOUNT_DELETED'],
  ]) {
    const middleware = authMiddleware.createAuthMiddleware({ UserModel: createUserModel(user) });
    const { res, nextCalled } = await runMiddleware(middleware);
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, expectedCode);
  }
});

test('명시적 탈퇴 대기 예외는 pendingDeletion만 통과시키고 정지·삭제 계정은 차단한다', async () => {
  const pending = authMiddleware.createAuthMiddleware({
    allowPendingDeletion: true,
    UserModel: createUserModel({
      _id: 'user-id', role: 'user', status: 'pendingDeletion', isDeleted: true,
      deletionDueAt: new Date(Date.now() + 60_000),
    }),
  });
  assert.equal((await runMiddleware(pending)).nextCalled, true);

  for (const user of [
    { _id: 'user-id', role: 'user', status: 'deleted', isDeleted: true, deletionDueAt: new Date() },
    { _id: 'user-id', role: 'user', status: 'active', suspended: true },
  ]) {
    const middleware = authMiddleware.createAuthMiddleware({
      allowPendingDeletion: true,
      UserModel: createUserModel(user),
    });
    const result = await runMiddleware(middleware);
    assert.equal(result.nextCalled, false);
    assert.equal(result.res.statusCode, 403);
  }
});

test('탈퇴 대기 예외로 로드한 사용자를 기본 인증 검사가 재사용하지 않는다', async () => {
  const user = {
    _id: 'user-id', role: 'user', status: 'pendingDeletion', isDeleted: true,
    deletionDueAt: new Date(Date.now() + 60_000),
  };
  const req = authenticatedRequest();
  const firstRes = responseRecorder();
  const allowMiddleware = authMiddleware.createAuthMiddleware({
    allowPendingDeletion: true,
    UserModel: createUserModel(user),
  });
  await allowMiddleware(req, firstRes, () => {});

  const strictRes = responseRecorder();
  let nextCalled = false;
  const strictMiddleware = authMiddleware.createAuthMiddleware({ UserModel: createUserModel(user) });
  await strictMiddleware(req, strictRes, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(strictRes.body.code, 'ACCOUNT_PENDING_DELETION');
});

test('탈퇴 상태 조회·취소만 pendingDeletion 예외 미들웨어를 사용한다', () => {
  const router = require('../src/routes/system/accountDeletionRouter');
  const routeLayer = path => router.stack.find(layer => layer.route?.path === path)?.route;

  assert.equal(routeLayer('/status').stack[0].handle, authMiddleware.allowPendingDeletion);
  assert.equal(routeLayer('/cancel-delete').stack[0].handle, authMiddleware.allowPendingDeletion);
  assert.equal(routeLayer('/delete-request').stack[0].handle, authMiddleware);
});

test('/me만 탈퇴 대기 부트스트랩을 허용하고 계정 변경 경로는 기본 상태 게이트를 사용한다', () => {
  const router = require('../src/routes/user/accountRouter');
  const routeLayer = (method, path) => router.stack.find(layer =>
    layer.route?.path === path && layer.route?.methods?.[method]
  )?.route;

  assert.equal(routeLayer('get', '/me').stack[0].handle, authMiddleware.allowPendingDeletion);
  for (const [method, path] of [
    ['get', '/onboarding/status'],
    ['patch', '/onboarding/birth-year'],
    ['patch', '/onboarding/birth-date'],
    ['patch', '/onboarding/gender'],
    ['put', '/update-password'],
    ['post', '/account-verification/email/request'],
    ['post', '/account-verification/email/commit'],
    ['post', '/account-verification/phone/email/request'],
    ['post', '/account-verification/phone/sms/request'],
    ['post', '/account-verification/phone/commit'],
  ]) {
    assert.equal(routeLayer(method, path).stack[0].handle, authMiddleware, `${method} ${path}`);
  }
});

test('개인 약관 동의·현황만 DB 계정 상태 인증을 거치고 공개 문서는 유지한다', () => {
  const legalRouter = require('../src/routes/legal/legalRouter');
  const termsRouter = require('../src/routes/legal/termsPublicRouter');
  const firstHandler = (router, method, path) => router.stack.find(layer => {
    const paths = Array.isArray(layer.route?.path) ? layer.route.path : [layer.route?.path];
    return paths.includes(path) && layer.route?.methods?.[method];
  })?.route?.stack?.[0]?.handle;

  for (const [method, path] of [
    ['post', '/consents/agree'],
    ['get', '/agreements/me'],
    ['post', '/agreements/me/consent'],
    ['get', '/agreements/me/status'],
  ]) {
    assert.equal(firstHandler(legalRouter, method, path), authMiddleware, `${method} /api/legal${path}`);
  }
  for (const [method, path] of [
    ['post', '/consents'],
    ['get', '/agreements/list'],
    ['get', '/agreements/status'],
    ['post', '/agreements/accept'],
    ['post', '/agree'],
    ['get', '/require-consent'],
  ]) {
    assert.equal(firstHandler(termsRouter, method, path), authMiddleware, `${method} /api/terms${path}`);
  }

  assert.notEqual(firstHandler(legalRouter, 'get', '/consents/required'), authMiddleware);
  assert.notEqual(firstHandler(termsRouter, 'get', '/active'), authMiddleware);
  assert.notEqual(firstHandler(termsRouter, 'get', '/latest'), authMiddleware);
});

test('legacy 공개 signup 라우트는 등록되지 않는다', () => {
  const router = require('../src/routes/user/authRouter');
  const routes = router.stack
    .filter(layer => layer.route)
    .map(layer => ({ path: layer.route.path, methods: Object.keys(layer.route.methods) }));

  assert.equal(routes.some(route => route.path === '/signup'), false);
  assert.deepEqual(routes, [{ path: '/users', methods: ['get'] }]);
});

test('관리자 권한은 User.role master만 인정하고 legacy 필드는 무시한다', () => {
  assert.equal(requireMaster.hasMasterPrivilege({ role: 'master' }), true);

  for (const user of [
    { role: 'MASTER' },
    { role: 'user', roles: ['master'] },
    { role: 'admin' },
    { isAdmin: true },
    { isMaster: true },
    { permissions: ['master'] },
    { username: 'master' },
  ]) {
    assert.equal(requireMaster.hasMasterPrivilege(user), false);
    assert.equal(resolveRole(user), 'user');
    assert.equal(resolveIsAdmin(user), false);
  }
  assert.equal(resolveRole({ role: 'master', roles: ['user'] }), 'master');
  assert.equal(resolveIsAdmin({ role: 'master' }), true);
});

test('HTTP 인증 토큰은 헤더만 허용하고 query token은 무시한다', () => {
  assert.equal(extractHttpToken({ headers: { authorization: 'Bearer access-token' } }), 'access-token');
  assert.equal(extractHttpToken({ headers: { 'x-auth-token': ' legacy-token ' } }), 'legacy-token');
  assert.equal(extractHttpToken({ headers: {}, query: { token: 'query-token' } }), null);
});
