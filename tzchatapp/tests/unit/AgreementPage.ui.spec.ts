import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

const mocks = vi.hoisted(() => ({
  getAgreementStatus: vi.fn(),
  acceptAgreements: vi.fn(),
  fetchMe: vi.fn(),
  user: { _id: 'account-default' },
}))

vi.mock('@/shared/services/api', () => ({
  getAgreementStatus: mocks.getAgreementStatus,
  acceptAgreements: mocks.acceptAgreements,
}))

vi.mock('@/shared/stores/user', () => ({
  useUserStore: () => ({ user: mocks.user, fetchMe: mocks.fetchMe }),
}))

import AgreementPage from '@/features/legal/AgreementPage.vue'

const pending = [
  { slug: 'terms', title: '', isRequired: true },
  { slug: 'guidelines', isRequired: true },
  { slug: 'youth-policy', title: '잘못된 서버 제목', isRequired: true },
  { slug: 'privacy-consent', title: '', isRequired: true },
  { slug: 'sensitive-information-consent', title: '', isRequired: false },
  { slug: 'contacts-consent', title: '', isRequired: false },
]

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/legal/consent', name: 'AgreementPagePublic', component: AgreementPage },
      { path: '/legals/v2/:slug', name: 'LegalPageV2Public', component: { template: '<div>법적 문서</div>' } },
      { path: '/onboarding', component: { template: '<div>온보딩</div>' } },
      { path: '/home/6page', component: { template: '<div>홈</div>' } },
    ],
  })
}

