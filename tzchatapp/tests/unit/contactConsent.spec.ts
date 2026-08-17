import { describe, expect, test, vi } from 'vitest'
import {
  CONTACTS_CONSENT_SLUG,
  ensureCurrentContactConsent,
  isOptionalConsentRequiredError,
} from '@/features/profile/services/contactConsent'
import profileSource from '@/features/profile/pages/6_profile.vue?raw'

function clientFor(options: { agreed?: boolean; version?: string } = {}) {
  const version = options.version || '2026-08-13-01'
  const get = vi.fn(async (url: string) => {
    if (url.endsWith('/active')) return { data: { data: { slug: CONTACTS_CONSENT_SLUG, version } } }
    return {
      data: {
        data: {
          items: [{
            slug: CONTACTS_CONSENT_SLUG,
            version,
            sameVersion: !!options.agreed,
            optedIn: options.agreed === true,
          }],
        },
      },
    }
  })
  return { get, post: vi.fn(async () => ({ data: { ok: true } })) }
}

describe('연락처 지인 제외 선택 동의', () => {
  test('현재 활성 버전에 이미 동의한 사용자는 추가 안내 없이 진행한다', async () => {
    const client = clientFor({ agreed: true })
    const prompt = vi.fn(async () => 'cancel' as const)

    await expect(ensureCurrentContactConsent({ client, prompt, openDetails: vi.fn() })).resolves.toBe(true)
    expect(prompt).not.toHaveBeenCalled()
    expect(client.post).not.toHaveBeenCalled()
  })

  test('취소하면 동의 저장과 후속 연락처 처리를 시작하지 않는다', async () => {
    const events: string[] = []
    const client = clientFor()
    const allowed = await ensureCurrentContactConsent({
      client,
      prompt: async () => { events.push('prompt'); return 'cancel' },
      openDetails: () => { events.push('details') },
    })
    if (allowed) events.push('contacts')

    expect(events).toEqual(['prompt'])
    expect(client.post).not.toHaveBeenCalled()
  })

  test('자세히 보기 후에는 자동 동의하지 않고 다시 명시적으로 동의해야 한다', async () => {
    const client = clientFor()
    const actions = ['details', 'accept'] as const
    let promptCount = 0
    const openDetails = vi.fn()
    const prompt = async () => actions[promptCount++]

    await expect(ensureCurrentContactConsent({ client, prompt, openDetails })).resolves.toBe(false)
    expect(openDetails).toHaveBeenCalledTimes(1)
    expect(client.post).not.toHaveBeenCalled()

    await expect(ensureCurrentContactConsent({ client, prompt, openDetails })).resolves.toBe(true)
    expect(promptCount).toBe(2)
    expect(client.post).toHaveBeenCalledWith('/api/terms/consents', {
      slug: CONTACTS_CONSENT_SLUG,
      version: '2026-08-13-01',
      optedIn: true,
    }, { withCredentials: true })
  })

  test('동의 저장이 끝난 뒤에만 후속 연락처 처리를 진행한다', async () => {
    const events: string[] = []
    const client = clientFor()
    client.post.mockImplementation(async () => { events.push('consent'); return { data: { ok: true } } })

    const allowed = await ensureCurrentContactConsent({
      client,
      prompt: async () => { events.push('prompt'); return 'accept' },
      openDetails: vi.fn(),
    })
    if (allowed) events.push('contacts')

    expect(events).toEqual(['prompt', 'consent', 'contacts'])
  })

  test('백엔드 선택 동의 403을 식별하고 프로필 ON 흐름 앞에서 동의를 확인한다', () => {
    expect(isOptionalConsentRequiredError({
      response: { status: 403, data: { code: 'OPTIONAL_CONSENT_REQUIRED', slug: CONTACTS_CONSENT_SLUG } },
    })).toBe(true)
    expect(isOptionalConsentRequiredError({
      response: { status: 403, data: { code: 'OPTIONAL_CONSENT_REQUIRED', slug: 'other-consent' } },
    })).toBe(false)

    const toggleSource = profileSource.slice(
      profileSource.indexOf('async function toggleDisconnectLocalContacts'),
      profileSource.indexOf('/* 다른 스위치들'),
    )
    expect(toggleSource.indexOf('await ensureContactsConsentForUse()'))
      .toBeLessThan(toggleSource.indexOf('await collectLocalContactHashes()'))
    expect(toggleSource).toContain("await saveSwitchesToDB({ showError: false })")
    expect(profileSource).toContain('동의하고 사용')
    expect(profileSource).toContain('자세히 보기')
    expect(profileSource).toContain('거부 영향')

    const promptSource = profileSource.slice(
      profileSource.indexOf('async function presentContactConsentPrompt'),
      profileSource.indexOf('async function ensureContactsConsentForUse'),
    )
    expect(promptSource).not.toContain('<strong>')
    expect(promptSource).not.toContain('<br>')
    expect(promptSource).toContain('【목적】\\n')
    expect(promptSource).toContain('【처리 항목】\\n')
    expect(promptSource).toContain('【거부 영향】\\n')
    expect(promptSource).toContain("{ text: '취소', role: 'cancel' }")
    expect(promptSource).toContain("{ text: '자세히 보기', role: 'details' }")
    expect(promptSource).toContain("{ text: '동의하고 사용', role: 'accept' }")
  })
})
