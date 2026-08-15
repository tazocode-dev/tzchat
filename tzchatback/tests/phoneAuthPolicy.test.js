require('module-alias/register')
process.env.JWT_SECRET ||= 'phone-auth-policy-test-secret'
process.env.SESSION_SECRET ||= 'phone-auth-policy-test-session-secret'
process.env.NODE_ENV = 'test'
process.env.SMS_PROVIDER = 'mock'
process.env.REVIEW_LOGIN_PHONES = '00010000001,00010000002'
process.env.REVIEW_CODE = '123456'
process.env.PHONE_FIXED_LOGIN_ACCOUNTS = '00020000001:654321,99920000002:654321'
process.env.PHONE_ACCOUNT_ROLE_OVERRIDES = '00020000001:master,99920000002:user,01030000003:master'

const test = require('node:test')
const assert = require('node:assert/strict')
const bcrypt = require('bcrypt')

const {
  localPhoneDigits,
  getPhoneLoginPolicy,
  getForcedPhoneRole,
  validatePhoneAuthPolicyEnv,
} = require('../src/config/phoneAuthPolicy')
const {
  normalizeLoginPhone,
  requestCode,
  verifyCode,
} = require('../src/services/auth/phoneVerificationService')
const { findOrCreateUserByPhone } = require('../src/services/auth/phoneAuthService')

function query(valueFactory) {
  return {
    sort() { return this },
    select() { return this },
    limit() { return Promise.resolve(valueFactory().slice(0, 2)) },
    lean() { return Promise.resolve(valueFactory()) },
    then(resolve, reject) { return Promise.resolve(valueFactory()).then(resolve, reject) },
  }
}

