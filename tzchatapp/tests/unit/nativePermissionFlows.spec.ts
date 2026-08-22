import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  platform: 'android',
  pushCheck: vi.fn(), pushRequest: vi.fn(), pushRegister: vi.fn(),
  pushUnregister: vi.fn(), pushRemoveListeners: vi.fn(), pushAddListener: vi.fn(), pushCreateChannel: vi.fn(),
  iosGetToken: vi.fn(), iosDeleteToken: vi.fn(), iosAddListener: vi.fn(), iosListenerRemove: vi.fn(),
  iosRefreshListener: undefined as undefined | ((result: { token: string }) => Promise<void>),
  contactsCheck: vi.fn(), contactsRequest: vi.fn(), contactsGet: vi.fn(),
  apiPost: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => mocks.platform } }))
vi.mock('@capacitor/push-notifications', () => ({ PushNotifications: {
  checkPermissions: mocks.pushCheck, requestPermissions: mocks.pushRequest,
  register: mocks.pushRegister, unregister: mocks.pushUnregister,
  removeAllListeners: mocks.pushRemoveListeners, addListener: mocks.pushAddListener,
  createChannel: mocks.pushCreateChannel,
} }))
vi.mock('@capacitor-community/contacts', () => ({ Contacts: {
  checkPermissions: mocks.contactsCheck, requestPermissions: mocks.contactsRequest, getContacts: mocks.contactsGet,
} }))
vi.mock('@/shared/plugins/iosFcmToken', () => ({ IosFcmToken: {
  getToken: mocks.iosGetToken,
  deleteToken: mocks.iosDeleteToken,
  addListener: mocks.iosAddListener,
} }))
vi.mock('@/shared/services/api', () => ({ default: { post: mocks.apiPost } }))
vi.mock('@/router', () => ({ default: { push: vi.fn() } }))

import { registerNativePush, unregisterNativePush } from '@/shared/services/nativePush'
import { getNativeContactPhoneNumbers, NativeContactsPermissionError } from '@/shared/services/nativeContacts'

