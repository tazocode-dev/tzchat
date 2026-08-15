import { describe, expect, test } from 'vitest'
import { nativePushRoute } from '@/shared/services/nativePushRouting'
import { appendNativePushTokenToLogout } from '@/shared/services/nativePushTokenStorage'

describe('native push routing', () => {
  test('채팅과 친구 알림 데이터를 앱 내부 경로로 제한한다', () => {
    const roomId = '507f1f77bcf86cd799439011'
    expect(nativePushRoute({ type: 'chat', roomId })).toBe(`/home/chat/${roomId}`)
    expect(nativePushRoute({ deeplink: `tzchat://chat/${roomId}` })).toBe(`/home/chat/${roomId}`)
    expect(nativePushRoute({ deeplink: 'tzchat://friends/received' })).toBe('/home/3page?tab=received')
    expect(nativePushRoute({ deeplink: 'tzchat://friends/speed' })).toBe('/home/3page?tab=premium')
    expect(nativePushRoute({ deeplink: 'https://example.com/private' })).toBe('/home/6page')
  })

  test('잘못된 채팅방 ID를 경로로 연결하지 않는다', () => {
    expect(nativePushRoute({ type: 'chat', roomId: '../settings' })).toBe('/home/6page')
    expect(nativePushRoute({ deeplink: 'tzchat://chat/room/id?admin=1' })).toBe('/home/6page')
    expect(nativePushRoute({ deeplink: 'tzchat://chat/507f1f77bcf86cd799439011?x=1' })).toBe('/home/6page')
  })

  test('iOS 중첩 data 객체와 JSON 문자열을 안전하게 정규화한다', () => {
    const roomId = '507f1f77bcf86cd799439011'
    expect(nativePushRoute({ data: { type: 'chat', roomId } })).toBe(`/home/chat/${roomId}`)
    expect(nativePushRoute({ data: JSON.stringify({ deeplink: 'tzchat://friends/received' }) }))
      .toBe('/home/3page?tab=received')
    expect(nativePushRoute({ data: JSON.stringify({ type: 'chat', roomId: '../settings' }) }))
      .toBe('/home/6page')
    expect(nativePushRoute({ data: '{not-json' })).toBe('/home/6page')
  })
})

describe('native push logout cleanup', () => {
  test('공용 로그아웃 요청에만 현재 기기 토큰을 포함한다', () => {
    const token = 'current-device-fcm-token'
    expect(appendNativePushTokenToLogout('/api/logout', { reason: 'user' }, token)).toEqual({
      reason: 'user', nativePushToken: token,
    })
    expect(appendNativePushTokenToLogout('/api/push/register', {}, token)).toEqual({})
    expect(appendNativePushTokenToLogout('/api/logout', {}, '')).toEqual({})
  })
})
