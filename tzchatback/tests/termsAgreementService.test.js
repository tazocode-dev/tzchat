require('module-alias/register')

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  REQUIRED_AGREEMENT_SLUGS,
  REQUIRED_POLICY_SLUGS,
  acceptAgreements,
  getAgreementsStatus,
  getRequireConsent,
  hasCurrentActiveOptIn,
  saveConsent,
} = require('../src/services/legal/termsPublicService')
const {
  AGREEMENT_METADATA,
  AGREEMENT_VERSION,
  LEGAL_PUBLIC_BASE_URL,
  seedAgreementMetadata,
} = require('../scripts/seedTerms')
const backendPackage = require('../package.json')

function queryResult(rows) {
  return {
    select() {
      return { lean: async () => rows }
    },
  }
}

function modelsFor(documents, agreements = []) {
  const writes = []
  const contactCleanups = []
  return {
    writes,
    contactCleanups,
    TermsModel: { find: () => queryResult(documents) },
    UserModel: {
      findByIdAndUpdate(userId, update) {
        contactCleanups.push({ userId, update })
        return { select: async () => ({ _id: userId }) }
      },
    },
    UserAgreementModel: {
      find: () => queryResult(agreements),
      async bulkWrite(operations) {
        writes.push(...operations)
        return { upsertedCount: operations.length, modifiedCount: 0, matchedCount: 0 }
      },
    },
  }
}

function activeDocuments() {
  return AGREEMENT_METADATA.map((item, index) => ({
    _id: `doc-${index + 1}`,
    slug: item.slug,
    title: item.title,
    version: item.version,
    kind: item.kind,
    isRequired: item.isRequired,
    defaultRequired: item.defaultRequired,
  }))
}

const request = { get: () => 'test-agent', ip: '127.0.0.1' }

test('초기화 메타데이터는 공개 문서 버전과 가입 필수·선택 정책을 고정한다', async () => {
  assert.equal(backendPackage.scripts['seed:terms'], 'node scripts/seedTerms.js')
  assert.equal(AGREEMENT_VERSION, '2026-08-13-01')
  assert.equal(AGREEMENT_METADATA.length, 6)
  assert.deepEqual(
    AGREEMENT_METADATA.filter(item => item.isRequired).map(item => item.slug),
    REQUIRED_AGREEMENT_SLUGS,
  )
  assert.deepEqual(
    AGREEMENT_METADATA.filter(item => !item.isRequired).map(item => item.slug),
    ['sensitive-information-consent', 'contacts-consent'],
  )
  assert.ok(AGREEMENT_METADATA.every(item => item.documentUrl.startsWith(LEGAL_PUBLIC_BASE_URL)))

  const updates = []
  const TermsModel = {
    async updateOne(filter, update, options) { updates.push({ filter, update, options }) },
    async updateMany() {},
  }
  await seedAgreementMetadata(TermsModel)
  await seedAgreementMetadata(TermsModel)
  assert.equal(updates.length, 12)
  assert.ok(updates.every(call => call.filter.version === AGREEMENT_VERSION && call.options.upsert === true))
})

test('필수 정책 메타데이터가 0개이거나 일부 누락되면 완료로 오인하지 않는다', async () => {
  for (const documents of [
    [],
    activeDocuments().filter(doc => doc.slug !== 'guidelines'),
    activeDocuments().filter(doc => doc.slug !== 'privacy-consent'),
  ]) {
    const models = modelsFor(documents)
    await assert.rejects(
      getAgreementsStatus('user-1', models),
      error => error.status === 503 &&
        error.code === 'TERMS_CONFIGURATION_ERROR' &&
        error.details.missingRequiredSlugs.length > 0,
    )
    await assert.rejects(
      getRequireConsent('user-1', models),
      error => error.status === 503 && error.code === 'TERMS_CONFIGURATION_ERROR',
    )
  }
})

test('배치 동의는 필수 항목 누락 payload를 쓰기 전에 거부한다', async () => {
  const models = modelsFor(activeDocuments())
  await assert.rejects(
    acceptAgreements({
      userId: 'user-1',
      slugsSelected: ['terms', 'guidelines'],
      req: request,
      route: '/api/terms/agreements/accept',
    }, models),
    error => error.status === 400 &&
      error.code === 'REQUIRED_AGREEMENTS_MISSING' &&
      error.details.missingRequiredSlugs.includes('youth-policy') &&
      error.details.missingRequiredSlugs.includes('privacy-consent'),
  )
  assert.equal(models.writes.length, 0)
})

