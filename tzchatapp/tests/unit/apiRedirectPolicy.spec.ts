// @vitest-environment node
import { describe, expect, test } from 'vitest'
import {
  accountRestrictionActionForApiError,
  isPublicApiRequest,
  normalizeAuthRedirectPath,
} from '@/shared/services/api'

describe('HTTP 인증 리다이렉트 경로 제한', () => {
  test('인증·계정 완료 화면의 상대 경로와 쿼리만 허용한다', () => {
    expect(normalizeAuthRedirectPath('/login?redirect=%2Fhome%2F6page'))
      .toBe('/login?redirect=%2Fhome%2F6page')
    expect(normalizeAuthRedirectPath('/account/deletion-pending')).toBe('/account/deletion-pending')
    expect(normalizeAuthRedirectPath('/legal/consent?return=%2Fhome')).toBe('/legal/consent?return=%2Fhome')
    expect(normalizeAuthRedirectPath('/onboarding?return=%2Fhome')).toBe('/onboarding?return=%2Fhome')
  })

  test('외부 URL과 임의의 앱 경로는 거부한다', () => {
    expect(normalizeAuthRedirectPath('https://example.com/login')).toBeNull()
    expect(normalizeAuthRedirectPath('//example.com/login')).toBeNull()
    expect(normalizeAuthRedirectPath('/home/6page')).toBeNull()
    expect(normalizeAuthRedirectPath('\\login')).toBeNull()
  })

  test('탈퇴 대기 공통 403과 legacy 응답은 인증정보를 유지한 채 전용 화면으로 보낸다', () => {
    expect(accountRestrictionActionForApiError(
      403,
      'ACCOUNT_PENDING_DELETION',
      '/api/profile',
    )).toEqual({ path: '/account/deletion-pending', clearCredentials: false })
    expect(accountRestrictionActionForApiError(423, '', '/api/profile'))
      .toEqual({ path: '/account/deletion-pending', clearCredentials: false })
    expect(accountRestrictionActionForApiError(403, 'PENDING_DELETION', '/api/profile'))
      .toEqual({ path: '/account/deletion-pending', clearCredentials: false })
  })

  test('정지·삭제 계정은 보호 API에서 인증정보를 지우고 로그인으로 보내되 공개 로그인은 방해하지 않는다', () => {
    expect(accountRestrictionActionForApiError(403, 'ACCOUNT_SUSPENDED', '/api/profile'))
      .toEqual({ path: '/login', clearCredentials: true })
    expect(accountRestrictionActionForApiError(403, 'ACCOUNT_DELETED', '/api/friends'))
      .toEqual({ path: '/login', clearCredentials: true })
    expect(accountRestrictionActionForApiError(403, 'ACCOUNT_SUSPENDED', '/api/login'))
      .toBeNull()
    expect(accountRestrictionActionForApiError(403, 'ACCOUNT_DELETED', '/api/auth/phone/verify'))
      .toBeNull()
    expect(accountRestrictionActionForApiError(403, 'OTHER_ERROR', '/api/profile'))
      .toBeNull()
  })

  test('공개 약관 GET과 개인 약관 동의·현황의 401 처리를 구분한다', () => {
    expect(isPublicApiRequest('/api/terms/active', 'get')).toBe(true)
    expect(isPublicApiRequest('/api/terms/privacy/versions?lang=ko', 'get')).toBe(true)
    expect(isPublicApiRequest('/api/legal/consents/required', 'get')).toBe(true)
    expect(isPublicApiRequest('/api/terms/agreements/status', 'get')).toBe(false)
    expect(isPublicApiRequest('/api/terms/agreements/accept', 'post')).toBe(false)
    expect(isPublicApiRequest('/api/legal/consents/agree', 'post')).toBe(false)
  })
})
