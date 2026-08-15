require('module-alias/register')
process.env.JWT_SECRET ||= 'email-auth-policy-test-secret'
process.env.SESSION_SECRET ||= 'email-auth-policy-test-session-secret'
process.env.NODE_ENV = 'test'
process.env.MAIL_PROVIDER = 'dev'
process.env.EMAIL_CODE_FIXED = 'false'
process.env.EMAIL_FIXED_LOGIN_ACCOUNTS = 'fixed-admin@example.com:000001,fixed-user@example.com:000002,test01@example.com:123456'
process.env.EMAIL_ACCOUNT_ROLE_OVERRIDES = 'normal-admin@example.com:master,fixed-admin@example.com:master,fixed-user@example.com:user,test01@example.com:user'
const test = require('node:test')
const assert = require('node:assert/strict')
const bcrypt = require('bcrypt')

const {
  normalizeEmail,
  isReviewLoginEmail,
  getReviewLoginCode,
  isTemporaryAdminEmail,
  getForcedAccountRole,
  isSpeedMatchingTestEmail,
} = require('../src/config/emailAuthPolicy')
const {
  requestCode,
  verifyCode,
} = require('../src/services/auth/emailVerificationService')
const {
  findOrCreateUserByEmail,
} = require('../src/services/auth/emailAuthService')

function query(valueFactory) {
  return {
    sort() { return this },
    select() { return this },
    lean() { return Promise.resolve(valueFactory()) },
    then(resolve, reject) { return Promise.resolve(valueFactory()).then(resolve, reject) },
  }
}

