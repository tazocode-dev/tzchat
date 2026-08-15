require('module-alias/register')

const test = require('node:test')
const assert = require('node:assert/strict')
const { requireMaster, pushTestHttpStatus } = require('../src/controllers/admin/adminMonitor.controller')

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

test('일반 사용자는 body에 관리자 값을 보내도 관리자 가드를 통과하지 못한다', () => {
  const req = {
    user: { _id: 'normal-user', role: 'user' },
    body: { role: 'master', isAdmin: true },
  }
  const res = responseRecorder()
  let nextCalled = false

  requireMaster(req, res, () => { nextCalled = true })

  assert.equal(nextCalled, false)
  assert.equal(res.statusCode, 403)
})

test('DB에서 로드된 req.user가 master인 경우에만 관리자 가드를 통과한다', () => {
  const req = { user: { _id: 'master-user', role: 'master' }, body: {} }
  const res = responseRecorder()
  let nextCalled = false

  requireMaster(req, res, () => { nextCalled = true })

  assert.equal(nextCalled, true)
  assert.equal(res.statusCode, 200)
})

test('관리자 푸시 테스트는 미구성·발송 실패를 성공 응답으로 표시하지 않는다', () => {
  assert.equal(pushTestHttpStatus({ configured: false, skipped: 'not_configured' }), 503)
  assert.equal(pushTestHttpStatus({ configured: true, skipped: 'notifications_disabled' }), 409)
  assert.equal(pushTestHttpStatus({ configured: true, skipped: 'no_tokens' }), 404)
  assert.equal(pushTestHttpStatus({ configured: true, skipped: 'send_error' }), 502)
  assert.equal(pushTestHttpStatus({ configured: true, success: 0, failure: 1 }), 502)
  assert.equal(pushTestHttpStatus({ configured: true, success: 1, failure: 0 }), 200)
})
