// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isMaster: false,
  apiGet: vi.fn(),
  bootstrapAuth: vi.fn(),
  socketOn: vi.fn(),
  socketOff: vi.fn(),
  socketEmit: vi.fn(),
}))

vi.mock('@/shared/services/api', () => ({
  default: { get: mocks.apiGet },
}))
vi.mock('@/shared/services/socket', () => ({
  getSocket: () => null,
  connectSocket: () => ({
    connected: false,
    on: mocks.socketOn,
    off: mocks.socketOff,
    emit: mocks.socketEmit,
  }),
}))
vi.mock('@/shared/stores/user', () => ({
  useUserStore: () => ({
    get isMaster() { return mocks.isMaster },
    user: { _id: 'test-user' },
    setUser: vi.fn(),
    bootstrapAuth: mocks.bootstrapAuth,
  }),
}))

import AdminVisualTestPage from '@/features/admin/pages/AdminVisualTestPage.vue'
import TopMenu from '@/layouts/TopMenu.vue'

function testRouter(path = '/home/6page') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/home/6page', component: { template: '<div />' } },
      { path: '/home/admin', component: { template: '<div />' } },
      { path: '/home/admin-test', component: { template: '<div />' } },
    ],
  })
  return router.push(path).then(() => router.isReady()).then(() => router)
}

describe('관리자 시각 테스트 페이지', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isMaster = false
    mocks.bootstrapAuth.mockResolvedValue({ status: 'authenticated', user: { _id: 'test-user' } })
    mocks.apiGet.mockResolvedValue({ data: {} })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  test('일반 사용자에게 관리자와 테스트 탭을 노출하지 않고 master에게만 두 탭을 노출한다', async () => {
    const regularRouter = await testRouter()
    const regular = mount(TopMenu, { global: { plugins: [regularRouter], stubs: { IonIcon: true } } })
    expect(regular.text()).not.toContain('관리자')
    expect(regular.text()).not.toContain('테스트')
    regular.unmount()

    mocks.isMaster = true
    const masterRouter = await testRouter('/home/admin-test')
    const master = mount(TopMenu, { global: { plugins: [masterRouter], stubs: { IonIcon: true } } })
    const labels = master.findAll('.menu-text').map((item) => item.text())
    expect(labels).toContain('관리자')
    expect(labels).toContain('테스트')
    expect(master.findAll('.menu-item')).toHaveLength(6)
    expect(master.findAll('.menu-item.active')).toHaveLength(1)
    expect(master.find('.menu-item.active').text()).toContain('테스트')
    master.unmount()
  })

  test('admin-test 라우트는 master 전용 meta와 기존 관리자 경로와 분리된 주소를 사용한다', () => {
    const routerSource = readFileSync(
      join(process.cwd(), 'src/router/index.ts'),
      'utf8',
    )
    expect(routerSource).toMatch(/path:\s*'admin-test',[\s\S]*?meta:\s*\{\s*requiresMaster:\s*true\s*\}/)
    expect(routerSource).toContain("const requiresMaster = to.matched.some((r) => r.meta.requiresMaster)")
    expect(routerSource).toContain("if (requiresMaster && role !== 'master') return next('/home')")
  })

  test('모든 내용이 샘플로 표시되고 실행 가능한 버튼이나 네트워크·네이티브 호출이 없다', () => {
    const pageSource = readFileSync(
      join(process.cwd(), 'src/features/admin/pages/AdminVisualTestPage.vue'),
      'utf8',
    )
    const wrapper = mount(AdminVisualTestPage)

    expect(wrapper.text()).toContain('시각 전용 · 실제 동작 없음')
    expect(wrapper.text()).toContain('API 호출, 데이터 변경, 권한 요청, 알림 발송, 네이티브 기능 실행이 없습니다.')
    expect(wrapper.text()).toContain('계정 상태 시나리오')
    expect(wrapper.text()).toContain('알림 미리보기')
    expect(wrapper.text()).toContain('매칭 상태')
    expect(wrapper.text()).toContain('운영 연결 상태')
    expect(wrapper.text()).toContain('공통 UI 상태')
    expect(wrapper.findAll('button')).toHaveLength(4)
    expect(wrapper.findAll('button').every((button) => button.attributes('disabled') !== undefined)).toBe(true)
    expect(mocks.apiGet).not.toHaveBeenCalled()
    expect(pageSource).not.toMatch(/shared\/services\/api|\baxios\b|\bfetch\s*\(|connectSocket|PushNotifications|Capacitor/)
  })
})
