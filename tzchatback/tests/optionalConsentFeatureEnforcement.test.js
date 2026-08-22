require('module-alias/register')

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { saveContactHashes } = require('../src/services/search/contactsService')
const { updatePreference } = require('../src/services/userProfileService')
const { updateSearchPreference, updateSearchToggles } = require('../src/services/search/searchSettingsService')
const { User } = require('../src/models')

const VALID_CONTACT_HASH = 'a'.repeat(64)

function consentDependencies(optedIn) {
  return {
    TermsModel: {
      findOne: () => ({ select: () => ({ lean: async () => ({ slug: 'contacts-consent', version: 'v1' }) }) }),
    },
    UserAgreementModel: {
      findOne: () => ({ select: () => ({ lean: async () => optedIn ? { _id: 'agreement-1' } : null }) }),
    },
  }
}

function userModelReturning(user, writes) {
  return {
    findByIdAndUpdate(userId, update) {
      writes.push({ userId, update })
      return {
        then(resolve) { return resolve(user) },
        select() {
          return { lean: async () => user, then: (resolve) => resolve(user) }
        },
      }
    },
  }
}

test('현재 연락처 선택 동의가 없으면 해시를 저장하지 않고 표준 403 오류를 반환한다', async () => {
  const writes = []
  const dependencies = {
    ...consentDependencies(false),
    UserModel: userModelReturning({ _id: 'user-1', localContactHashes: [] }, writes),
  }

  await assert.rejects(
    saveContactHashes('user-1', [VALID_CONTACT_HASH], dependencies),
    error => error.status === 403 &&
      error.code === 'OPTIONAL_CONSENT_REQUIRED' &&
      error.details.slug === 'contacts-consent',
  )
  assert.equal(writes.length, 0)
})

test('현재 연락처 선택 동의가 있으면 해시 저장을 허용한다', async () => {
  const writes = []
  const dependencies = {
    ...consentDependencies(true),
    UserModel: userModelReturning({ _id: 'user-1', localContactHashes: [VALID_CONTACT_HASH] }, writes),
  }

  const result = await saveContactHashes('user-1', [VALID_CONTACT_HASH, VALID_CONTACT_HASH], dependencies)
  assert.equal(result.count, 1)
  assert.deepEqual(writes[0].update.$set.localContactHashes, [VALID_CONTACT_HASH])
})

test('지인 제외 ON은 현재 연락처 선택 동의를 요구하고 DB 쓰기 전에 거부한다', async () => {
  const writes = []
  const dependencies = {
    ...consentDependencies(false),
    UserModel: userModelReturning({ search_disconnectLocalContacts: 'ON' }, writes),
  }

  await assert.rejects(
    updateSearchToggles('user-1', { disconnectLocalContacts: 'ON' }, dependencies),
    error => error.status === 403 && error.code === 'OPTIONAL_CONSENT_REQUIRED',
  )
  assert.equal(writes.length, 0)
})

test('지인 제외 OFF는 선택 동의 없이도 허용하고 다른 토글 정책을 보존한다', async () => {
  const writes = []
  let consentChecks = 0
  const dependencies = {
    requireCurrentActiveOptIn: async () => { consentChecks += 1 },
    UserModel: userModelReturning({
      search_disconnectLocalContacts: 'OFF',
      search_allowFriendRequests: 'ON',
    }, writes),
  }

  const result = await updateSearchToggles('user-1', {
    disconnectLocalContacts: 'OFF',
    allowFriendRequests: 'ON',
  }, dependencies)

  assert.equal(consentChecks, 0)
  assert.equal(result.search_disconnectLocalContacts, 'OFF')
  assert.deepEqual(writes[0].update.$set, {
    search_disconnectLocalContacts: 'OFF',
    search_allowFriendRequests: 'ON',
  })
})

test('프로필 성향은 현재 민감정보 선택 동의 없이 DB에 쓰지 않는다', async () => {
  const writes = []
  const dependencies = {
    requireCurrentActiveOptIn: async (_userId, slug) => {
      const error = new Error('선택 동의 필요')
      error.status = 403
      error.code = 'OPTIONAL_CONSENT_REQUIRED'
      error.details = { slug }
      throw error
    },
    UserModel: userModelReturning({ preference: '이성친구 - 일반' }, writes),
  }

  await assert.rejects(
    updatePreference('user-1', '이성친구 - 일반', dependencies),
    error => error.status === 403 &&
      error.code === 'OPTIONAL_CONSENT_REQUIRED' &&
      error.details.slug === 'sensitive-information-consent',
  )
  assert.equal(writes.length, 0)
})

test('상대 검색 성향은 현재 민감정보 선택 동의 없이 DB에 쓰지 않는다', async () => {
  const writes = []
  const dependencies = {
    requireCurrentActiveOptIn: async (_userId, slug) => {
      const error = new Error('선택 동의 필요')
      error.status = 403
      error.code = 'OPTIONAL_CONSENT_REQUIRED'
      error.details = { slug }
      throw error
    },
    UserModel: userModelReturning({ search_preference: '동성친구 - 전체' }, writes),
  }

  await assert.rejects(
    updateSearchPreference('user-1', '동성친구 - 전체', dependencies),
    error => error.status === 403 && error.details.slug === 'sensitive-information-consent',
  )
  assert.equal(writes.length, 0)
})

test('현재 민감정보 선택 동의가 있으면 두 성향 수정을 허용한다', async () => {
  const profileWrites = []
  const searchWrites = []
  const checkedSlugs = []
  const requireCurrentActiveOptIn = async (_userId, slug) => { checkedSlugs.push(slug) }

  const profile = await updatePreference('user-1', '동성친구 - 특수', {
    requireCurrentActiveOptIn,
    UserModel: userModelReturning({ preference: '동성친구 - 특수', search_preference: '동성친구 - 전체' }, profileWrites),
  })
  const search = await updateSearchPreference('user-1', '이성친구 - 전체', {
    requireCurrentActiveOptIn,
    UserModel: userModelReturning({ search_preference: '이성친구 - 전체' }, searchWrites),
  })

  assert.deepEqual(checkedSlugs, ['sensitive-information-consent', 'sensitive-information-consent'])
  assert.equal(profile.preference, '동성친구 - 특수')
  assert.equal(search.search_preference, '이성친구 - 전체')
  assert.equal(profileWrites.length, 1)
  assert.equal(searchWrites.length, 1)
})

test('신규 User의 민감 성향 필드는 동의 전 빈 값이다', () => {
  const user = new User({ nickname: '테스트' })
  assert.equal(user.preference, '')
  assert.equal(user.search_preference, '')
})

test('두 성향 컨트롤러는 연락처와 같은 표준 403 동의 오류를 응답한다', () => {
  const profileController = fs.readFileSync(path.join(__dirname, '../src/controllers/userProfile.controller.js'), 'utf8')
  const searchController = fs.readFileSync(path.join(__dirname, '../src/controllers/search/searchSettings.controller.js'), 'utf8')
  const profileHandler = profileController.slice(profileController.indexOf('async function patchPreference'), profileController.indexOf('async function patchMarriage'))
  const searchHandler = searchController.slice(searchController.indexOf('async function patchPreference'), searchController.indexOf('async function patchSettings'))

  for (const handler of [profileHandler, searchHandler]) {
    assert.match(handler, /OPTIONAL_CONSENT_REQUIRED/)
    assert.match(handler, /status\(403\)/)
    assert.match(handler, /slug: err\.details\?\.slug/)
  }
})