function verificationModel() {
  const docs = []
  return {
    docs,
    findOne(filter) {
      return query(() => docs.filter((doc) => {
        if (filter.phone && doc.phone !== filter.phone) return false
        if (filter.used !== undefined && doc.used !== filter.used) return false
        return true
      }).at(-1) || null)
    },
    async countDocuments(filter) {
      return docs.filter((doc) => {
        if (filter.phone && doc.phone !== filter.phone) return false
        if (filter.ip && doc.ip !== filter.ip) return false
        return true
      }).length
    },
    async updateMany(filter, update) {
      docs.forEach((doc) => {
        if (doc.phone === filter.phone && doc.used === filter.used) Object.assign(doc, update.$set)
      })
    },
    async updateOne(filter, update) {
      const doc = docs.find((item) => item._id === filter._id && item.used === filter.used)
      if (!doc) return { modifiedCount: 0 }
      if (update.$set) Object.assign(doc, update.$set)
      if (update.$inc) Object.entries(update.$inc).forEach(([key, value]) => { doc[key] += value })
      return { modifiedCount: 1 }
    },
    async findOneAndUpdate(filter, update) {
      const doc = docs.find((item) => item._id === filter._id && item.used === filter.used)
      if (!doc || doc.expiresAt <= new Date()) return null
      Object.assign(doc, update.$set)
      return doc
    },
    async create(data) {
      const doc = {
        _id: `phone-verification-${docs.length + 1}`,
        ...data,
        used: false,
        usedAt: null,
        attempts: 0,
        createdAt: new Date(),
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

function userModel(existingUsers = []) {
  const users = existingUsers
  const created = []
  return {
    users,
    created,
    findOne(filter) {
      if (filter.nickname) return query(() => null)
      return Promise.resolve(users.find((user) => (
        filter.loginPhone ? user.loginPhone === filter.loginPhone : false
      )) || null)
    },
    find(filter) {
      return query(() => users.filter((user) => user.phone === filter.phone))
    },
    async create(data) {
      const user = { _id: `user-${users.length + 1}`, ...data, async save() {} }
      users.push(user)
      created.push(user)
      return user
    },
  }
}

test('전화 로그인 환경변수는 심사용·고정 로그인·권한 전용 번호를 구분한다', () => {
  validatePhoneAuthPolicyEnv()
  assert.equal(getPhoneLoginPolicy('00010000001').type, 'review')
  assert.equal(getPhoneLoginPolicy('00010000001').code, '123456')
  assert.equal(getPhoneLoginPolicy('00020000001').type, 'fixed')
  assert.equal(getPhoneLoginPolicy('00020000001').code, '654321')
  assert.equal(getForcedPhoneRole('00020000001'), 'master')
  assert.equal(getForcedPhoneRole('99920000002'), 'user')
  assert.equal(getPhoneLoginPolicy('01030000003').code, null)
  assert.equal(getForcedPhoneRole('01030000003'), 'master')
})

test('일반 010 번호와 환경변수의 합성 번호만 로그인 번호로 정규화한다', () => {
  assert.equal(normalizeLoginPhone('010-1234-5678').phone, '+821012345678')
  assert.equal(normalizeLoginPhone('000-1000-0001').phone, '+820010000001')
  assert.equal(localPhoneDigits('+82 10 1234 5678'), '01012345678')
  assert.throws(() => normalizeLoginPhone('999-9999-9999'), (error) => error.code === 'INVALID_PHONE')
})

test('심사용·고정 로그인 번호는 문자를 보내지 않고 환경변수 인증번호만 허용한다', async () => {
  for (const [phone, expectedCode] of [
    ['00010000001', '123456'],
    ['00020000001', '654321'],
    ['99920000002', '654321'],
  ]) {
    const VerificationModel = verificationModel()
    let smsCalls = 0
    const requested = await requestCode(
      { phone, ip: '127.0.0.1' },
      { VerificationModel, sendSmsFn: async () => { smsCalls += 1 } },
    )
    assert.equal(requested.sent, false)
    assert.equal(smsCalls, 0)
    assert.equal(await bcrypt.compare(expectedCode, VerificationModel.docs[0].codeHash), true)
    await assert.rejects(
      verifyCode({ phone, code: '000000' }, { VerificationModel }),
      (error) => error.code === 'CODE_MISMATCH',
    )
    const verified = await verifyCode({ phone, code: expectedCode }, { VerificationModel })
    assert.match(verified.phone, /^\+82\d+$/)
    await assert.rejects(
      verifyCode({ phone, code: expectedCode }, { VerificationModel }),
      (error) => error.code === 'CODE_NOT_FOUND',
    )
  }
})

test('일반 번호와 실제 인증을 사용하는 관리자 번호는 TZPhone 발송 함수를 호출한다', async () => {
  for (const phone of ['01012345678', '01030000003']) {
    const VerificationModel = verificationModel()
    const deliveries = []
    const result = await requestCode(
      { phone, ip: '127.0.0.1' },
      { VerificationModel, sendSmsFn: async (message) => deliveries.push(message) },
    )
    assert.equal(result.sent, true)
    assert.equal(deliveries.length, 1)
    assert.match(deliveries[0].code, /^\d{6}$/)
  }
})

test('전화 로그인은 신규 계정을 만들고 관리자 권한을 환경변수대로 보정한다', async () => {
  const users = userModel()
  const created = await findOrCreateUserByPhone('+820020000001', { UserModel: users })
  assert.equal(created.isNewUser, true)
  assert.equal(created.user.role, 'master')
  assert.equal(created.user.loginPhone, '+820020000001')
  assert.ok(created.user.phoneVerifiedAt instanceof Date)

  let saves = 0
  const existingUser = {
    _id: 'existing-user',
    phone: '+821030000003',
    role: 'user',
    async save() { saves += 1 },
  }
  const existing = await findOrCreateUserByPhone('+821030000003', {
    UserModel: userModel([existingUser]),
  })
  assert.equal(existing.isNewUser, false)
  assert.equal(existing.user.role, 'master')
  assert.equal(existing.user.loginPhone, '+821030000003')
  assert.equal(saves, 1)
})

test('같은 기존 전화번호를 가진 계정이 여러 개면 임의 계정으로 로그인하지 않는다', async () => {
  const phone = '+821011112222'
  const users = userModel([
    { _id: 'user-a', phone, async save() {} },
    { _id: 'user-b', phone, async save() {} },
  ])
  await assert.rejects(
    findOrCreateUserByPhone(phone, { UserModel: users }),
    (error) => error.code === 'PHONE_ACCOUNT_AMBIGUOUS' && error.status === 409,
  )
  assert.equal(users.created.length, 0)
})
