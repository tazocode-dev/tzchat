import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, test, vi } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createPinia } from 'pinia'
import i18n from '@/i18n'
import LoginPage from '@/features/auth/pages/LoginPage.vue'
import { auth as AuthAPI } from '@/shared/services/api'

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: LoginPage },
    { path: '/home/6page', component: { template: '<div />' } },
  ],
})

describe('LoginPage.vue i18n', () => {
  test('renders Korean strings from i18n keys, not raw key paths', async () => {
    await router.push('/')
    await router.isReady()
    const wrapper = mount(LoginPage, {
      global: { plugins: [createPinia(), i18n, router] },
    })
    const text = wrapper.text()
    expect(text).toContain('손끝')
    expect(text).toContain('로그인')
    expect(text).toContain('전화번호')
    expect(text).toContain('인증번호 받기')
    expect(text).not.toContain('좋은 인연')
    expect(text).not.toContain('편안한 대화')
    // 키가 깨졌을 때 vue-i18n이 그대로 노출하는 원시 키 경로가 화면에 남아있으면 안 된다
    expect(text).not.toMatch(/login\.\w+/)
  })

  test('로그인 하단에서 전화번호 변경 인증 화면으로 진입한다', async () => {
    await router.push('/')
    await router.isReady()
    const wrapper = mount(LoginPage, {
      global: { plugins: [createPinia(), i18n, router] },
    })

    const entry = wrapper.get('.phone-change-entry')
    expect(entry.text()).toBe('전화번호 변경 인증')
    await entry.trigger('click')

    expect(wrapper.get('#current-phone').exists()).toBe(true)
    expect(wrapper.get('#current-email').exists()).toBe(true)
    expect(wrapper.get('#new-phone').exists()).toBe(true)
    expect(wrapper.text()).toContain('이메일과 새 전화번호 인증을 모두 완료해야 변경됩니다.')
    const smsButton = wrapper.get('#new-phone').element.parentElement?.querySelector('button') as HTMLButtonElement
    expect(smsButton.disabled).toBe(true)

    const requestEmail = vi.spyOn(AuthAPI, 'requestPublicPhoneChangeEmail').mockResolvedValue({ data: { ok: true } } as any)
    await wrapper.get('#current-phone').setValue('01011111111')
    await wrapper.get('#current-email').setValue('user@example.com')
    const emailButton = wrapper.get('#current-email').element.parentElement?.querySelector('button') as HTMLButtonElement
    expect(emailButton.disabled).toBe(false)
    emailButton.click()
    await flushPromises()

    await wrapper.get('#recovery-email-code').setValue('123456')
    await wrapper.get('#new-phone').setValue('01022222222')
    expect(smsButton.disabled).toBe(false)
    requestEmail.mockRestore()
  })
})
