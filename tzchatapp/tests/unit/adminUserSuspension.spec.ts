// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  alertCreate: vi.fn(),
  toastCreate: vi.fn(),
  alertPresent: vi.fn(),
  toastPresent: vi.fn(),
  onDidDismiss: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
}))

vi.mock('@/shared/services/api', () => ({
  default: { get: mocks.get, patch: mocks.patch },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push, back: mocks.back, replace: mocks.replace }),
}))

vi.mock('@ionic/vue', () => ({
  IonIcon: { template: '<span class="ion-icon-stub" />' },
  alertController: { create: mocks.alertCreate },
  toastController: { create: mocks.toastCreate },
}))

import AdminMembers from '@/features/admin/pages/AdminMembersPage.vue'
import dashboardSource from '@/features/admin/pages/AdminDashboardPage.vue?raw'

const USER_ID = '64b000000000000000000002'
const MASTER_ID = '64b000000000000000000003'

function listResponse(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      users: [
        { _id: USER_ID, nickname: '일반회원', role: 'user', suspended: false, ...overrides },
        { _id: MASTER_ID, nickname: '관리자', role: 'master', suspended: false },
      ],
      page: 1,
      pages: 1,
      total: 2,
    },
  }
}

describe('관리자 회원 정지 UI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockResolvedValue(listResponse())
    mocks.alertPresent.mockResolvedValue(undefined)
    mocks.toastPresent.mockResolvedValue(undefined)
    mocks.onDidDismiss.mockResolvedValue({ role: 'confirm', data: { values: { reason: '반복적인 괴롭힘' } } })
    mocks.alertCreate.mockResolvedValue({ present: mocks.alertPresent, onDidDismiss: mocks.onDidDismiss })
    mocks.toastCreate.mockResolvedValue({ present: mocks.toastPresent })
    mocks.patch.mockResolvedValue({
      data: {
        user: {
          _id: USER_ID,
          suspended: true,
          suspendedReason: '반복적인 괴롭힘',
          suspendedAt: '2026-08-17T03:00:00.000Z',
        },
      },
    })
  })

  test('일반 사용자 정지 사유를 확인받아 PATCH하고 응답으로 행을 갱신한다', async () => {
    const wrapper = mount(AdminMembers)
    await flushPromises()
    await wrapper.get(`[data-testid="suspend-${USER_ID}"]`).trigger('click')
    await flushPromises()

    expect(mocks.alertCreate).toHaveBeenCalledWith(expect.objectContaining({
      header: '사용자 계정 정지',
      inputs: [expect.objectContaining({
        name: 'reason',
        type: 'textarea',
        attributes: expect.objectContaining({ maxlength: 300, required: true }),
      })],
    }))
    expect(mocks.patch).toHaveBeenCalledWith(`/api/admin/users/${USER_ID}/suspension`, {
      suspended: true,
      reason: '반복적인 괴롭힘',
    })
    expect(wrapper.text()).toContain('정지 사유')
    expect(wrapper.text()).toContain('반복적인 괴롭힘')
    expect(wrapper.find(`[data-testid="unsuspend-${USER_ID}"]`).exists()).toBe(true)
    expect(mocks.toastCreate).toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }))
    wrapper.unmount()
  })

  test('master에는 제재 버튼을 만들지 않고 행 내부 button 중첩도 없다', async () => {
    const wrapper = mount(AdminMembers)
    await flushPromises()

    expect(wrapper.find(`[data-testid="suspend-${MASTER_ID}"]`).exists()).toBe(false)
    expect(wrapper.find(`[data-testid="unsuspend-${MASTER_ID}"]`).exists()).toBe(false)
    for (const button of wrapper.findAll('button')) {
      expect(button.element.querySelector('button')).toBeNull()
    }
    wrapper.unmount()
  })

  test('정지 해제 확인 후 reason 없이 PATCH한다', async () => {
    mocks.get.mockResolvedValueOnce(listResponse({
      suspended: true,
      suspendedReason: '기존 사유',
      suspendedAt: '2026-08-17T03:00:00.000Z',
    }))
    mocks.onDidDismiss.mockResolvedValueOnce({ role: 'confirm' })
    mocks.patch.mockResolvedValueOnce({
      data: { user: { _id: USER_ID, suspended: false, suspendedReason: '', suspendedAt: null } },
    })
    const wrapper = mount(AdminMembers)
    await flushPromises()
    await wrapper.get(`[data-testid="unsuspend-${USER_ID}"]`).trigger('click')
    await flushPromises()

    expect(mocks.patch).toHaveBeenCalledWith(`/api/admin/users/${USER_ID}/suspension`, { suspended: false })
    expect(wrapper.find(`[data-testid="suspend-${USER_ID}"]`).exists()).toBe(true)
    wrapper.unmount()
  })

  test('대시보드 운영 로그에 정지·해제를 한국어로 표시한다', () => {
    expect(dashboardSource).toContain("user_suspended: '사용자 계정 정지'")
    expect(dashboardSource).toContain("user_unsuspended: '사용자 계정 정지 해제'")
  })
})
