// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  back: vi.fn(),
}))

vi.mock('@/shared/services/api', () => ({
  default: { get: mocks.get, patch: mocks.patch },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ back: mocks.back }),
}))

import AdminReports from '@/features/admin/pages/AdminReportsPage.vue'
import routerSource from '@/router/index.ts?raw'
import dashboardSource from '@/features/admin/pages/AdminDashboardPage.vue?raw'

const REPORT_ID = '64b000000000000000000009'

describe('관리자 신고 관리', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.get.mockResolvedValue({
      data: {
        reports: [{
          _id: REPORT_ID,
          reporterUserId: { _id: '1', nickname: '신고자' },
          reportedUserId: { _id: '2', nickname: '대상자' },
          reason: 'harassment',
          details: '반복적인 괴롭힘',
          contextType: 'chat',
          chatRoomId: '64b000000000000000000003',
          status: 'pending',
          createdAt: '2026-08-17T01:00:00.000Z',
        }],
        page: 1,
        pages: 2,
        total: 21,
      },
    })
    mocks.patch.mockResolvedValue({ data: { ok: true, report: { _id: REPORT_ID, status: 'reviewed' } } })
  })

  test('pending 필터로 목록을 조회하고 신고 정보를 한국어로 표시한다', async () => {
    const wrapper = mount(AdminReports)
    await flushPromises()

    expect(mocks.get).toHaveBeenCalledWith('/api/admin/reports', {
      params: { status: 'pending', page: 1, limit: 20 },
    })
    expect(wrapper.text()).toContain('신고자')
    expect(wrapper.text()).toContain('대상자')
    expect(wrapper.text()).toContain('욕설·괴롭힘')
    expect(wrapper.text()).toContain('채팅')
    expect(wrapper.text()).toContain('반복적인 괴롭힘')
    wrapper.unmount()
  })

  test('허용 상태를 PATCH하고 처리 중 중복 제출을 막는다', async () => {
    let resolvePatch: ((value: unknown) => void) | undefined
    mocks.patch.mockReturnValueOnce(new Promise(resolve => { resolvePatch = resolve }))
    const wrapper = mount(AdminReports)
    await flushPromises()

    const editor = wrapper.get<HTMLSelectElement>(`#report-status-${REPORT_ID}`)
    expect(Array.from(editor.element.options).map(option => option.value)).toEqual([
      'pending', 'reviewed', 'resolved', 'rejected',
    ])
    await editor.setValue('reviewed')
    const save = wrapper.get<HTMLButtonElement>(`[data-testid="save-status-${REPORT_ID}"]`)
    await save.trigger('click')

    expect(mocks.patch).toHaveBeenCalledWith(`/api/admin/reports/${REPORT_ID}/status`, { status: 'reviewed' })
    expect(save.element.disabled).toBe(true)
    resolvePatch?.({ data: { ok: true } })
    await flushPromises()
    expect(wrapper.find(`[data-testid="save-status-${REPORT_ID}"]`).exists()).toBe(false)
    wrapper.unmount()
  })

  test('master 라우트·legacy redirect·대시보드 진입과 운영 로그 문구를 연결한다', () => {
    expect(routerSource).toContain("const AdminReportsPage = () => import('@/features/admin/pages/AdminReportsPage.vue')")
    expect(routerSource).toContain("{ path: 'admin/reports', name: 'AdminReports', component: AdminReportsPage, meta: { requiresMaster: true } }")
    expect(routerSource).toContain("'0007': '/home/admin/reports'")
    expect(dashboardSource).toContain("path: '/home/admin/reports'")
    expect(dashboardSource).toContain("report_status_updated: '신고 상태 변경'")
  })
})
