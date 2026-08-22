require('module-alias/register');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'protected-route-auth-test-secret';
process.env.SESSION_SECRET ||= 'protected-route-auth-session-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const authMiddleware = require('../src/middlewares/authMiddleware');
const requireMaster = require('../src/middlewares/requireMaster');

const ROUTES_ROOT = path.join(__dirname, '../src/routes');

function loadRouter(relativePath) {
  return require(path.join(ROUTES_ROOT, relativePath));
}

function globalMiddleware(router) {
  return router.stack.filter(layer => !layer.route).map(layer => layer.handle);
}

function sourceFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(fullPath);
  }
  return files;
}

test('보호 라우터는 공통 authMiddleware 하나로 계정 상태를 검증한다', () => {
  const globalRouters = [
    'admin/adminRouter.js',
    'chat/chatRoomRouter.js',
    'chat/chatMessageRouter.js',
    'chat/friendRequestSendRouter.js',
    'chat/friendRequestManageRouter.js',
    'chat/friendRelationRouter.js',
    'public/imageReadRouter.js',
    'public/imageWriteRouter.js',
    'search/contactsRouter.js',
    'search/searchingRouter.js',
    'search/targetRouter.js',
    'search/emergencyRouter.js',
    'system/pushRouter.js',
    'user/userRouter.js',
  ];

  for (const relativePath of globalRouters) {
    const middleware = globalMiddleware(loadRouter(relativePath));
    assert.equal(middleware[0], authMiddleware, relativePath);
    assert.equal(middleware.filter(handler => handler === authMiddleware).length, 1, relativePath);
  }

  const reportRouter = loadRouter('system/reportRouter.js');
  const reportRoute = reportRouter.stack.find(layer => layer.route?.path === '/reports')?.route;
  assert.equal(reportRoute.stack[0].handle, authMiddleware);
});

test('관리자 migration·terms 라우터도 공통 인증 후 DB master 검사를 수행한다', () => {
  for (const relativePath of ['admin/migrationRouter.js', 'admin/termsRouter.js']) {
    const middleware = globalMiddleware(loadRouter(relativePath));
    assert.equal(middleware[0], authMiddleware, relativePath);
    assert.equal(middleware[1], requireMaster, relativePath);
  }
});

test('legacy 인증·탈퇴 차단 파일과 소스 참조 및 custom 인증 함수가 남지 않는다', () => {
  const sourceRoot = path.join(__dirname, '../src');
  const legacyLoginName = ['require', 'Login'].join('');
  const legacyDeletionBlockName = ['block', 'If', 'Pending', 'Deletion'].join('');
  const customAuthName = ['ensure', 'Auth'].join('');
  assert.equal(fs.existsSync(path.join(sourceRoot, `middlewares/${legacyLoginName}.js`)), false);
  assert.equal(fs.existsSync(path.join(sourceRoot, `middlewares/${legacyDeletionBlockName}.js`)), false);

  const source = sourceFiles(sourceRoot).map(file => fs.readFileSync(file, 'utf8')).join('\n');
  assert.equal(source.includes(legacyLoginName), false);
  assert.equal(source.includes(legacyDeletionBlockName), false);
  assert.equal(source.includes(customAuthName), false);
});
