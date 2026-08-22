// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  present: vi.fn(),
  createToast: vi.fn(),
}))

vi.mock('@/shared/services/api', () => ({
  default: { post: mocks.post },
}))

vi.mock('@ionic/vue', () => ({
  toastController: { create: mocks.createToast },
}))

import UserReportModal from '@/shared/components/UserReportModal.vue'
import userProfileSource from '@/features/profile/pages/UserProfilePage.vue?raw'
import premiumProfileSource from '@/features/profile/pages/SpeedUserProfilePage.vue?raw'
import chatRoomSource from '@/features/chat/pages/ChatRoomPage.vue?raw'

const USER_ID = '64b000000000000000000002'
const ROOM_ID = '64b000000000000000000004'

function mountModal(props: Record<string, unknown>) {
  return mount(UserReportModal, {
    props: {
      userId: USER_ID,
      nickname: '신고대상',
      contextType: 'profile',
      ...props,
    },
    global: { stubs: { teleport: true } },
  })
}

async function chooseReasonAndSubmit(wrapper: ReturnType<typeof mountModal>, reason = 'harassment', details = '') {
  await wrapper.get<HTMLInputElement>(`input[value="${reason}"]`).setValue(true)
  if (details) await wrapper.get<HTMLTextAreaElement>('#user-report-details').setValue(details)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

describe('UserReportModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.present.mockResolvedValue(undefined)
    mocks.createToast.mockResolvedValue({ present: mocks.present })
    mocks.post.mockResolvedValue({ data: { report: { _id: 'report-1' } } })
  })

  test('6개 한국어 신고 사유와 접근 가능한 입력을 제공한다', () => {
    const wrapper = mountModal({})
    expect(wrapper.get('[role="dialog"]').attributes('aria-modal')).toBe('true')
    expect(wrapper.findAll('input[name="report-reason"]')).toHaveLength(6)
    expect(wrapper.text()).toContain('부적절한 프로필')
    expect(wrapper.text()).toContain('음란·성적인 콘텐츠')
    expect(wrapper.text()).toContain('욕설·괴롭힘')
    expect(wrapper.text()).toContain('사칭')
    expect(wrapper.text()).toContain('광고·스팸')
    expect(wrapper.text()).toContain('기타')
    expect(wrapper.get('textarea').attributes('maxlength')).toBe('1000')
    wrapper.unmount()
  })

  test('프로필 신고 payload를 POST하고 성공 이벤트와 안내를 제공한다', async () => {
    const wrapper = mountModal({ contextType: 'profile' })
    await chooseReasonAndSubmit(wrapper, 'harassment', '  반복적인 메시지  ')

    expect(mocks.post).toHaveBeenCalledWith('/api/reports', {
      reportedUserId: USER_ID,
      reason: 'harassment',
      details: '반복적인 메시지',
      contextType: 'profile',
    })
    expect(mocks.createToast).toHaveBeenCalledWith(expect.objectContaining({ message: '신고가 접수되었습니다.' }))
    expect(wrapper.emitted('submitted')?.[0]).toEqual([{ _id: 'report-1' }])
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  test('채팅 신고에는 현재 채팅방 ID를 포함한다', async () => {
    const wrapper = mountModal({ contextType: 'chat', chatRoomId: ROOM_ID })
    await chooseReasonAndSubmit(wrapper, 'spam')

    expect(mocks.post).toHaveBeenCalledWith('/api/reports', {
      reportedUserId: USER_ID,
      reason: 'spam',
      details: '',
      contextType: 'chat',
      chatRoomId: ROOM_ID,
    })
    wrapper.unmount()
  })

  test('pending 중복 응답은 창을 닫지 않고 명확히 안내한다', async () => {
    mocks.post.mockRejectedValueOnce({
      response: { status: 409, data: { code: 'PENDING_REPORT_EXISTS' } },
    })
    const wrapper = mountModal({})
    await chooseReasonAndSubmit(wrapper)

    expect(wrapper.get('[role="alert"]').text()).toBe('이미 처리 대기 중인 신고가 있습니다.')
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(wrapper.get<HTMLButtonElement>('.submit-button').element.disabled).toBe(false)
    wrapper.unmount()
  })
})

describe('사용자 신고 화면 연결', () => {
  test('두 프로필과 채팅 화면이 공통 모달을 사용하고 mailto 신고를 제거한다', () => {
    for (const source of [userProfileSource, premiumProfileSource]) {
      expect(source).toContain("import UserReportModal from '@/shared/components/UserReportModal.vue'")
      expect(source).toContain('context-type="profile"')
      expect(source).toContain('@click="showReportModal = true"')
      expect(source).not.toContain('function getReporterId')
      expect(source).not.toContain('mailto:')
    }

    expect(chatRoomSource).toContain("import UserReportModal from '@/shared/components/UserReportModal.vue'")
    expect(chatRoomSource).toContain('context-type="chat"')
    expect(chatRoomSource).toContain(':chat-room-id="roomId"')
    expect(chatRoomSource).toContain(':disabled="!canReportPartner"')
    expect(chatRoomSource).toContain('String(myId.value) !== String(partnerId.value)')
  })
})
