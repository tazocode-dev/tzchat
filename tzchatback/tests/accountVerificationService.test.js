require('module-alias/register')
process.env.JWT_SECRET ||= 'account-verification-test-secret'
process.env.SESSION_SECRET ||= 'account-verification-test-session-secret'
process.env.NODE_ENV = 'test'
process.env.MAIL_PROVIDER = 'dev'
process.env.EMAIL_CODE_FIXED = 'false'
process.env.SMS_PROVIDER = 'mock'

const test = require('node:test')
const assert = require('node:assert/strict')
const bcrypt = require('bcrypt')

const {
  normalizePhoneKR,
  requestEmailCode,
  requestPhoneEmailCode,
  requestPhoneSmsCode,
  commitEmailChange,
  commitPhoneChange,
} = require('../src/services/auth/accountVerificationService')

function userModelFor(user) {
  return {
    findById() {
      return { select: () => Promise.resolve(user) }
    },
  }
}

function emailUserModelFor(user, duplicate = null) {
  return {
    findById() { return { select: () => Promise.resolve(user) } },
    findOne(filter) {
      return {
        select() { return this },
        lean() { return Promise.resolve(duplicate && duplicate.email === filter.email ? duplicate : null) },
      }
    },
  }
}

function challengeModel() {
  const docs = []
  return {
    docs,
    findOne() {
      return { sort() { return this }, select: () => Promise.resolve(null) }
    },
    countDocuments: async () => 0,
    updateMany: async () => {},
    async create(data) {
      const doc = { _id: `challenge-${docs.length + 1}`, ...data }
      docs.push(doc)
      return doc
    },
    async deleteOne() {},
  }
}

function verificationModelFor(docs) {
  return {
    findOne(filter) {
      const query = {
        sort() { return this },
        select() {
          return Promise.resolve(docs.find((doc) =>
            doc.userId === filter.userId &&
            doc.purpose === filter.purpose &&
            doc.destination === filter.destination &&
            doc.used === filter.used
          ) || null)
        },
      }
      return query
    },
  }
}

async function verificationDoc({ purpose, destination, code }) {
  return {
    userId: 'user-1',
    purpose,
    destination,
    codeHash: await bcrypt.hash(code, 4),
    expiresAt: new Date(Date.now() + 60_000),
    used: false,
    usedAt: null,
    attempts: 0,
    async save() {},
  }
}

test('전화번호는 국내 010 휴대전화 번호만 E.164로 정규화한다', () => {
  assert.equal(normalizePhoneKR('010-1234-5678'), '+821012345678')
  assert.equal(normalizePhoneKR('+82 10 1234 5678'), '+821012345678')
  assert.equal(normalizePhoneKR('02-1234-5678'), '')
  assert.equal(normalizePhoneKR('010-123-4567'), '')
  assert.equal(normalizePhoneKR('000-1000-0001'), '')
})

test('최초 전화번호 인증은 이메일 재인증 없이 문자를 요청할 수 있다', async () => {
  let smsCalls = 0
  const user = { email: 'user@example.com', emailVerifiedAt: null, phone: null }
  const result = await requestPhoneSmsCode(
    { userId: 'user-1', newPhone: '010-1234-5678', ip: '127.0.0.1' },
    {
      UserModel: userModelFor(user),
      VerificationModel: challengeModel(),
      sendSmsFn: async () => { smsCalls += 1 },
    },
  )
  assert.equal(smsCalls, 1)
  assert.equal(result.sent, true)
})

test('기존 전화번호 변경은 인증된 이메일이 없으면 문자 요청 전에 차단한다', async () => {
  let smsCalls = 0
  const user = {
    email: 'user@example.com',
    emailVerifiedAt: null,
    phone: '+821099999999',
    phoneVerifiedAt: new Date(),
  }
  await assert.rejects(
    requestPhoneSmsCode(
      { userId: 'user-1', newPhone: '010-1234-5678', ip: '127.0.0.1' },
      { UserModel: userModelFor(user), sendSmsFn: async () => { smsCalls += 1 } },
    ),
    (error) => error.code === 'EMAIL_NOT_VERIFIED' && error.status === 409,
  )
  assert.equal(smsCalls, 0)
})

test('로그인 테스트 번호는 계정 전화번호 변경 인증을 우회하지 않는다', async () => {
  let smsCalls = 0
  await assert.rejects(
    requestPhoneSmsCode(
      { userId: 'user-1', newPhone: '00010000001', ip: '127.0.0.1' },
      {
        UserModel: userModelFor({ email: 'user@example.com', emailVerifiedAt: new Date(), phone: null }),
        VerificationModel: challengeModel(),
        sendSmsFn: async () => { smsCalls += 1 },
      },
    ),
    (error) => error.code === 'INVALID_PHONE',
  )
  assert.equal(smsCalls, 0)
})