test('배치 동의는 선택한 선택 항목은 true, 선택하지 않은 항목은 false로 함께 기록한다', async () => {
  const models = modelsFor(activeDocuments())
  const selected = [...REQUIRED_POLICY_SLUGS, 'privacy-consent', 'sensitive-information-consent']
  await acceptAgreements({
    userId: 'user-1',
    slugsSelected: selected,
    req: request,
    route: '/api/terms/agreements/accept',
  }, models)

  assert.equal(models.writes.length, AGREEMENT_METADATA.length)
  const optedInBySlug = Object.fromEntries(models.writes.map(operation => [
    operation.updateOne.filter.slug,
    operation.updateOne.update.$set.optedIn,
  ]))
  assert.equal(optedInBySlug['sensitive-information-consent'], true)
  assert.equal(optedInBySlug['contacts-consent'], false)
  assert.deepEqual(models.contactCleanups, [{
    userId: 'user-1',
    update: { $set: { localContactHashes: [], search_disconnectLocalContacts: 'OFF' } },
  }])
  assert.ok(REQUIRED_POLICY_SLUGS.every(slug => optedInBySlug[slug] === true))
  assert.equal(optedInBySlug['privacy-consent'], true)
})

test('배치에서 두 선택 동의를 모두 거부하면 연락처와 민감 성향을 모두 먼저 정리한다', async () => {
  const models = modelsFor(activeDocuments())
  await acceptAgreements({
    userId: 'user-1',
    slugsSelected: [...REQUIRED_POLICY_SLUGS, 'privacy-consent'],
    req: request,
    route: '/api/terms/agreements/accept',
  }, models)

  assert.deepEqual(models.contactCleanups, [{
    userId: 'user-1',
    update: { $set: {
      localContactHashes: [],
      search_disconnectLocalContacts: 'OFF',
      preference: '',
      search_preference: '',
    } },
  }])
  assert.equal(models.writes.length, AGREEMENT_METADATA.length)
})

test('배치 연락처·민감정보 정리가 실패하면 어떤 동의도 bulk 저장하지 않는다', async () => {
  const models = modelsFor(activeDocuments())
  let bulkCalls = 0
  models.UserModel.findByIdAndUpdate = () => ({
    select: async () => { throw new Error('cleanup failed') },
  })
  models.UserAgreementModel.bulkWrite = async () => { bulkCalls += 1 }

  await assert.rejects(
    acceptAgreements({
      userId: 'user-1',
      slugsSelected: [...REQUIRED_POLICY_SLUGS, 'privacy-consent'],
      req: request,
      route: '/api/terms/agreements/accept',
    }, models),
    /cleanup failed/,
  )
  assert.equal(bulkCalls, 0)
  assert.equal(models.writes.length, 0)
})

test('선택 동의 판정은 현재 활성 문서와 같은 버전의 optedIn true만 허용한다', async () => {
  let agreementFilter = null
  const TermsModel = {
    findOne: () => ({ select: () => ({ lean: async () => ({ slug: 'contacts-consent', version: 'v2' }) }) }),
  }
  const UserAgreementModel = {
    findOne(filter) {
      agreementFilter = filter
      return { select: () => ({ lean: async () => ({ _id: 'agreement-1' }) }) }
    },
  }

  assert.equal(await hasCurrentActiveOptIn('user-1', 'contacts-consent', { TermsModel, UserAgreementModel }), true)
  assert.deepEqual(agreementFilter, {
    userId: 'user-1',
    slug: 'contacts-consent',
    version: 'v2',
    optedIn: true,
  })

  UserAgreementModel.findOne = () => ({ select: () => ({ lean: async () => null }) })
  assert.equal(await hasCurrentActiveOptIn('user-1', 'contacts-consent', { TermsModel, UserAgreementModel }), false)
})

