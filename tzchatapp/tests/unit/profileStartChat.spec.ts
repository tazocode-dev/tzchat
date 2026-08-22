// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
  toastCreate: vi.fn(),
  toastPresent: vi.fn(),
}))

vi.mock('@/shared/services/api', () => ({
  default: {
    get: mocks.get,
    post: mocks.post,
    put: mocks.put,
    delete: mocks.delete,
  },
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: '64b000000000000000000002' } }),
  useRouter: () => ({ push: mocks.push, back: mocks.back }),
}))

vi.mock('@ionic/vue', () => ({
  IonButton: {
    props: ['disabled'],
    emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
  IonIcon: { template: '<span />' },
  toastController: { create: mocks.toastCreate },
}))

vi.mock('@/shared/components/ProfilePhotoViewer.vue', () => ({
  default: { template: '<div />' },
}))
vi.mock('@/shared/components/UserReportModal.vue', () => ({
  default: { template: '<div />' },
}))
vi.mock('@/features/friends/components/FriendRequestModal.vue', () => ({
  default: { template: '<div />' },
}))
vi.mock('@/features/friends/components/SpeedMatchRequestModal.vue', () => ({
  default: { template: '<div />' },
}))

import UserProfilePage from '@/features/profile/pages/UserProfilePage.vue'
import SpeedUserProfilePage from '@/features/profile/pages/SpeedUserProfilePage.vue'

const TARGET_ID = '64b000000000000000000002'
const ROOM_ID = '64b000000000000000000004'
const pages = [
  ['일반 프로필', UserProfilePage],
  ['스피드 매칭 프로필', SpeedUserProfilePage],
] as const

function mockProfileLoad(overrides: Record<string, unknown> = {}) {
  mocks.get.mockImplementation((url: string) => {
    if (url.startsWith('/api/users/')) {
      return Promise.resolve({
        data: {
          _id: TARGET_ID,
          nickname: '상대방',
          isFriend: true,
          isBlocked: false,
          ...overrides,
        },
      })
    }
    if (url === '/api/me') return Promise.resolve({ data: { user: { level: '일반회원' } } })
    return Promise.resolve({ data: { requests: [] } })
  })
}

function mountPage(component: (typeof pages)[number][1]) {
  return mount(component, {
    global: {
      stubs: {
        ProfilePhotoViewer: true,
        UserReportModal: true,
        FriendRequestModal: true,
        SpeedMatchRequestModal: true,
        Teleport: true,
      },
    },
  })
}

describe.each(pages)('%s 대화 시작', (_label, component) => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.push.mockResolvedValue(undefined)
    mocks.toastPresent.mockResolvedValue(undefined)
    mocks.toastCreate.mockResolvedValue({ present: mocks.toastPresent })
    mockProfileLoad()
  })

  test('친구이며 비차단이면 API를 한 번만 호출하고 응답 방으로 이동한다', async () => {
    let resolvePost!: (value: unknown) => void
    mocks.post.mockReturnValue(new Promise(resolve => { resolvePost = resolve }))
    const wrapper = mountPage(component)
    await flushPromises()

    const first = (wrapper.vm as any).startChat(TARGET_ID)
    const duplicate = (wrapper.vm as any).startChat(TARGET_ID)
    expect(mocks.post).toHaveBeenCalledTimes(1)
    expect(mocks.post).toHaveBeenCalledWith(
      '/api/chatrooms',
      { userId: TARGET_ID },
      { withCredentials: true }
    )

    resolvePost({ data: { _id: ROOM_ID } })
    await Promise.all([first, duplicate])
    expect(mocks.push).toHaveBeenCalledWith(`/home/chat/${ROOM_ID}`)
    wrapper.unmount()
  })

  test.each([
    ['친구가 아닌 상태', { isFriend: false }],
    ['차단 상태', { isBlocked: true }],
  ])('%s에서는 버튼과 직접 호출 모두 채팅 생성을 막는다', async (_state, overrides) => {
    mockProfileLoad(overrides)
    const wrapper = mountPage(component)
    await flushPromises()

    expect(wrapper.get('.slot-chat').attributes('disabled')).toBeDefined()
    await (wrapper.vm as any).startChat(TARGET_ID)

    expect(mocks.post).not.toHaveBeenCalled()
    expect(mocks.toastCreate).toHaveBeenCalledWith(expect.objectContaining({ color: 'danger' }))
    wrapper.unmount()
  })

  test('잘못된 채팅방 ID 응답은 이동하지 않고 오류를 안내한다', async () => {
    mocks.post.mockResolvedValue({ data: { _id: 'invalid-room' } })
    const wrapper = mountPage(component)
    await flushPromises()

    await (wrapper.vm as any).startChat(TARGET_ID)

    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.toastCreate).toHaveBeenCalledWith(expect.objectContaining({
      message: '채팅방을 열지 못했습니다. 잠시 후 다시 시도해 주세요.',
      color: 'danger',
    }))
    wrapper.unmount()
  })
})
