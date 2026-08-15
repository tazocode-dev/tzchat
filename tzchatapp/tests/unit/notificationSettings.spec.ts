import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  patch: vi.fn(),
  post: vi.fn(),
  registerNativePush: vi.fn(),
  unregisterNativePush: vi.fn(),
}))

vi.mock('@/shared/services/api', () => ({
  default: { patch: mocks.patch, post: mocks.post },
}))
vi.mock('@/shared/services/nativePush', () => ({
  registerNativePush: mocks.registerNativePush,
  unregisterNativePush: mocks.unregisterNativePush,
}))
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android' },
}))

import { setNotificationsOptOut } from '@/shared/services/webPush'

describe('notification settings push synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.patch.mockResolvedValue({})
    mocks.registerNativePush.mockResolvedValue('registered')
    mocks.unregisterNativePush.mockResolvedValue(undefined)
  })

  test('ON 저장 성공 뒤 최신 사용자 설정으로 native 등록을 수행한다', async () => {
    const user = { _id: 'user-a', search_allowNotifications: 'OFF' } as any
    await setNotificationsOptOut(false, user)

    expect(mocks.patch).toHaveBeenCalledTimes(1)
    expect(mocks.patch).toHaveBeenCalledWith(
      '/api/search/settings',
      { allowNotifications: 'ON' },
      { withCredentials: true },
    )
    expect(mocks.registerNativePush).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'user-a', search_allowNotifications: 'ON' }),
    )
  })

  test('설정 저장 실패 시 토큰 상태를 변경하지 않는다', async () => {
    mocks.patch.mockRejectedValueOnce(new Error('save failed'))
    await expect(setNotificationsOptOut(true, { _id: 'user-a' } as any)).rejects.toThrow('save failed')
    expect(mocks.unregisterNativePush).not.toHaveBeenCalled()
  })

  test('설정 저장 뒤 토큰 등록 실패는 저장된 ON 상태를 되돌리지 않는다', async () => {
    mocks.registerNativePush.mockRejectedValueOnce(new Error('native unavailable'))
    await expect(setNotificationsOptOut(false, { _id: 'user-a' } as any)).resolves.toBeUndefined()
    expect(mocks.patch).toHaveBeenCalledTimes(1)
  })

  test('OFF 저장 성공 뒤 native 토큰을 해제한다', async () => {
    await setNotificationsOptOut(true, { _id: 'user-a' } as any)
    expect(mocks.patch).toHaveBeenCalledTimes(1)
    expect(mocks.unregisterNativePush).toHaveBeenCalledTimes(1)
  })
})