test('다른 계정 소유 이메일로 현재 이메일을 변경하는 요청은 계속 차단한다', async () => {
  const current = { _id: 'user-1', email: 'current@example.com', emailVerifiedAt: new Date() }
  const duplicate = { _id: 'user-2', email: 'existing@example.com' }
  const UserModel = emailUserModelFor(current, duplicate)

  await assert.rejects(
    requestEmailCode(
      { userId: 'user-1', kind: 'new', newEmail: 'existing@example.com', ip: '127.0.0.1' },
      { UserModel },
    ),
    (error) => error.code === 'EMAIL_IN_USE' && error.status === 409,
  )
  await assert.rejects(
    commitEmailChange(
      { userId: 'user-1', newEmail: 'existing@example.com', currentCode: '111111', newCode: '222222' },
      { UserModel },
    ),
    (error) => error.code === 'EMAIL_IN_USE' && error.status === 409,
  )
  assert.equal(current.email, 'current@example.com')
})

test('심사용 이메일 우회는 로그인에만 적용되고 계정정보 인증 메일은 실제 발송 함수를 호출한다', async () => {
  const user = { _id: 'user-1', email: 'test@tazocode.com', emailVerifiedAt: new Date(), phone: null }
  const VerificationModel = challengeModel()
  let mailCalls = 0
  const result = await requestPhoneEmailCode(
    { userId: 'user-1', ip: '127.0.0.1' },
    {
      UserModel: emailUserModelFor(user),
      VerificationModel,
      sendMailFn: async () => { mailCalls += 1 },
    },
  )
  assert.equal(mailCalls, 1)
  assert.equal(result.sent, true)
  assert.equal(result.reviewLogin, false)
})

test('최초 전화번호 등록은 문자 인증만 확인해 저장한다', async () => {
  let saves = 0
  const user = {
    email: 'user@example.com',
    emailVerifiedAt: new Date(),
    phone: null,
    phoneVerifiedAt: null,
    async save() { saves += 1 },
  }
  const smsDoc = await verificationDoc({
    purpose: 'phone_change_sms',
    destination: '+821012345678',
    code: '654321',
  })

  const result = await commitPhoneChange({
    userId: 'user-1',
    newPhone: '010-1234-5678',
    emailCode: '',
    smsCode: '654321',
  }, {
    UserModel: userModelFor(user),
    VerificationModel: verificationModelFor([smsDoc]),
  })

  assert.equal(saves, 1)
  assert.equal(user.phone, '+821012345678')
  assert.equal(user.phoneVerifiedBy, 'SMS')
  assert.equal(result.phoneVerified, true)
  assert.equal(smsDoc.used, true)
})

test('전화번호 변경은 현재 이메일 코드와 새 번호 문자 코드가 모두 맞아야 저장한다', async () => {
  let saves = 0
  const user = {
    email: 'user@example.com',
    emailVerifiedAt: new Date(),
    phone: '+821099999999',
    phoneVerifiedAt: new Date(),
    async save() { saves += 1 },
  }
  const docs = [
    await verificationDoc({ purpose: 'phone_change_email', destination: 'user@example.com', code: '123456' }),
    await verificationDoc({ purpose: 'phone_change_sms', destination: '+821012345678', code: '654321' }),
  ]
  const dependencies = {
    UserModel: userModelFor(user),
    VerificationModel: verificationModelFor(docs),
  }

  await assert.rejects(
    commitPhoneChange({
      userId: 'user-1',
      newPhone: '010-1234-5678',
      emailCode: '123456',
      smsCode: '000000',
    }, dependencies),
    (error) => error.code === 'CODE_MISMATCH',
  )
  assert.equal(saves, 0)
  assert.equal(user.phone, '+821099999999')

  const result = await commitPhoneChange({
    userId: 'user-1',
    newPhone: '010-1234-5678',
    emailCode: '123456',
    smsCode: '654321',
  }, dependencies)

  assert.equal(saves, 1)
  assert.equal(user.phone, '+821012345678')
  assert.equal(user.phoneVerifiedBy, 'SMS+EMAIL')
  assert.equal(result.phoneMasked, '010-****-5678')
  assert.equal(docs.every((doc) => doc.used), true)
})