test('연락처 선택 동의 철회는 연락처 정리를 먼저 완료한 뒤 optedIn false를 저장한다', async () => {
  const order = []
  let cleanupUpdate = null
  let agreementUpdate = null
  const TermsModel = {
    findOne: () => ({ select: () => ({ lean: async () => ({
      _id: 'doc-contacts', slug: 'contacts-consent', title: '연락처 동의', version: 'v1', kind: 'consent',
    }) }) }),
  }
  const UserModel = {
    findByIdAndUpdate(_userId, update) {
      cleanupUpdate = update
      return { select: async () => { order.push('cleanup'); return { _id: 'user-1' } } }
    },
  }
  const UserAgreementModel = {
    async updateOne(_filter, update) { order.push('agreement'); agreementUpdate = update },
  }

  await saveConsent({
    userId: 'user-1', slug: 'contacts-consent', version: 'v1', optedIn: false, req: request,
  }, { TermsModel, UserModel, UserAgreementModel })

  assert.deepEqual(order, ['cleanup', 'agreement'])
  assert.deepEqual(cleanupUpdate.$set, { localContactHashes: [], search_disconnectLocalContacts: 'OFF' })
  assert.equal(agreementUpdate.$set.optedIn, false)
})

test('연락처 정리가 실패하면 선택 동의 철회를 저장하지 않는다', async () => {
  let agreementWrites = 0
  const TermsModel = {
    findOne: () => ({ select: () => ({ lean: async () => ({
      _id: 'doc-contacts', slug: 'contacts-consent', title: '연락처 동의', version: 'v1', kind: 'consent',
    }) }) }),
  }
  const UserModel = {
    findByIdAndUpdate: () => ({ select: async () => { throw new Error('cleanup failed') } }),
  }
  const UserAgreementModel = {
    async updateOne() { agreementWrites += 1 },
  }

  await assert.rejects(
    saveConsent({
      userId: 'user-1', slug: 'contacts-consent', version: 'v1', optedIn: false, req: request,
    }, { TermsModel, UserModel, UserAgreementModel }),
    /cleanup failed/,
  )
  assert.equal(agreementWrites, 0)
})

test('민감정보 선택 동의 철회는 두 성향 필드를 먼저 정리한 뒤 false를 저장한다', async () => {
  const order = []
  let cleanupUpdate = null
  let agreementUpdate = null
  const TermsModel = {
    findOne: () => ({ select: () => ({ lean: async () => ({
      _id: 'doc-sensitive', slug: 'sensitive-information-consent', title: '민감정보 동의', version: 'v1', kind: 'consent',
    }) }) }),
  }
  const UserModel = {
    findByIdAndUpdate(_userId, update) {
      cleanupUpdate = update
      return { select: async () => { order.push('cleanup'); return { _id: 'user-1' } } }
    },
  }
  const UserAgreementModel = {
    async updateOne(_filter, update) { order.push('agreement'); agreementUpdate = update },
  }

  await saveConsent({
    userId: 'user-1', slug: 'sensitive-information-consent', version: 'v1', optedIn: false, req: request,
  }, { TermsModel, UserModel, UserAgreementModel })

  assert.deepEqual(order, ['cleanup', 'agreement'])
  assert.deepEqual(cleanupUpdate.$set, { preference: '', search_preference: '' })
  assert.equal(agreementUpdate.$set.optedIn, false)
})

test('민감 성향 정리가 실패하면 선택 동의 철회를 저장하지 않는다', async () => {
  let agreementWrites = 0
  const TermsModel = {
    findOne: () => ({ select: () => ({ lean: async () => ({
      _id: 'doc-sensitive', slug: 'sensitive-information-consent', title: '민감정보 동의', version: 'v1', kind: 'consent',
    }) }) }),
  }
  const UserModel = {
    findByIdAndUpdate: () => ({ select: async () => { throw new Error('cleanup failed') } }),
  }
  const UserAgreementModel = {
    async updateOne() { agreementWrites += 1 },
  }

  await assert.rejects(
    saveConsent({
      userId: 'user-1', slug: 'sensitive-information-consent', version: 'v1', optedIn: false, req: request,
    }, { TermsModel, UserModel, UserAgreementModel }),
    /cleanup failed/,
  )
  assert.equal(agreementWrites, 0)
})
