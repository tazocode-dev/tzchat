require('module-alias/register')
process.env.JWT_SECRET ||= 'onboarding-test-secret'
process.env.SESSION_SECRET ||= 'onboarding-test-session-secret'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  calculateAge,
  hasAdultAgeInformation,
  isProfileOnboardingComplete,
  parseBirthDate,
  parseBirthYear,
  saveBirthDate,
  saveBirthYear,
  saveGender,
} = require('../src/services/onboardingService')
const { createRequireCompletedOnboarding } = require('../src/middlewares/requireCompletedOnboarding')

function userModelFor(user) {
  return {
    findById() {
      return {
        select() {
          return Promise.resolve(user)
        },
      }
    },
  }
}

test('생년월일은 실제 존재하는 YYYY-MM-DD만 허용한다', () => {
  assert.equal(parseBirthDate('2000-02-29').year, 2000)
  assert.throws(() => parseBirthDate('2001-02-29'), (error) => error.code === 'INVALID_BIRTH_DATE')
  assert.throws(() => parseBirthDate('2000'), (error) => error.code === 'INVALID_BIRTH_DATE')
})

test('만 19세는 생일을 기준으로 계산한다', () => {
  assert.equal(calculateAge({ year: 2007, month: 7, day: 29 }, { year: 2026, month: 7, day: 29 }), 19)
  assert.equal(calculateAge({ year: 2007, month: 7, day: 30 }, { year: 2026, month: 7, day: 29 }), 18)
})

test('출생연도는 4자리 연도만 허용한다', () => {
  assert.equal(parseBirthYear('2000'), 2000)
  assert.equal(parseBirthYear(1995), 1995)
  assert.throws(() => parseBirthYear('95'), (error) => error.code === 'INVALID_BIRTH_YEAR')
  assert.throws(() => parseBirthYear('abcd'), (error) => error.code === 'INVALID_BIRTH_YEAR')
})

test('출생연도만 저장하고 재입력을 막는다', async () => {
  let saves = 0
  const user = {
    role: 'user',
    birthDate: null,
    birthyear: null,
    gender: '',
    profileOnboardingCompletedAt: null,
    async save() { saves += 1 },
  }
  const UserModel = userModelFor(user)

  const result = await saveBirthYear('user-1', 2007, {
    UserModel,
    now: new Date('2026-07-29T03:00:00.000Z'),
  })

  assert.equal(result.nextStep, 'gender')
  assert.equal(result.hasBirthYear, true)
  assert.equal(user.birthyear, 2007)
  assert.equal(user.birthDate, null)
  assert.equal(saves, 1)
  await assert.rejects(
    saveBirthYear('user-1', 2000, { UserModel }),
    (error) => error.code === 'BIRTH_YEAR_LOCKED',
  )
})

test('출생연도 기준 19세 미만은 저장하지 않는다', async () => {
  let saves = 0
  const user = {
    role: 'user',
    birthDate: null,
    birthyear: null,
    gender: '',
    async save() { saves += 1 },
  }

  await assert.rejects(
    saveBirthYear('user-1', 2008, {
      UserModel: userModelFor(user),
      now: new Date('2026-07-29T03:00:00.000Z'),
    }),
    (error) => error.code === 'UNDERAGE_NOT_ALLOWED',
  )
  assert.equal(saves, 0)
  assert.equal(user.birthyear, null)
})

test('완료 판정은 저장값 존재가 아니라 현재 유효한 성인 나이 정보를 요구한다', () => {
  const now = new Date('2026-08-15T03:00:00.000Z')
  assert.equal(hasAdultAgeInformation({ birthyear: 2007, birthDate: null }, now), true)
  assert.equal(hasAdultAgeInformation({ birthyear: 2008, birthDate: null }, now), false)
  assert.equal(hasAdultAgeInformation({ birthyear: 3000, birthDate: null }, now), false)
  assert.equal(hasAdultAgeInformation({ birthyear: null, birthDate: '2007-08-15' }, now), true)
  assert.equal(hasAdultAgeInformation({ birthyear: null, birthDate: '2007-08-16' }, now), false)
  assert.equal(isProfileOnboardingComplete({ role: 'user', birthyear: 2008, gender: 'woman' }, now), false)
})

test('만 19세 이상의 생년월일은 birthyear와 함께 저장하고 재입력을 막는다', async () => {
  let saves = 0
  const user = {
    role: 'user',
    birthDate: null,
    birthyear: null,
    gender: '',
    profileOnboardingCompletedAt: null,
    async save() { saves += 1 },
  }
  const UserModel = userModelFor(user)

  const result = await saveBirthDate('user-1', '2007-07-29', {
    UserModel,
    now: new Date('2026-07-29T03:00:00.000Z'),
  })

  assert.equal(result.nextStep, 'gender')
  assert.equal(user.birthyear, 2007)
  assert.equal(saves, 1)
  await assert.rejects(
    saveBirthDate('user-1', '2000-01-01', { UserModel }),
    (error) => error.code === 'BIRTH_DATE_LOCKED',
  )
})