describe('native runtime permission flows', () => {
  beforeEach(async () => {
    await unregisterNativePush()
    vi.clearAllMocks()
    mocks.platform = 'android'
    mocks.pushRemoveListeners.mockResolvedValue(undefined)
    mocks.pushAddListener.mockResolvedValue({ remove: vi.fn() })
    mocks.pushCreateChannel.mockResolvedValue(undefined)
    mocks.pushRegister.mockResolvedValue(undefined)
    mocks.pushUnregister.mockResolvedValue(undefined)
    mocks.iosGetToken.mockResolvedValue({ token: 'ios-fcm-initial' })
    mocks.iosDeleteToken.mockResolvedValue(undefined)
    mocks.iosListenerRemove.mockResolvedValue(undefined)
    mocks.iosRefreshListener = undefined
    mocks.iosAddListener.mockImplementation(async (_event, listener) => {
      mocks.iosRefreshListener = listener
      return { remove: mocks.iosListenerRemove }
    })
    mocks.apiPost.mockResolvedValue({})
  })

  test.each([
    ['android', 'prompt'],
    ['ios', 'prompt-with-rationale'],
  ] as const)('%s push %s 상태에서 한 번만 요청하고 등록한다', async (platform, receive) => {
    mocks.platform = platform
    mocks.pushCheck.mockResolvedValue({ receive })
    mocks.pushRequest.mockResolvedValue({ receive: 'granted' })
    const user = { _id: `user-${receive}`, search_allowNotifications: 'ON' } as any

    await Promise.all([registerNativePush(user), registerNativePush(user)])
    expect(mocks.pushRequest).toHaveBeenCalledTimes(1)
    expect(mocks.pushRegister).toHaveBeenCalledTimes(1)
  })

  test('Android는 기존 registration FCM 토큰을 서버에 등록하고 iOS 브리지를 사용하지 않는다', async () => {
    mocks.pushCheck.mockResolvedValue({ receive: 'granted' })
    let registrationListener: undefined | ((result: { value: string }) => Promise<void>)
    mocks.pushAddListener.mockImplementation(async (event, listener) => {
      if (event === 'registration') registrationListener = listener
      return { remove: vi.fn() }
    })

    await registerNativePush({ _id: 'android-user', search_allowNotifications: 'ON' } as any)
    await registrationListener?.({ value: 'android-fcm-token' })

    expect(mocks.iosGetToken).not.toHaveBeenCalled()
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/push/register', expect.objectContaining({
      token: 'android-fcm-token', platform: 'android',
    }))
  })

  test('iOS는 최초 FCM 토큰을 조회해 서버에 등록하고 APNs registration 값을 사용하지 않는다', async () => {
    mocks.platform = 'ios'
    mocks.pushCheck.mockResolvedValue({ receive: 'granted' })
    mocks.iosGetToken.mockResolvedValue({ token: 'ios-fcm-token' })

    await registerNativePush({ _id: 'ios-user', search_allowNotifications: 'ON' } as any)

    expect(mocks.iosGetToken).toHaveBeenCalledTimes(1)
    expect(mocks.pushAddListener.mock.calls.map(call => call[0])).not.toContain('registration')
    expect(mocks.apiPost).toHaveBeenCalledWith('/api/push/register', expect.objectContaining({
      token: 'ios-fcm-token', platform: 'ios',
    }))
  })

  test('iOS FCM refresh 토큰을 재등록하고 이전 토큰을 사용자 범위에서 해제한다', async () => {
    mocks.platform = 'ios'
    mocks.pushCheck.mockResolvedValue({ receive: 'granted' })
    mocks.iosGetToken.mockResolvedValue({ token: 'ios-fcm-old' })
    const user = { _id: 'ios-refresh-user', search_allowNotifications: 'ON' } as any
    await registerNativePush(user)
    mocks.apiPost.mockClear()

    await mocks.iosRefreshListener?.({ token: 'ios-fcm-new' })

    expect(mocks.apiPost).toHaveBeenNthCalledWith(1, '/api/push/register', expect.objectContaining({
      token: 'ios-fcm-new', platform: 'ios',
    }))
    expect(mocks.apiPost).toHaveBeenNthCalledWith(2, '/api/push/unregister', { token: 'ios-fcm-old' })
  })

  test('iOS 다중 등록 호출은 토큰 조회와 서버 등록을 한 번만 수행한다', async () => {
    mocks.platform = 'ios'
    mocks.pushCheck.mockResolvedValue({ receive: 'granted' })
    const user = { _id: 'ios-guard-user', search_allowNotifications: 'ON' } as any

    await Promise.all([registerNativePush(user), registerNativePush(user)])

    expect(mocks.iosGetToken).toHaveBeenCalledTimes(1)
    expect(mocks.apiPost).toHaveBeenCalledTimes(1)
  })

  test('iOS 로그아웃은 저장 토큰 서버 해제 후 FCM 토큰과 APNs 등록을 삭제한다', async () => {
    mocks.platform = 'ios'
    mocks.pushCheck.mockResolvedValue({ receive: 'granted' })
    await registerNativePush({ _id: 'ios-logout-user', search_allowNotifications: 'ON' } as any)
    mocks.apiPost.mockClear()
    mocks.iosDeleteToken.mockClear()
    mocks.pushUnregister.mockClear()

    await unregisterNativePush()

    expect(mocks.apiPost).toHaveBeenCalledWith('/api/push/unregister', { token: 'ios-fcm-initial' })
    expect(mocks.iosDeleteToken).toHaveBeenCalledTimes(1)
    expect(mocks.pushUnregister).toHaveBeenCalledTimes(1)
    expect(mocks.apiPost.mock.invocationCallOrder[0]).toBeLessThan(mocks.iosDeleteToken.mock.invocationCallOrder[0])
  })

  test('push denied는 다시 요청하지 않고 등록하지 않는다', async () => {
    mocks.pushCheck.mockResolvedValue({ receive: 'denied' })
    await registerNativePush({ _id: 'denied-user', search_allowNotifications: 'ON' } as any)
    await registerNativePush({ _id: 'denied-user', search_allowNotifications: 'ON' } as any)
    expect(mocks.pushRequest).not.toHaveBeenCalled()
    expect(mocks.pushRegister).not.toHaveBeenCalled()
  })

  test('알림 OFF 뒤 ON은 권한을 다시 확인해 등록한다', async () => {
    mocks.pushCheck.mockResolvedValue({ receive: 'granted' })
    const enabled = { _id: 'toggle-user', search_allowNotifications: 'ON' } as any
    await registerNativePush(enabled)
    await registerNativePush({ ...enabled, search_allowNotifications: 'OFF' })
    await registerNativePush(enabled)
    expect(mocks.pushCheck).toHaveBeenCalledTimes(2)
    expect(mocks.pushRegister).toHaveBeenCalledTimes(2)
    expect(mocks.pushUnregister).toHaveBeenCalledTimes(1)
  })

  test.each([
    ['android', 'prompt'],
    ['ios', 'prompt-with-rationale'],
  ] as const)('%s 연락처 %s이면 요청 후 승인된 경우에만 읽는다', async (platform, contacts) => {
    mocks.platform = platform
    mocks.contactsCheck.mockResolvedValue({ contacts })
    mocks.contactsRequest.mockResolvedValue({ contacts: 'granted' })
    mocks.contactsGet.mockResolvedValue({ contacts: [{ phones: [{ number: '01012345678' }] }] })
    await expect(getNativeContactPhoneNumbers()).resolves.toEqual(['01012345678'])
    expect(mocks.contactsRequest).toHaveBeenCalledTimes(1)
    expect(mocks.contactsGet).toHaveBeenCalledTimes(1)
  })

  test('연락처 denied이면 재요청·조회하지 않고 설정 안내 오류를 낸다', async () => {
    mocks.contactsCheck.mockResolvedValue({ contacts: 'denied' })
    await expect(getNativeContactPhoneNumbers()).rejects.toBeInstanceOf(NativeContactsPermissionError)
    expect(mocks.contactsRequest).not.toHaveBeenCalled()
    expect(mocks.contactsGet).not.toHaveBeenCalled()
  })

  test('연락처 요청 뒤 거부되면 조회하지 않고 설정 안내 오류를 낸다', async () => {
    mocks.contactsCheck.mockResolvedValue({ contacts: 'prompt' })
    mocks.contactsRequest.mockResolvedValue({ contacts: 'denied' })
    await expect(getNativeContactPhoneNumbers()).rejects.toBeInstanceOf(NativeContactsPermissionError)
    expect(mocks.contactsRequest).toHaveBeenCalledTimes(1)
    expect(mocks.contactsGet).not.toHaveBeenCalled()
  })

  test('iOS 연락처 limited 권한은 부분 접근으로 인정해 선택된 연락처를 읽는다', async () => {
    mocks.platform = 'ios'
    mocks.contactsCheck.mockResolvedValue({ contacts: 'limited' })
    mocks.contactsGet.mockResolvedValue({ contacts: [{ phones: [{ number: '01012345678' }] }] })

    await expect(getNativeContactPhoneNumbers()).resolves.toEqual(['01012345678'])
    expect(mocks.contactsRequest).not.toHaveBeenCalled()
    expect(mocks.contactsGet).toHaveBeenCalledTimes(1)
  })

  test('Android의 알 수 없는 limited 권한은 허용하지 않는다', async () => {
    mocks.platform = 'android'
    mocks.contactsCheck.mockResolvedValue({ contacts: 'limited' })

    await expect(getNativeContactPhoneNumbers()).rejects.toBeInstanceOf(NativeContactsPermissionError)
    expect(mocks.contactsRequest).not.toHaveBeenCalled()
    expect(mocks.contactsGet).not.toHaveBeenCalled()
  })
})
