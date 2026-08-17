export const SENSITIVE_INFORMATION_CONSENT_SLUG = 'sensitive-information-consent'

type ConsentAction = 'accept' | 'details' | 'cancel'
type HttpClient = {
  get: (url: string, config?: any) => Promise<{ data?: any }>
  post: (url: string, body?: any, config?: any) => Promise<unknown>
}

export async function ensureCurrentSensitivePreferenceConsent(options: {
  client: HttpClient
  prompt: () => Promise<ConsentAction>
  openDetails: () => void | Promise<void>
}): Promise<boolean> {
  const { client, prompt, openDetails } = options
  const activeResponse = await client.get(
    `/api/terms/${encodeURIComponent(SENSITIVE_INFORMATION_CONSENT_SLUG)}/active`,
    { withCredentials: true },
  )
  const active = activeResponse.data?.data ?? activeResponse.data
  const version = String(active?.version || '').trim()
  if (!version) throw new Error('현재 민감정보 선택 동의 버전을 확인할 수 없습니다.')

  const listResponse = await client.get('/api/terms/agreements/list', { withCredentials: true })
  const items = listResponse.data?.data?.items ?? listResponse.data?.items ?? []
  const current = Array.isArray(items)
    ? items.find(item => item?.slug === SENSITIVE_INFORMATION_CONSENT_SLUG)
    : null
  const alreadyAgreed = current?.optedIn === true &&
    current?.sameVersion === true &&
    String(current?.version || '') === version
  if (alreadyAgreed) return true

  const action = await prompt()
  if (action === 'details') {
    await openDetails()
    return false
  }
  if (action !== 'accept') return false

  await client.post('/api/terms/consents', {
    slug: SENSITIVE_INFORMATION_CONSENT_SLUG,
    version,
    optedIn: true,
  }, { withCredentials: true })
  return true
}

export function isSensitiveInformationConsentRequiredError(error: any): boolean {
  return error?.response?.status === 403 &&
    error?.response?.data?.code === 'OPTIONAL_CONSENT_REQUIRED' &&
    error?.response?.data?.slug === SENSITIVE_INFORMATION_CONSENT_SLUG
}