describe('AgreementPage 약관 목록', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.user = { _id: 'account-default' }
    mocks.getAgreementStatus.mockResolvedValue({ data: { pending } })
    mocks.acceptAgreements.mockResolvedValue({ ok: true })
    mocks.fetchMe.mockResolvedValue({ _id: 'user-1' })
  })

  test('실제 4필수·2선택 항목을 표시하고 필수 선택·문서 복귀 상태를 유지한다', async () => {
    mocks.user = { _id: 'same-account' }
    const router = createTestRouter()
    await router.push('/legal/consent?return=/home/6page')
    await router.isReady()

    let wrapper = mount(AgreementPage, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('서비스 이용을 위해')
    expect(wrapper.text()).toContain('아래 항목에 동의해 주세요')
    expect(wrapper.text()).toContain('모두 동의하기')
    expect(wrapper.findAll('.item')).toHaveLength(6)
    expect(wrapper.findAll('.badge.required')).toHaveLength(4)
    expect(wrapper.findAll('.badge.optional')).toHaveLength(2)

    const titles = wrapper.findAll('.item-title').map(item => item.text())
    expect(titles).toEqual([
      '서비스 이용약관',
      '커뮤니티 안전 가이드',
      '아동 안전 기준',
      '개인정보 수집·이용 안내/동의',
      '민감정보 선택 동의',
      '연락처 지인 제외 선택 안내',
    ])
    expect(wrapper.findAll('.item-summary')).toHaveLength(6)
    for (const item of wrapper.findAll('.item')) {
      const content = item.get('.item-content')
      const heading = content.get('.item-heading')
      expect(heading.element.children[0]?.classList.contains('badge')).toBe(true)
      expect(heading.element.children[1]?.classList.contains('item-title')).toBe(true)
      expect(heading.element.children[2]?.classList.contains('view')).toBe(true)
      expect(content.element.children[1]?.classList.contains('item-summary')).toBe(true)
    }

    const all = wrapper.get<HTMLInputElement>('input[aria-label="모두 동의하기"]')
    const allCard = wrapper.get('.card-all')
    const allControl = allCard.get('.all-check-control')
    expect(allCard.element.children[0]).toBe(allControl.element)
    expect(allControl.get('input').attributes('id')).toBe('agreement-all')
    expect(allCard.element.children[1]?.classList.contains('all-label')).toBe(true)

    await allCard.trigger('click')
    expect(wrapper.findAll<HTMLInputElement>('input.chk').every(input => input.element.checked)).toBe(true)
    await allCard.trigger('click')
    expect(wrapper.findAll<HTMLInputElement>('input.chk').every(input => !input.element.checked)).toBe(true)

    await all.setValue(true)
    expect(all.element.checked).toBe(true)
    expect(wrapper.findAll<HTMLInputElement>('input.chk').every(input => input.element.checked)).toBe(true)
    await all.setValue(false)

    const itemChecks = wrapper.findAll<HTMLInputElement>('.item input.chk')
    await itemChecks[0].setValue(true)
    await itemChecks[1].setValue(true)
    await itemChecks[2].setValue(true)
    await itemChecks[3].setValue(true)
    const submit = wrapper.get('ion-button')
    expect(submit.attributes('disabled')).toBeUndefined()
    expect(itemChecks[4].element.checked).toBe(false)
    expect(itemChecks[5].element.checked).toBe(false)

    const detailButtons = wrapper.findAll<HTMLButtonElement>('.view')
    expect(detailButtons).toHaveLength(6)
    expect(detailButtons.every(button => !button.element.disabled)).toBe(true)
    await detailButtons[0].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value).toMatchObject({
      name: 'LegalPageV2Public',
      params: { slug: 'terms' },
      query: { return: '/home/6page' },
    })

    wrapper.unmount()
    router.back()
    await flushPromises()
    wrapper = mount(AgreementPage, { global: { plugins: [router] } })
    await flushPromises()

    const restored = wrapper.findAll<HTMLInputElement>('.item input.chk')
    expect(restored.slice(0, 4).every(input => input.element.checked)).toBe(true)
    expect(restored.slice(4).every(input => !input.element.checked)).toBe(true)
    wrapper.unmount()
  })

  test('미등록 slug는 안전한 fallback 제목을 표시하고 빈 문서 화면으로 이동시키지 않는다', async () => {
    mocks.user = { _id: 'fallback-account' }
    mocks.getAgreementStatus.mockResolvedValueOnce({
      data: { pending: [{ slug: 'future-safety-consent', title: '', isRequired: false }] },
    })
    const router = createTestRouter()
    await router.push('/legal/consent?return=/home/6page')
    await router.isReady()

    const wrapper = mount(AgreementPage, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.get('.item-title').text()).toBe('Future Safety Consent')
    expect(wrapper.text()).toContain('연결된 공개 문서가 없습니다.')
    expect(wrapper.get<HTMLButtonElement>('.view').element.disabled).toBe(true)
    wrapper.unmount()
  })

  test('다른 계정으로 바뀌면 이전 계정의 선택 초안을 복원하지 않는다', async () => {
    mocks.user = { _id: 'account-a' }
    const router = createTestRouter()
    await router.push('/legal/consent?return=/home/6page')
    await router.isReady()

    let wrapper = mount(AgreementPage, { global: { plugins: [router] } })
    await flushPromises()

    const itemChecks = wrapper.findAll<HTMLInputElement>('.item input.chk')
    await itemChecks[0].setValue(true)
    await wrapper.findAll<HTMLButtonElement>('.view')[0].trigger('click')
    await flushPromises()

    mocks.user = { _id: 'account-b' }
    wrapper.unmount()
    router.back()
    await flushPromises()
    wrapper = mount(AgreementPage, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.findAll<HTMLInputElement>('.item input.chk').every(input => !input.element.checked)).toBe(true)
    wrapper.unmount()
  })

  test('필수 약관 저장 후 최신 상태를 확인하고 지정된 온보딩 경로로 진행한다', async () => {
    mocks.user = { _id: 'submit-account' }
    mocks.getAgreementStatus
      .mockResolvedValueOnce({ data: { pending } })
      .mockResolvedValueOnce({ data: { pending: [] } })
    const router = createTestRouter()
    await router.push('/legal/consent?return=/onboarding')
    await router.isReady()

    const wrapper = mount(AgreementPage, { global: { plugins: [router] } })
    await flushPromises()
    const itemChecks = wrapper.findAll<HTMLInputElement>('.item input.chk')
    await itemChecks[0].setValue(true)
    await itemChecks[1].setValue(true)
    await itemChecks[2].setValue(true)
    await itemChecks[3].setValue(true)
    expect(itemChecks[4].element.checked).toBe(false)
    expect(itemChecks[5].element.checked).toBe(false)
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(mocks.acceptAgreements).toHaveBeenCalledWith([
      'terms',
      'guidelines',
      'youth-policy',
      'privacy-consent',
    ])
    expect(mocks.getAgreementStatus).toHaveBeenLastCalledWith({ force: true })
    expect(mocks.fetchMe).toHaveBeenCalledWith({ force: true, silent: true })
    expect(router.currentRoute.value.path).toBe('/onboarding')
    wrapper.unmount()
  })
})
