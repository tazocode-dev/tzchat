import type { MeUser } from '@/shared/stores/user'

const VALID_GENDERS = new Set([
  'man', 'woman', 'male', 'female', '남', '남자', '남성', '여', '여자', '여성',
])

function koreaTodayParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const pick = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value)
  return { year: pick('year'), month: pick('month'), day: pick('day') }
}

function hasAdultAgeInformation(me: MeUser, now = new Date()) {
  const today = koreaTodayParts(now)

  if (me.birthDate) {
    const birth = new Date(me.birthDate)
    if (Number.isNaN(birth.getTime())) return false
    const year = birth.getUTCFullYear()
    const month = birth.getUTCMonth() + 1
    const day = birth.getUTCDate()
    let age = today.year - year
    if (today.month < month || (today.month === month && today.day < day)) age -= 1
    return year >= 1900 && age >= 19
  }

  const birthyear = Number(me.birthyear)
  return Number.isInteger(birthyear) && birthyear >= 1900 && today.year - birthyear >= 19
}

export function hasCompletedProfileOnboarding(me: MeUser, now = new Date()) {
  if (typeof me.onboarding?.complete === 'boolean') return me.onboarding.complete
  const gender = String(me.gender || '').trim().toLowerCase()
  return hasAdultAgeInformation(me, now) && VALID_GENDERS.has(gender)
}

export function completionRedirectForApiError(status: number | undefined, code: string, current: string) {
  if (status !== 403 && status !== 428) return null
  if (code === 'AGREEMENTS_REQUIRED') {
    return `/legal/consent?return=${encodeURIComponent(current)}`
  }
  if (code === 'ONBOARDING_REQUIRED') {
    return `/onboarding?return=${encodeURIComponent(current)}`
  }
  return null
}
