require('module-alias/register')
process.env.JWT_SECRET ||= 'public-phone-change-test-secret'
process.env.SESSION_SECRET ||= 'public-phone-change-test-session-secret'
process.env.NODE_ENV = 'test'
process.env.MAIL_PROVIDER = 'dev'
process.env.EMAIL_CODE_FIXED = 'false'
process.env.SMS_PROVIDER = 'mock'

const test = require('node:test')
const assert = require('node:assert/strict')
const bcrypt = require('bcrypt')

const {
  requestPublicPhoneChangeEmailCode,
  requestPublicPhoneChangeSmsCode,
  commitPublicPhoneChange,
} = require('../src/services/auth/accountVerificationService')

function queryResult(value) {
  const query = {
    select() { return this },
    sort() { return this },
    lean() { return Promise.resolve(value) },
    then(resolve, reject) { return Promise.resolve(value).then(resolve, reject) },
  }
  return query
}

function userModelFor(user, duplicatePhone = '') {
  return {
    findOne(filter) {
      if (filter.email !== undefined) {
        const matches = user &&
          user.loginPhone === filter.loginPhone &&
          user.email === filter.email
        return queryResult(matches ? user : null)
      }
      if (filter.loginPhone !== undefined) {
        const duplicate = duplicatePhone === filter.loginPhone ? { _id: 'other-user' } : null
        return queryResult(duplicate)
      }
      return queryResult(null)
    },
  }
}

function challengeModel() {
  const docs = []
  return {
    docs,
    findOne(filter) {
      const found = [...docs].reverse().find((doc) => Object.entries(filter).every(([key, value]) => doc[key] === value)) || null
      return queryResult(found)
    },
    countDocuments: async () => 0,
    updateMany: async (filter, update) => {
      docs.filter((doc) => Object.entries(filter).every(([key, value]) => doc[key] === value))
        .forEach((doc) => Object.assign(doc, update.$set || {}))
    },
    async create(data) {
      const doc = {
        _id: `challenge-${docs.length + 1}`,
        ...data,
        attempts: 0,
        used: false,
        usedAt: null,
        createdAt: new Date(),
        async save() {},
      }
      docs.push(doc)
      return doc
    },
    async deleteOne(filter) {
      const index = docs.findIndex((doc) => doc._id === filter._id)
      if (index >= 0) docs.splice(index, 1)
    },
  }
}

function verifiedUser(overrides = {}) {
  return {
    _id: 'user-1',
    loginPhone: '+821011111111',
    phone: '+821011111111',
    phoneVerifiedAt: new Date(),
    email: 'user@example.com',
    emailVerifiedAt: new Date(),
    saveCalls: 0,
    async save() { this.saveCalls += 1 },
    ...overrides,
  }
}

test('로그인 전 전화번호 변경은 일치하고 인증된 계정에만 이메일과 문자를 발송한다', async () => {
  const user = verifiedUser()
  const VerificationModel = challengeModel()
  let mailCalls = 0
  let smsCalls = 0
  let emailCode = ''
  const dependencies = {
    UserModel: userModelFor(user),
    VerificationModel,
    sendMailFn: async ({ to, text }) => {
      assert.equal(to, 'user@example.com')
      emailCode = String(text).match(/\d{6}/)?.[0] || ''
      mailCalls += 1
    },
    sendSmsFn: async ({ phone }) => {
      assert.equal(phone, '+821022222222')
      smsCalls += 1
    },
  }

  await requestPublicPhoneChangeEmailCode({
    currentPhone: '010-1111-1111', currentEmail: 'USER@example.com', ip: '127.0.0.1',
  }, dependencies)
  await requestPublicPhoneChangeSmsCode({
    currentPhone: '010-1111-1111', currentEmail: 'USER@example.com', newPhone: '010-2222-2222', emailCode, ip: '127.0.0.1',
  }, dependencies)

  assert.equal(mailCalls, 1)
  assert.equal(smsCalls, 1)
  assert.deepEqual(VerificationModel.docs.map((doc) => doc.purpose), [
    'public_phone_change_email',
    'public_phone_change_sms',
  ])
})

