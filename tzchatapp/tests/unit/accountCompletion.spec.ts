// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { hasCompletedProfileOnboarding } from '@/shared/services/accountCompletion'
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
})
