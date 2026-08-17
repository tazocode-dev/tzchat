// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  completionRedirectForApiError,
  hasCompletedProfileOnboarding,
} from '@/shared/services/accountCompletion'
import type { MeUser } from '@/shared/stores/user'

const baseUser = {
  _id: 'user-1',
  nickname: 'tester',
  role: 'user',
  user_level: '베타회원',
} as MeUser

describe('profile onboarding completion', () => {
  const now = new Date('2026-08-15T03:00:00.000Z')

  it('requires an adult birth year and a supported gender', () => {
    expect(hasCompletedProfileOnboarding({ ...baseUser, birthyear: 2007, gender: 'woman' }, now)).toBe(true)
    expect(hasCompletedProfileOnboarding({ ...baseUser, birthyear: 2008, gender: 'woman' }, now)).toBe(false)
    expect(hasCompletedProfileOnboarding({ ...baseUser, birthyear: 2007, gender: '' }, now)).toBe(false)
  })

  it('keeps exact-age validation for legacy full birth dates', () => {
    expect(hasCompletedProfileOnboarding({ ...baseUser, birthDate: '2007-08-15', gender: 'man' }, now)).toBe(true)
    expect(hasCompletedProfileOnboarding({ ...baseUser, birthDate: '2007-08-16', gender: 'man' }, now)).toBe(false)
  })

  it('uses the server-computed onboarding status when present', () => {
    expect(hasCompletedProfileOnboarding({
      ...baseUser,
      birthyear: 2000,
      gender: 'woman',
      onboarding: {
        complete: false,
        nextStep: 'birthDate',
        hasBirthYear: false,
        hasBirthDate: false,
        hasGender: true,
      },
    }, now)).toBe(false)
  })

  it('routes both current 403 and compatible 428 completion failures to the required step', () => {
    expect(completionRedirectForApiError(403, 'AGREEMENTS_REQUIRED', '/home/6page'))
      .toBe('/legal/consent?return=%2Fhome%2F6page')
    expect(completionRedirectForApiError(403, 'ONBOARDING_REQUIRED', '/home/3page?tab=received'))
      .toBe('/onboarding?return=%2Fhome%2F3page%3Ftab%3Dreceived')
    expect(completionRedirectForApiError(428, 'AGREEMENTS_REQUIRED', '/home/6page'))
      .toBe('/legal/consent?return=%2Fhome%2F6page')
    expect(completionRedirectForApiError(428, 'ONBOARDING_REQUIRED', '/home/3page?tab=received'))
      .toBe('/onboarding?return=%2Fhome%2F3page%3Ftab%3Dreceived')
    expect(completionRedirectForApiError(401, 'ONBOARDING_REQUIRED', '/home/6page')).toBeNull()
  })
})
