import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

const apiMocks = vi.hoisted(() => ({
  status: vi.fn(),
  saveBirthYear: vi.fn(),
  saveGender: vi.fn(),
  fetchMe: vi.fn(),
}))

vi.mock('@/shared/services/api', () => ({
  auth: { logout: vi.fn() },
  onboarding: { status: apiMocks.status, saveBirthYear: apiMocks.saveBirthYear, saveGender: apiMocks.saveGender },
}))

vi.mock('@/shared/stores/user', () => ({
  useUserStore: () => ({ fetchMe: apiMocks.fetchMe, clear: vi.fn() }),
}))

import OnboardingPage from '@/features/auth/pages/OnboardingPage.vue'

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/onboarding', component: OnboardingPage },
      { path: '/home/6page', component: { template: '<div />' } },
      { path: '/login', component: { template: '<div />' } },
    ],
  })
}

describe('OnboardingPage 출생연도 확인', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.status.mockResolvedValue({
      complete: false,
      nextStep: 'birthDate',
      hasBirthYear: false,
      hasBirthDate: false,
      hasGender: false,
      birthyear: null,
      gender: null,
    })
    apiMocks.saveBirthYear.mockResolvedValue({
      complete: false,
      nextStep: 'gender',
      hasBirthYear: true,
      hasBirthDate: true,
      hasGender: false,
      birthyear: 1990,
      gender: null,
    })
    apiMocks.saveGender.mockResolvedValue({
      complete: true,
      nextStep: 'complete',
      hasBirthYear: true,
      hasBirthDate: true,
      hasGender: true,
      birthyear: 1990,
      gender: 'woman',
    })
    apiMocks.fetchMe.mockResolvedValue({ _id: 'user-1' })
  })

  test('생년월일 대신 출생연도를 받고 화면 내부 확인 모달을 표시한다', async () => {
    const router = createTestRouter()
    await router.push('/onboarding')
    await router.isReady()

    const wrapper = mount(OnboardingPage, { global: { plugins: [router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('출생연도를 입력해 주세요')
    expect(wrapper.find('input[type="date"]').exists()).toBe(false)

    await wrapper.get('#birth-year').setValue('1990')
    await wrapper.get('form').trigger('submit')

    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog?.textContent).toContain('1990년생이 맞습니까?')
    expect(apiMocks.saveBirthYear).not.toHaveBeenCalled()

    const confirmButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.confirm-actions button'))
      .find((button) => button.textContent?.includes('맞습니다'))
    confirmButton?.click()
    await flushPromises()

    expect(apiMocks.saveBirthYear).toHaveBeenCalledWith(1990)
    wrapper.unmount()
  })

  test('성별 저장 성공 직후 서버 사용자 상태를 강제 갱신하고 메인으로 이동한다', async () => {
    apiMocks.status.mockResolvedValueOnce({
      complete: false,
      nextStep: 'gender',
      hasBirthYear: true,
      hasBirthDate: true,
      hasGender: false,
      birthyear: 1990,
      gender: null,
    })
    const router = createTestRouter()
    await router.push('/onboarding')
    await router.isReady()

    const wrapper = mount(OnboardingPage, { global: { plugins: [router] } })
    await flushPromises()
    const woman = wrapper.findAll('.gender-option').find((button) => button.text().includes('여성'))
    await woman?.trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(apiMocks.saveGender).toHaveBeenCalledWith('woman')
    expect(apiMocks.fetchMe).toHaveBeenCalledWith({ force: true, silent: true })
    expect(router.currentRoute.value.path).toBe('/home/6page')
    wrapper.unmount()
  })
})