function createVerificationModel() {
  const docs = []
  return {
    docs,
    findOne(filter) {
      return query(() => {
        const matches = docs.filter((doc) => {
          if (filter.email && doc.email !== filter.email) return false
          if (filter.used !== undefined && doc.used !== filter.used) return false
          return true
        })
        return matches.at(-1) || null
      })
    },
    async countDocuments(filter) {
      return docs.filter((doc) => {
        if (filter.email && doc.email !== filter.email) return false
        if (filter.ip && doc.ip !== filter.ip) return false
        return true
      }).length
    },
    async updateMany(filter, update) {
      for (const doc of docs) {
        if (doc.email === filter.email && doc.used === filter.used) Object.assign(doc, update.$set)
      }
    },
    async create(data) {
      const doc = {
        _id: `verification-${docs.length + 1}`,
        ...data,
        used: false,
        usedAt: null,
        attempts: 0,
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

const TEST_LOGIN_CODES = new Map([
  ['fixed-admin@example.com', '000001'],
  ['fixed-user@example.com', '000002'],
  ['test01@example.com', '123456'],
])
const TEST_EMAILS = [...TEST_LOGIN_CODES.keys()]

test('지정된 심사용 이메일만 대소문자/공백 정규화 후 정확히 허용한다', () => {
  for (const email of TEST_EMAILS) assert.equal(isReviewLoginEmail(email), true)
  assert.equal(isReviewLoginEmail('  FIXED-ADMIN@EXAMPLE.COM  '), true)

  for (const email of [
    'normal@example.com',
    'test02@example.com',
    'test01@example.com.evil',
    'prefix-test01@example.com',
    'test01+tag@example.com',
    'test01@mail.example.com',
  ]) {
    assert.equal(isReviewLoginEmail(email), false)
  }
})

test('심사용 로그인 코드는 실행 환경과 전역 고정번호 플래그에 관계없이 정확한 이메일에만 적용된다', () => {
  const previous = process.env.NODE_ENV
  try {
    for (const nodeEnv of ['development', 'test', 'production']) {
      process.env.NODE_ENV = nodeEnv
      assert.equal(isReviewLoginEmail('normal@example.com'), false)
      assert.equal(getReviewLoginCode('test02@example.com'), null)
      assert.equal(getReviewLoginCode('fixed-admin@example.com'), '000001')
      assert.equal(getReviewLoginCode('fixed-user@example.com'), '000002')
      assert.equal(getReviewLoginCode('test01@example.com'), '123456')
      assert.equal(getReviewLoginCode('normal@tazocode.com'), null)
    }
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previous
  }
})

test('심사용 이메일 로그인 요청은 메일을 보내지 않고 reviewLogin으로 응답한다', async () => {
  for (const email of TEST_EMAILS) {
    const VerificationModel = createVerificationModel()
    let mailCalls = 0
    const result = await requestCode(
      { email: `  ${email.toUpperCase()}  `, ip: '127.0.0.1' },
      { VerificationModel, sendMailFn: async () => { mailCalls += 1 } },
    )

    assert.equal(mailCalls, 0)
    assert.equal(result.sent, false)
    assert.equal(result.reviewLogin, true)
    assert.equal('devCode' in result, false)
    assert.equal(VerificationModel.docs.length, 1)
    assert.equal(VerificationModel.docs[0].email, email)
    assert.equal(await bcrypt.compare(TEST_LOGIN_CODES.get(email), VerificationModel.docs[0].codeHash), true)
  }
})

test('심사용 이메일도 잘못된 인증번호는 실패하고 설정된 번호만 성공한다', async () => {
  for (const [email, expectedCode] of TEST_LOGIN_CODES) {
    const VerificationModel = createVerificationModel()
    await requestCode(
      { email, ip: '127.0.0.1' },
      { VerificationModel, sendMailFn: async () => assert.fail('테스트 이메일은 메일을 보내면 안 됩니다.') },
    )

    const wrongCode = expectedCode === '654321' ? '123456' : '654321'
    await assert.rejects(
      verifyCode({ email, code: wrongCode }, { VerificationModel }),
      (error) => error.code === 'CODE_MISMATCH',
    )
    assert.equal((await verifyCode({ email, code: expectedCode }, { VerificationModel })).email, email)
  }
})

test('고정번호 목록에 없는 이메일은 실제 메일 발송 함수를 호출한다', async () => {
  const previousProvider = process.env.MAIL_PROVIDER
  process.env.MAIL_PROVIDER = 'tzmail'
  process.env.TZMAIL_BASE_URL = 'https://mail.example.test/api'
  process.env.TZMAIL_APP_ID = 'test-app'
  process.env.TZMAIL_API_KEY = 'test-key'
  const VerificationModel = createVerificationModel()
  const deliveries = []
  const result = await requestCode(
    { email: 'normal@example.com', ip: '127.0.0.1' },
    { VerificationModel, sendMailFn: async (message) => deliveries.push(message) },
  )

  assert.equal(deliveries.length, 1)
  assert.equal(result.sent, true)
  assert.equal(result.reviewLogin, false)
  assert.equal('devCode' in result, false)
  assert.equal(deliveries[0].to, 'normal@example.com')
  const deliveredCode = /인증번호는 (\d{6})/.exec(deliveries[0].text)?.[1]
  assert.match(deliveredCode || '', /^\d{6}$/)
  assert.equal(await bcrypt.compare(deliveredCode, VerificationModel.docs[0].codeHash), true)
  process.env.MAIL_PROVIDER = previousProvider
})

test('자동화 테스트의 dev provider만 devCode를 반환하고 메일을 발송하지 않는다', async () => {
  process.env.MAIL_PROVIDER = 'dev'
  const VerificationModel = createVerificationModel()
  let mailCalls = 0
  const result = await requestCode(
    { email: 'automation@example.com', ip: '127.0.0.1' },
    { VerificationModel, sendMailFn: async () => { mailCalls += 1 } },
  )
  assert.equal(mailCalls, 0)
  assert.equal(result.sent, false)
  assert.equal(result.reviewLogin, false)
  assert.match(result.devCode, /^\d{6}$/)
})

test('일반 이메일 메일 발송이 실패하면 방금 만든 인증 레코드를 제거한다', async () => {
  const previousProvider = process.env.MAIL_PROVIDER
  process.env.MAIL_PROVIDER = 'tzmail'
  const VerificationModel = createVerificationModel()

  await assert.rejects(
    requestCode(
      { email: 'delivery-failure@example.com', ip: '127.0.0.1' },
      {
        VerificationModel,
        sendMailFn: async () => { throw new Error('provider unavailable') },
      },
    ),
    (error) => error.code === 'EMAIL_DELIVERY_FAILED' && error.status === 502,
  )

  assert.equal(VerificationModel.docs.length, 0)
  process.env.MAIL_PROVIDER = previousProvider
})

function createUserModel(existingUser = null) {
  const created = []
  return {
    created,
    findOne(filter) {
      if (filter.nickname) return query(() => null)
      return Promise.resolve(existingUser && existingUser.email === filter.email ? existingUser : null)
    },
    async create(data) {
      const user = { _id: 'new-user-id', ...data, async save() {} }
      created.push(user)
      return user
    },
  }
}

test('지정 관리자 이메일은 신규·기존 사용자 모두 서버에서 master로 보정한다', async () => {
  assert.equal(isTemporaryAdminEmail('  NORMAL-ADMIN@EXAMPLE.COM '), true)
  assert.equal(isReviewLoginEmail('normal-admin@example.com'), false)
  assert.equal(getReviewLoginCode('normal-admin@example.com'), null)
  assert.equal(isTemporaryAdminEmail('  FIXED-USER@EXAMPLE.COM '), false)
  assert.equal(isTemporaryAdminEmail('  FIXED-ADMIN@EXAMPLE.COM '), true)
  assert.equal(getForcedAccountRole('fixed-admin@example.com'), 'master')
  assert.equal(getForcedAccountRole('test01@example.com'), 'user')

  const newUsers = createUserModel()
  const created = await findOrCreateUserByEmail(' NORMAL-ADMIN@EXAMPLE.COM ', { UserModel: newUsers })
  assert.equal(created.user.email, 'normal-admin@example.com')
  assert.equal(created.user.role, 'master')

  let saves = 0
  const existingUser = {
    _id: 'existing-admin-id',
    email: 'normal-admin@example.com',
    emailVerifiedAt: new Date(),
    role: 'user',
    async save() { saves += 1 },
  }
  const existing = await findOrCreateUserByEmail('normal-admin@example.com', {
    UserModel: createUserModel(existingUser),
  })
  assert.equal(existing.user.role, 'master')
  assert.equal(saves, 1)

  const testMasterUsers = createUserModel()
  const testMaster = await findOrCreateUserByEmail(' FIXED-ADMIN@EXAMPLE.COM ', { UserModel: testMasterUsers })
  assert.equal(testMaster.user.email, 'fixed-admin@example.com')
  assert.equal(testMaster.user.role, 'master')
})

test('스토어 심사용 일반 계정은 신규·기존 사용자 모두 서버에서 user로 보정한다', async () => {
  assert.equal(isTemporaryAdminEmail('fixed-user@example.com'), false)
  assert.equal(getForcedAccountRole(' FIXED-USER@EXAMPLE.COM '), 'user')

  const newUsers = createUserModel()
  const created = await findOrCreateUserByEmail(' FIXED-USER@EXAMPLE.COM ', { UserModel: newUsers })
  assert.equal(created.user.email, 'fixed-user@example.com')
  assert.equal(created.user.role, 'user')

  let saves = 0
  const existingUser = {
    _id: 'existing-review-user-id',
    email: 'fixed-user@example.com',
    emailVerifiedAt: new Date(),
    role: 'master',
    async save() { saves += 1 },
  }
  const existing = await findOrCreateUserByEmail('fixed-user@example.com', {
    UserModel: createUserModel(existingUser),
  })
  assert.equal(existing.user.role, 'user')
  assert.equal(saves, 1)
})

test('환경변수의 계정 정책을 수정하면 다시 시작하지 않은 테스트에서도 최신 값을 읽는다', () => {
  const previousCodes = process.env.EMAIL_FIXED_LOGIN_ACCOUNTS
  const previousRoles = process.env.EMAIL_ACCOUNT_ROLE_OVERRIDES
  try {
    process.env.EMAIL_FIXED_LOGIN_ACCOUNTS = 'changed@example.com:654321'
    process.env.EMAIL_ACCOUNT_ROLE_OVERRIDES = 'changed@example.com:master'
    assert.equal(getReviewLoginCode('changed@example.com'), '654321')
    assert.equal(getReviewLoginCode('fixed-admin@example.com'), null)
    assert.equal(getForcedAccountRole('changed@example.com'), 'master')
  } finally {
    process.env.EMAIL_FIXED_LOGIN_ACCOUNTS = previousCodes
    process.env.EMAIL_ACCOUNT_ROLE_OVERRIDES = previousRoles
  }
})

test('스피드 매칭 시간 예외는 test와 test1~test4 계정에만 적용한다', () => {
  for (const email of [
    'test@tazocode.com',
    'test1@tazocode.com',
    'test2@tazocode.com',
    'test3@tazocode.com',
    'test4@tazocode.com',
  ]) {
    assert.equal(isSpeedMatchingTestEmail(email), true)
  }
  assert.equal(isSpeedMatchingTestEmail(' TEST4@TAZOCODE.COM '), true)
  assert.equal(isSpeedMatchingTestEmail('test5@tazocode.com'), false)
  assert.equal(isSpeedMatchingTestEmail('normal@tazocode.com'), false)
})

test('일반 이메일 신규 사용자는 클라이언트 입력과 무관하게 user이며 기존 서버 master는 강등하지 않는다', async () => {
  const normalUsers = createUserModel()
  const created = await findOrCreateUserByEmail('normal@example.com', { UserModel: normalUsers })
  assert.equal(created.user.role, 'user')

  const legitimateMaster = {
    _id: 'existing-master-id',
    email: 'owner@example.com',
    emailVerifiedAt: new Date(),
    role: 'master',
    async save() { assert.fail('변경이 없으므로 저장하지 않아야 합니다.') },
  }
  const existing = await findOrCreateUserByEmail('owner@example.com', {
    UserModel: createUserModel(legitimateMaster),
  })
  assert.equal(existing.user.role, 'master')
})

test('기존 이메일은 새 계정을 만들지 않고 같은 사용자 ID로 로그인 대상을 찾는다', async () => {
  const existingUser = {
    _id: 'existing-user-id',
    email: 'existing@example.com',
    emailVerifiedAt: new Date(),
    role: 'user',
    async save() { assert.fail('변경이 없으므로 저장하지 않아야 합니다.') },
  }
  const users = createUserModel(existingUser)
  const result = await findOrCreateUserByEmail(' EXISTING@example.com ', { UserModel: users })
  assert.equal(result.isNewUser, false)
  assert.equal(String(result.user._id), 'existing-user-id')
  assert.equal(users.created.length, 0)
})

test('이메일 정규화는 trim과 lowercase만 적용한다', () => {
  assert.equal(normalizeEmail('  User+Tag@Example.COM  '), 'user+tag@example.com')
})