test('만 19세 미만은 저장하지 않는다', async () => {
  let saves = 0
  const user = {
    role: 'user',
    birthDate: null,
    birthyear: null,
    gender: '',
    async save() { saves += 1 },
  }

  await assert.rejects(
    saveBirthDate('user-1', '2007-07-30', {
      UserModel: userModelFor(user),
      now: new Date('2026-07-29T03:00:00.000Z'),
    }),
    (error) => error.code === 'UNDERAGE_NOT_ALLOWED',
  )
  assert.equal(saves, 0)
  assert.equal(user.birthDate, null)
})

test('성별은 출생연도 저장 후에만 저장하고 온보딩을 완료한다', async () => {
  const incomplete = {
    role: 'user',
    birthDate: null,
    birthyear: null,
    gender: '',
    async save() {},
  }
  await assert.rejects(
    saveGender('user-1', 'woman', { UserModel: userModelFor(incomplete) }),
    (error) => error.code === 'BIRTH_YEAR_REQUIRED',
  )

  const user = {
    role: 'user',
    birthDate: null,
    birthyear: 2000,
    gender: '',
    profileOnboardingCompletedAt: null,
    async save() {},
  }
  const result = await saveGender('user-1', 'female', { UserModel: userModelFor(user) })
  assert.equal(user.gender, 'woman')
  assert.ok(user.profileOnboardingCompletedAt instanceof Date)
  assert.equal(result.complete, true)
})

test('메인 API 게이트는 필수 약관을 먼저 확인하고 미동의 계정을 403으로 차단한다', async () => {
  let nextCalls = 0
  let response = null
  const res = {
    status(status) {
      return {
        json(body) {
          response = { status, body }
          return response
        },
      }
    },
  }

  const middleware = createRequireCompletedOnboarding({
    getRequireConsent: async () => ({ needReconsent: true, requiredSlugs: ['terms'] }),
  })

  await middleware(
    { user: { _id: 'user-1', role: 'user', birthDate: null, birthyear: null, gender: '' } },
    res,
    () => { nextCalls += 1 },
  )

  assert.equal(nextCalls, 0)
  assert.equal(response.status, 403)
  assert.equal(response.body.code, 'AGREEMENTS_REQUIRED')
  assert.deepEqual(response.body.requiredSlugs, ['terms'])
})

test('메인 API 게이트는 약관 완료 후 프로필 온보딩 미완료 계정을 차단한다', async () => {
  let response = null
  const middleware = createRequireCompletedOnboarding({
    getRequireConsent: async () => ({ needReconsent: false, requiredSlugs: [] }),
  })
  const res = {
    status(status) {
      return { json(body) { response = { status, body }; return response } }
    },
  }

  await middleware(
    { user: { _id: 'user-1', role: 'user', birthDate: null, birthyear: 3000, gender: 'woman' } },
    res,
    () => assert.fail('미완료 계정을 통과시키면 안 됩니다.'),
  )

  assert.equal(response.status, 403)
  assert.equal(response.body.code, 'ONBOARDING_REQUIRED')
  assert.equal(response.body.onboarding.nextStep, 'birthDate')
})

test('메인 API 게이트는 필수 약관 설정 누락을 완료로 오인하지 않고 503으로 차단한다', async () => {
  let response = null
  const error = Object.assign(new Error('필수 약관 메타데이터가 설정되지 않았습니다: terms'), {
    code: 'TERMS_CONFIGURATION_ERROR',
    details: { missingRequiredSlugs: ['terms'] },
  })
  const middleware = createRequireCompletedOnboarding({
    getRequireConsent: async () => { throw error },
  })
  const res = {
    status(status) {
      return { json(body) { response = { status, body }; return response } }
    },
  }

  await middleware(
    { user: { _id: 'user-1', role: 'user', birthyear: 2000, gender: 'woman' } },
    res,
    () => assert.fail('설정 오류 상태에서 메인 API를 통과시키면 안 됩니다.'),
  )

  assert.equal(response.status, 503)
  assert.equal(response.body.code, 'TERMS_CONFIGURATION_ERROR')
  assert.deepEqual(response.body.missingRequiredSlugs, ['terms'])
})

test('메인 API 게이트는 필수 약관·온보딩 완료 계정과 master를 통과시킨다', async () => {
  let nextCalls = 0
  const next = () => { nextCalls += 1 }
  const res = { status: () => ({ json: () => assert.fail('차단하면 안 됩니다.') }) }
  let consentChecks = 0
  const middleware = createRequireCompletedOnboarding({
    getRequireConsent: async () => {
      consentChecks += 1
      return { needReconsent: false, requiredSlugs: [] }
    },
  })

  await middleware(
    { user: { _id: 'user-1', role: 'user', birthDate: null, birthyear: 2000, gender: 'woman' } },
    res,
    next,
  )
  await middleware(
    { user: { role: 'master', birthDate: null, gender: '' } },
    res,
    next,
  )

  assert.equal(nextCalls, 2)
  assert.equal(consentChecks, 1)
})
