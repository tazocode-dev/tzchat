import { afterEach, describe, expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import {
  SENSITIVE_INFORMATION_CONSENT_SLUG,
  ensureCurrentSensitivePreferenceConsent,
  isSensitiveInformationConsentRequiredError,
} from '@/features/profile/services/sensitivePreferenceConsent'
import ModalPreference from '@/features/profile/components/Modal_preference.vue'
import SearchPreferenceModal from '@/features/profile/components/Search_Preference_Modal.vue'
import profileSource from '@/features/profile/pages/6_profile.vue?raw'

const mocks = vi.hoisted(() => ({ apiPatch: vi.fn() }))
vi.mock('@/shared/services/api', () => ({
  default: { patch: mocks.apiPatch },
}))

function clientFor(options: { agreed?: boolean; version?: string } = {}) {
  const version = options.version || '2026-08-13-01'
  const get = vi.fn(async (url: string) => {
    if (url.endsWith('/active')) {
      return { data: { data: { slug: SENSITIVE_INFORMATION_CONSENT_SLUG, version } } }
    }
    return {
      data: { data: { items: [{
        slug: SENSITIVE_INFORMATION_CONSENT_SLUG,
        version,
        sameVersion: !!options.agreed,
        optedIn: options.agreed === true,
      }] } },
    }
  })
  return { get, post: vi.fn(async () => ({ data: { ok: true } })) }
}

const IonButtonStub = { template: '<button><slot /></button>' }
const IonSelectStub = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>',
}
const IonSelectOptionStub = {
  props: ['value', 'disabled'],
  template: '<option :value="value" :disabled="disabled"><slot /></option>',
}
const modalOptions = {
  global: {
    stubs: {
      IonButton: IonButtonStub,
      IonSelect: IonSelectStub,
      IonSelectOption: IonSelectOptionStub,
    },
  },
}

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  document.body.innerHTML = ''
})

describe('민감정보 선택 동의 편집 진입', () => {
  test('현재 활성 버전에 이미 동의했으면 안내·재저장 없이 편집을 허용한다', async () => {
    const client = clientFor({ agreed: true })
    const prompt = vi.fn(async () => 'cancel' as const)

    await expect(ensureCurrentSensitivePreferenceConsent({ client, prompt, openDetails: vi.fn() })).resolves.toBe(true)
    expect(prompt).not.toHaveBeenCalled()
    expect(client.post).not.toHaveBeenCalled()
  })

  test('취소와 상세보기는 동의를 저장하거나 편집을 열지 않는다', async () => {
    const client = clientFor()
    const openDetails = vi.fn()

    await expect(ensureCurrentSensitivePreferenceConsent({
      client,
      prompt: async () => 'cancel',
      openDetails,
    })).resolves.toBe(false)
    await expect(ensureCurrentSensitivePreferenceConsent({
      client,
      prompt: async () => 'details',
      openDetails,
    })).resolves.toBe(false)

    expect(openDetails).toHaveBeenCalledTimes(1)
    expect(client.post).not.toHaveBeenCalled()
  })

  test('현재 버전 동의 저장이 끝난 뒤에만 편집을 허용한다', async () => {
    const events: string[] = []
    const client = clientFor()
    client.post.mockImplementation(async () => { events.push('consent'); return { data: { ok: true } } })

    const allowed = await ensureCurrentSensitivePreferenceConsent({
      client,
      prompt: async () => { events.push('prompt'); return 'accept' },
      openDetails: vi.fn(),
    })
    if (allowed) events.push('editor')

    expect(events).toEqual(['prompt', 'consent', 'editor'])
    expect(client.post).toHaveBeenCalledWith('/api/terms/consents', {
      slug: SENSITIVE_INFORMATION_CONSENT_SLUG,
      version: '2026-08-13-01',
      optedIn: true,
    }, { withCredentials: true })
  })

  test('두 성향 행의 클릭·키보드가 공통 동의 흐름을 거치고 빈 값은 미입력으로 표시한다', () => {
    expect(profileSource).toContain('@click="canEditFieldLocal(\'preference\') ? openPreferenceModal()')
    expect(profileSource).toContain('@keydown.enter="canEditFieldLocal(\'preference\') ? openPreferenceModal()')
    expect(profileSource).toContain('@click="canEditFieldLocal(\'search_preference\') ? openSearchPreferenceModal()')
    expect(profileSource).toContain('@keydown.enter="canEditFieldLocal(\'search_preference\') ? openSearchPreferenceModal()')
    expect(profileSource).toContain("function openPreferenceModal(){ return openSensitivePreferenceEditor('profile') }")
    expect(profileSource).toContain("function openSearchPreferenceModal(){ return openSensitivePreferenceEditor('search') }")
    expect(profileSource).toContain("user.preference || '미입력'")
    expect(profileSource).toContain("user.search_preference || '미입력'")
    expect(profileSource).toContain('동의하고 설정')
    expect(profileSource).toContain('프로필 표시와 회원이 설정한 조건에 따른 검색·추천')
    expect(profileSource).toContain('거부해도 기본 서비스를 이용할 수 있지만')

    const promptSource = profileSource.slice(
      profileSource.indexOf('async function presentSensitivePreferenceConsentPrompt'),
      profileSource.indexOf('async function ensureSensitivePreferenceConsentForUse'),
    )
    expect(promptSource).not.toContain('<strong>')
    expect(promptSource).not.toContain('<br>')
    expect(promptSource).toContain('【목적】\\n')
    expect(promptSource).toContain('【처리 항목】\\n')
    expect(promptSource).toContain('【거부 영향】\\n')
    expect(promptSource).toContain("{ text: '취소', role: 'cancel' }")
    expect(promptSource).toContain("{ text: '자세히 보기', role: 'details' }")
    expect(promptSource).toContain("{ text: '동의하고 설정', role: 'accept' }")
  })
})

