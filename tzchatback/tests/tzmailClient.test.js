require('module-alias/register')

const test = require('node:test')
const assert = require('node:assert/strict')
const axios = require('axios')

process.env.MAIL_PROVIDER = 'tzmail'
process.env.TZMAIL_BASE_URL = 'https://mail.example.test/api/'
process.env.TZMAIL_APP_ID = 'registered-app'
process.env.TZMAIL_API_KEY = `tzm_${'a'.repeat(64)}`

const { sendMail } = require('../src/services/mail/tzmailClient')
const originalPost = axios.post
const originalConsoleError = console.error

test.afterEach(() => {
  axios.post = originalPost
  console.error = originalConsoleError
})

test('TZMail provider는 서버에서만 앱 헤더를 붙이고 정상 응답을 전달한다', async () => {
  let request
  axios.post = async (...args) => {
    request = args
    return { status: 200, data: { success: true, data: { status: 'sent' } } }
  }

  const result = await sendMail({
    to: 'recipient@example.com',
    subject: 'subject',
    text: 'body',
    html: '<p>body</p>',
  })

  assert.equal(request[0], 'https://mail.example.test/api/v1/mail/send')
  assert.equal(request[1].appId, undefined)
  assert.equal(request[1].apiKey, undefined)
  assert.equal(request[2].headers['x-tzmail-app-id'], 'registered-app')
  assert.equal(request[2].headers['x-tzmail-api-key'], process.env.TZMAIL_API_KEY)
  assert.equal(result.status, 200)
})

test('TZMail timeout과 provider 거부를 진단 가능한 내부 코드로 구분한다', async () => {
  console.error = () => {}
  axios.post = async () => { throw Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }) }
  await assert.rejects(
    sendMail({ to: 'recipient@example.com', subject: 'subject', text: 'body', html: '' }),
    (error) => error.code === 'TZMAIL_TIMEOUT',
  )

  axios.post = async () => ({
    status: 401,
    data: { success: false, error: { code: 'UNAUTHORIZED' } },
  })
  await assert.rejects(
    sendMail({ to: 'recipient@example.com', subject: 'subject', text: 'body', html: '' }),
    (error) => error.code === 'EMAIL_DELIVERY_REJECTED'
      && error.providerStatus === 401
      && error.providerCode === 'UNAUTHORIZED',
  )

  axios.post = async () => ({
    status: 200,
    data: { success: true, data: { status: 'failed', errorCode: 'PROVIDER_REJECTED' } },
  })
  await assert.rejects(
    sendMail({ to: 'recipient@example.com', subject: 'subject', text: 'body', html: '' }),
    (error) => error.code === 'EMAIL_DELIVERY_REJECTED'
      && error.providerStatus === 200
      && error.providerCode === 'PROVIDER_REJECTED',
  )
})
