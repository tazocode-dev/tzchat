require('module-alias/register')
process.env.JWT_SECRET ||= 'completion-route-test-secret'
process.env.SESSION_SECRET ||= 'completion-route-test-session-secret'

const test = require('node:test')
const assert = require('node:assert/strict')

const authRouter = require('../src/routes/user/authRouter')
const accountRouter = require('../src/routes/user/accountRouter')

function handlerNames(router, method, path) {
  const layer = router.stack.find((entry) => entry.route?.path === path && entry.route?.methods?.[method])
  assert.ok(layer, `${method.toUpperCase()} ${path} route가 필요합니다.`)
  return layer.route.stack.map((entry) => entry.handle.name)
}

test('메인 사용자·친구 목록은 인증과 필수 완료 게이트를 거친다', () => {
  assert.deepEqual(handlerNames(authRouter, 'get', '/users'), [
    'authMiddleware',
    'requireCompletedOnboarding',
    'listUsers',
  ])
  assert.deepEqual(handlerNames(accountRouter, 'get', '/my-friends'), [
    'authMiddleware',
    'requireCompletedOnboarding',
    'myFriends',
  ])
})

test('인증 상태 조회와 온보딩 완료 API는 완료 게이트 앞에 남긴다', () => {
  assert.deepEqual(handlerNames(accountRouter, 'get', '/me'), ['authMiddleware', 'me'])
  assert.deepEqual(handlerNames(accountRouter, 'get', '/onboarding/status'), ['authMiddleware', 'status'])
  assert.deepEqual(handlerNames(accountRouter, 'patch', '/onboarding/birth-year'), ['authMiddleware', 'birthYear'])
  assert.deepEqual(handlerNames(accountRouter, 'patch', '/onboarding/gender'), ['authMiddleware', 'gender'])
})