describe('민감정보 동의 403 모달 처리', () => {
  const consentError = {
    response: {
      status: 403,
      data: { code: 'OPTIONAL_CONSENT_REQUIRED', slug: SENSITIVE_INFORMATION_CONSENT_SLUG },
    },
  }

  test('표준 403은 민감정보 동의 필요 오류로만 정확히 식별한다', () => {
    expect(isSensitiveInformationConsentRequiredError(consentError)).toBe(true)
    expect(isSensitiveInformationConsentRequiredError({
      response: { status: 403, data: { code: 'OPTIONAL_CONSENT_REQUIRED', slug: 'contacts-consent' } },
    })).toBe(false)
  })

  test('프로필 성향 저장 403은 동의 안내를 보이고 updated를 emit하지 않는다', async () => {
    document.body.innerHTML = '<ion-app></ion-app>'
    mocks.apiPatch.mockRejectedValue(consentError)
    const wrapper = mount(ModalPreference, { ...modalOptions, props: { message: '', level: '프리미엄회원' } })
    await nextTick()

    document.querySelector<HTMLButtonElement>('.button-group button')?.click()
    await flushPromises()

    expect(mocks.apiPatch).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.error-msg')?.textContent).toContain('민감정보 선택 동의가 필요')
    expect((document.querySelector('.select-box') as HTMLSelectElement).value).toBe('')
    expect(wrapper.emitted('updated')).toBeUndefined()
    wrapper.unmount()
  })

  test('검색 성향 저장 403은 동의 안내를 보이고 updated를 emit하지 않는다', async () => {
    document.body.innerHTML = '<ion-app></ion-app>'
    mocks.apiPatch.mockRejectedValue(consentError)
    const wrapper = mount(SearchPreferenceModal, { ...modalOptions, props: { message: '' } })
    await nextTick()

    const select = document.querySelector('.preference-select') as HTMLSelectElement
    select.value = '이성친구 - 전체'
    select.dispatchEvent(new Event('change'))
    await nextTick()
    document.querySelector<HTMLButtonElement>('.button-group button')?.click()
    await flushPromises()

    expect(mocks.apiPatch).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.error-msg')?.textContent).toContain('민감정보 선택 동의가 필요')
    expect(select.value).toBe('')
    expect(wrapper.emitted('updated')).toBeUndefined()
    wrapper.unmount()
  })

  test('검색 성향은 모달에서 한 번만 저장하고 부모는 성공값만 반영한다', async () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<ion-app></ion-app>'
    mocks.apiPatch.mockResolvedValue({ data: { success: true } })
    const wrapper = mount(SearchPreferenceModal, { ...modalOptions, props: { message: '' } })
    await nextTick()

    const select = document.querySelector('.preference-select') as HTMLSelectElement
    select.value = '이성친구 - 전체'
    select.dispatchEvent(new Event('change'))
    await nextTick()
    document.querySelector<HTMLButtonElement>('.button-group button')?.click()
    await Promise.resolve()
    await vi.runAllTimersAsync()

    expect(mocks.apiPatch).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('updated')).toEqual([['이성친구 - 전체']])
    const parentHandler = profileSource.slice(
      profileSource.indexOf('async function onSearchPreferenceUpdated'),
      profileSource.indexOf('/* 결혼(본인)'),
    )
    expect(parentHandler).not.toContain("axios.patch('/api/search/preference'")
    wrapper.unmount()
  })
})