test('로그인 전 새 번호 문자는 기존 이메일 인증번호가 맞을 때만 발송한다', async () => {
  const user = verifiedUser()
  const VerificationModel = challengeModel()
  let emailCode = ''
  let smsCalls = 0
  const dependencies = {
    UserModel: userModelFor(user),
    VerificationModel,
    sendMailFn: async ({ text }) => { emailCode = String(text).match(/\d{6}/)?.[0] || '' },
    sendSmsFn: async () => { smsCalls += 1 },
  }
  const identity = {
    currentPhone: '01011111111',
    currentEmail: 'user@example.com',
    newPhone: '01022222222',
    ip: '127.0.0.1',
  }

  await requestPublicPhoneChangeEmailCode(identity, dependencies)
  const wrongCode = emailCode === '000000' ? '000001' : '000000'
  const missing = await requestPublicPhoneChangeSmsCode(identity, dependencies)
  const wrong = await requestPublicPhoneChangeSmsCode({ ...identity, emailCode: wrongCode }, dependencies)

  assert.equal(missing.accepted, true)
  assert.deepEqual(missing, wrong)
  assert.equal(smsCalls, 0)

  await requestPublicPhoneChangeSmsCode({ ...identity, emailCode }, dependencies)
  assert.equal(smsCalls, 1)
  const emailDoc = VerificationModel.docs.find((doc) => doc.purpose === 'public_phone_change_email')
  assert.equal(emailDoc.used, false)
})

test('계정 불일치와 인증 미완료는 같은 공개 응답을 반환하고 발송하지 않는다', async () => {
  let sends = 0
  const dependencies = {
    UserModel: userModelFor(null),
    VerificationModel: challengeModel(),
    sendMailFn: async () => { sends += 1 },
  }
  const missing = await requestPublicPhoneChangeEmailCode({
    currentPhone: '01011111111', currentEmail: 'missing@example.com', ip: '127.0.0.1',
  }, dependencies)

  dependencies.UserModel = userModelFor(verifiedUser({ emailVerifiedAt: null }))
  const unverified = await requestPublicPhoneChangeEmailCode({
    currentPhone: '01011111111', currentEmail: 'user@example.com', ip: '127.0.0.1',
  }, dependencies)

  assert.deepEqual(missing, unverified)
  assert.equal(sends, 0)
})

test('다른 계정의 로그인 번호에는 문자를 발송하지 않고 공개 응답으로 번호 충돌을 숨긴다', async () => {
  const user = verifiedUser()
  let smsCalls = 0
  const result = await requestPublicPhoneChangeSmsCode({
    currentPhone: '01011111111', currentEmail: 'user@example.com', newPhone: '01022222222', ip: '127.0.0.1',
  }, {
    UserModel: userModelFor(user, '+821022222222'),
    VerificationModel: challengeModel(),
    sendSmsFn: async () => { smsCalls += 1 },
  })

  assert.equal(result.accepted, true)
  assert.equal(smsCalls, 0)
})

test('이메일과 새 번호 인증번호가 모두 맞아야 로그인 전화번호를 변경하고 코드를 소비한다', async () => {
  const user = verifiedUser()
  const emailDoc = {
    userId: 'user-1', purpose: 'public_phone_change_email', destination: 'user@example.com',
    codeHash: await bcrypt.hash('123456', 4), expiresAt: new Date(Date.now() + 60_000), attempts: 0, used: false,
    async save() {},
  }
  const smsDoc = {
    userId: 'user-1', purpose: 'public_phone_change_sms', destination: '+821022222222',
    codeHash: await bcrypt.hash('654321', 4), expiresAt: new Date(Date.now() + 60_000), attempts: 0, used: false,
    async save() {},
  }
  const VerificationModel = {
    findOne(filter) {
      const doc = [emailDoc, smsDoc].find((item) =>
        item.userId === filter.userId && item.purpose === filter.purpose &&
        item.destination === filter.destination && item.used === filter.used) || null
      return queryResult(doc)
    },
  }
  const dependencies = { UserModel: userModelFor(user), VerificationModel }

  await assert.rejects(
    commitPublicPhoneChange({
      currentPhone: '01011111111', currentEmail: 'user@example.com', newPhone: '01022222222',
      emailCode: '123456', smsCode: '000000',
    }, dependencies),
    (error) => error.code === 'PUBLIC_PHONE_CHANGE_FAILED',
  )
  assert.equal(user.saveCalls, 0)

  const result = await commitPublicPhoneChange({
    currentPhone: '01011111111', currentEmail: 'user@example.com', newPhone: '01022222222',
    emailCode: '123456', smsCode: '654321',
  }, dependencies)

  assert.equal(user.loginPhone, '+821022222222')
  assert.equal(user.phone, '+821022222222')
  assert.equal(user.phoneVerifiedBy, 'SMS+EMAIL_PUBLIC_CHANGE')
  assert.equal(user.saveCalls, 1)
  assert.equal(emailDoc.used, true)
  assert.equal(smsDoc.used, true)
  assert.equal(result.phoneMasked, '010-****-2222')
})
