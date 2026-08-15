// src/lib/api.ts
// -------------------------------------------------------------
// 🌐 런타임 환경 자동 판별
// - 개발 웹: localhost:11018 / 운영 웹: same-origin / Capacitor 앱: 운영 Origin
// - withCredentials, JWT Authorization 헤더 자동 부착
// - ✅ 규칙: 실제 호출 시 경로는 항상 '/api/...' 로 명시
// -------------------------------------------------------------
import axios, {
  type InternalAxiosRequestConfig,
  type AxiosResponse,
  type AxiosError,
  type AxiosRequestConfig,
} from 'axios'
import { API_BASE_URL } from '@/shared/config/runtimeEnvironment'
import { appendNativePushTokenToLogout } from '@/shared/services/nativePushTokenStorage'

const IS_DEV = import.meta.env.DEV
const HTTP_DEBUG = IS_DEV && import.meta.env.VITE_HTTP_DEBUG === 'true'

export type AuthRequestMode = 'optional' | 'bootstrap'
export type AuthAwareRequestConfig = AxiosRequestConfig & {
  authRequestMode?: AuthRequestMode
  expectedErrorStatuses?: number[]
  _retried?: boolean
  _hadAuthCredentials?: boolean
}

// --------------------- utils ---------------------
function stripTrailingSlashes(u: string) { return (u || '').replace(/\/+$/, '') }
function ensureLeadingSlash(p: string) { return p.startsWith('/') ? p : `/${p}` }
function joinUrl(base: string, path: string) {
  const b = stripTrailingSlashes(base || '')
  const p = path.startsWith('/') ? path : `/${path}`
  return `${b}${p}`
}

// 다른 모듈이 base URL 정규화 로직을 별도로 재구현하지 않도록 공개한다 (지침 §3).
export const ENV_BASE = API_BASE_URL
const USE_COOKIES = true

// ------------------ Axios 인스턴스 ----------------
export const api = axios.create({
  baseURL: ENV_BASE,                 // ← 뒤에 '/api' 를 붙이지 않습니다.
  withCredentials: USE_COOKIES,
  headers: { 'Content-Type': 'application/json' },
})

if (HTTP_DEBUG) {
  console.log('%c[HTTP][CFG]', 'color:#0a0;font-weight:bold', {
    runtime: 'development-web',
    baseURL: ENV_BASE,
    withCredentials: USE_COOKIES,
  })
}

// ------------------ 토큰(캐시 + 즉시헤더반영) ------------------
const TOKEN_KEY = 'TZCHAT_AUTH_TOKEN'
const REFRESH_TOKEN_KEY = 'TZCHAT_REFRESH_TOKEN'

// ✅ 웹뷰/localStorage가 느릴 수 있어 메모리 캐시를 둡니다.
let cachedToken: string | null = null
let cachedRefreshToken: string | null = null
let suppressAuthChangeEvent = false
let lastAuthClearEventAt = 0

const PROFILE_IMAGE_CACHE_TTL_MS = 15_000
const profileImageCache = new Map<string, { expiresAt: number; data: any | null }>()
const profileImageRequests = new Map<string, Promise<any | null>>()

const AGREEMENT_STATUS_CACHE_TTL_MS = 3_000
let agreementStatusCache: { expiresAt: number; value: AgreementStatusResponse } | null = null
let agreementStatusRequest: Promise<AgreementStatusResponse> | null = null

function emitAuthCredentialsChanged(cleared: boolean) {
  if (suppressAuthChangeEvent || typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('auth:credentials-changed', { detail: { cleared } }))
}

function readTokenFromStorage(): string | null {
  try {
    const t = localStorage.getItem(TOKEN_KEY)
    return t && t.trim() ? t.trim() : null
  } catch {
    return null
  }
}

function readRefreshTokenFromStorage(): string | null {
  try {
    const t = localStorage.getItem(REFRESH_TOKEN_KEY)
    return t && t.trim() ? t.trim() : null
  } catch {
    return null
  }
}

export function setRefreshToken(tok: string | null) {
  const hadCredentials = !!cachedToken || !!cachedRefreshToken
  const next = tok && String(tok).trim() ? String(tok).trim() : null
  cachedRefreshToken = next
  try {
    if (next) localStorage.setItem(REFRESH_TOKEN_KEY, next)
    else localStorage.removeItem(REFRESH_TOKEN_KEY)
  } catch {}
  const hasCredentials = !!cachedToken || !!cachedRefreshToken
  if (hadCredentials !== hasCredentials) emitAuthCredentialsChanged(!hasCredentials)
}

export function getStoredAuthState() {
  return {
    hasAccessToken: !!getAuthToken(),
    hasRefreshToken: !!getRefreshToken(),
  }
}

export function hasStoredAuthCredentials(): boolean {
  const state = getStoredAuthState()
  return state.hasAccessToken || state.hasRefreshToken
}

function getRefreshToken(): string | null {
  if (cachedRefreshToken) return cachedRefreshToken
  cachedRefreshToken = readRefreshTokenFromStorage()
  return cachedRefreshToken
}

// 앱 시작 시 1회 로드
cachedToken = readTokenFromStorage()
cachedRefreshToken = readRefreshTokenFromStorage()
if (cachedToken) {
  ;(api.defaults.headers as any).Authorization = `Bearer ${cachedToken}`
}

function getAuthToken(): string | null {
  // 캐시가 있으면 캐시 우선
  if (cachedToken) return cachedToken
  // 캐시가 비어있으면 스토리지에서 1회 읽어 캐시에 반영
  cachedToken = readTokenFromStorage()
  return cachedToken
}

// ✅ 외부에서도 쓰는 함수: 저장 + 캐시 + axios 기본헤더 즉시 반영
export function setAuthToken(tok: string | null) {
  const hadCredentials = !!cachedToken || !!cachedRefreshToken
  const next = tok && String(tok).trim() ? String(tok).trim() : null
  cachedToken = next

  try {
    if (next) localStorage.setItem(TOKEN_KEY, next)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {}

  // ✅ 즉시 반영 (다음 요청이 같은 틱에 나가도 헤더 붙게)
  if (next) {
    ;(api.defaults.headers as any).Authorization = `Bearer ${next}`
  } else {
    try { delete (api.defaults.headers as any).Authorization } catch {}
  }
  const hasCredentials = !!cachedToken || !!cachedRefreshToken
  if (hadCredentials !== hasCredentials) emitAuthCredentialsChanged(!hasCredentials)
}

export function clearAuthToken() {
  suppressAuthChangeEvent = true
  try {
    setAuthToken(null)
    setRefreshToken(null)
  } finally {
    suppressAuthChangeEvent = false
  }
  const now = Date.now()
  if (now - lastAuthClearEventAt > 50) {
    lastAuthClearEventAt = now
    emitAuthCredentialsChanged(true)
  }
  profileImageCache.clear()
  profileImageRequests.clear()
  agreementStatusCache = null
  agreementStatusRequest = null
}

// 계정 전환 시 이전 계정의 비정규화된 호환 캐시가 새 계정에 섞이지 않게 한다.
// 사용자별 키로 저장된 검색 기록과 앱 설정은 건드리지 않는다.
export function clearAccountScopedLocalData() {
  const legacyAccountKeys = [
    'userId', 'id', '_id', 'nickname', 'username', 'name',
    'user_level', 'level', 'isPremium',
  ]
  try {
    for (const key of legacyAccountKeys) localStorage.removeItem(key)
  } catch {}
}

// [추가] 안전 리다이렉트 유틸 (router 순환참조 방지)
function safeRedirect(path: string) {
  try {
    import('@/router').then(({ default: router }) => {
      if (router.currentRoute.value.fullPath !== path) router.replace(path)
    }).catch(() => {
      if (window.location.pathname !== path) window.location.href = path
    })
  } catch {
    if (window.location.pathname !== path) window.location.href = path
  }
}

// ------------------ Access Token 갱신 (지침 §3: 동시 갱신 요청을 하나로 합친다) ------------------
// 백엔드가 access token을 2시간으로 짧게 발급하기 시작했으므로, 401을 받으면 즉시 로그인
// 페이지로 보내는 대신 refresh token으로 한 번 갱신을 시도한다. 동시에 여러 요청이 401을
// 받아도 refreshPromise를 공유해 갱신 호출은 한 번만 나간다.
let refreshPromise: Promise<string | null> | null = null

async function performTokenRefresh(): Promise<string | null> {
  const rToken = getRefreshToken()
  try {
    // ⚠️ 응답 인터셉터 재귀를 피하기 위해 공용 `api` 인스턴스가 아닌 순수 axios로 호출한다.
    // localStorage 토큰이 없어도 HttpOnly refresh 쿠키가 있을 수 있으므로 빈 body로 한 번 시도한다.
    const res = await axios.post(
      joinUrl(ENV_BASE, '/api/token/refresh'),
      rToken ? { refreshToken: rToken } : {},
      { withCredentials: USE_COOKIES }
    )
    const newToken = (res?.data as any)?.token ?? null
    const newRefresh = (res?.data as any)?.refreshToken ?? null
    if (!newToken) return null
    setAuthToken(newToken)
    if (newRefresh) setRefreshToken(newRefresh)
    return newToken
  } catch (e: any) {
    console.warn('[AUTH][REFRESH] failed', {
      status: e?.response?.status,
      code: e?.response?.data?.code,
      message: e?.message,
    })
    return null
  }
}

function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = performTokenRefresh().finally(() => { refreshPromise = null })
  }
  return refreshPromise
}

// 요청 인터셉터: 토큰 부착
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAuthToken()
  const authConfig = config as InternalAxiosRequestConfig & AuthAwareRequestConfig
  authConfig._hadAuthCredentials = hasStoredAuthCredentials()
  if (token) {
    config.headers = config.headers || {}
    ;(config.headers as any).Authorization = `Bearer ${token}`
  }
  // 인증정보가 사라지기 전에 현재 기기 토큰만 소유권 조건으로 해제할 수 있게
  // 모든 공용 로그아웃 호출에 자동 포함한다. 다른 기기 토큰은 전달하지 않는다.
  config.data = appendNativePushTokenToLogout(config.url, config.data) as any
  return config
})

// ✅ 응답 인터셉터: 401/423 처리 + 로깅
api.interceptors.response.use(
  (res: AxiosResponse) => {
    if (String(res.config?.url || '').startsWith('/api/logout')) clearAuthToken()
    return res
  },
  (err: AxiosError) => {
    const status = err.response?.status
    const data: any = err.response?.data
    const code = data?.code || data?.errorCode
    const url = (err.config as any)?.url || ''

    const authConfig = err.config as AuthAwareRequestConfig | undefined
    const authRequestMode = authConfig?.authRequestMode
    const isOptionalAuthProbe = authRequestMode === 'optional'
    const isAuthBootstrap = authRequestMode === 'bootstrap'

    // 🔹 공개 API 예외 처리
    const isPublic =
      url.startsWith('/api/terms/') ||
      url.startsWith('/api/login') ||
      url.startsWith('/api/health') ||
      url.startsWith('/api/userinfo')
    const isRefreshCall = url.startsWith('/api/token/refresh')
    const originalConfig = authConfig

    // 선택적 인증 확인은 비록 401이 오더라도 세션 만료 처리/리다이렉트 대상이 아니다.
    if (status === 401 && isOptionalAuthProbe) {
      return Promise.reject(err)
    }

    // 인증 부트스트랩의 /api/me는 기존 refresh 흐름을 한 번 재사용하되,
    // 갱신 실패 시 여기서 먼저 인증정보를 지우거나 리다이렉트하지 않는다.
    if (
      status === 401 &&
      isAuthBootstrap &&
      !isRefreshCall &&
      originalConfig &&
      !originalConfig._retried
    ) {
      originalConfig._retried = true
      return refreshAccessToken().then((newToken) => {
        if (!newToken) {
          console.warn('[HTTP][ERR]', {
            status,
            url,
            message: err.message,
            data: err.response?.data,
          })
          return Promise.reject(err)
        }
        originalConfig.headers = {
          ...(originalConfig.headers as any),
          Authorization: `Bearer ${newToken}`,
        }
        return api.request(originalConfig)
      })
    }

    // 401: access token 만료/부재 → refresh token으로 한 번 갱신 후 원요청 재시도.
    // 갱신마저 실패(리프레시 토큰 없음/만료)하면 인증정보만 정리하고 로그인으로 보낸다
    // (지침 §3: "갱신 실패 시 인증정보만 정리" - 사용자 데이터/다른 localStorage 키는 건드리지 않음).
    if (status === 401 && !isPublic && !isAuthBootstrap && !isRefreshCall && originalConfig && !originalConfig._retried) {
      originalConfig._retried = true
      return refreshAccessToken().then((newToken) => {
        if (!newToken) {
          clearAuthToken()
          const current = window.location.pathname + window.location.search
          safeRedirect(`/login?redirect=${encodeURIComponent(current)}`)
          console.warn('[HTTP][ERR]', {
            status,
            url,
            message: err.message,
            data: err.response?.data,
          })
          return Promise.reject(err)
        }
        originalConfig.headers = { ...(originalConfig.headers as any), Authorization: `Bearer ${newToken}` }
        return api.request(originalConfig)
      })
    }

    if (status === 401 && !isPublic && !isAuthBootstrap) {
      clearAuthToken()
      const current = window.location.pathname + window.location.search
      safeRedirect(`/login?redirect=${encodeURIComponent(current)}`)
    }

    // 423: 탈퇴신청 상태 → 전용 페이지로
    if (status === 423 || code === 'PENDING_DELETION') {
      safeRedirect('/account/deletion-pending')
    }

    // 서버가 세션 도중 새 필수 약관 또는 잘못된 프로필 상태를 발견한 경우에도
    // 현재 화면에 머물지 않고 완료 흐름으로 복귀한다.
    if (status === 403 && code === 'AGREEMENTS_REQUIRED') {
      const current = window.location.pathname + window.location.search
      safeRedirect(`/legal/consent?return=${encodeURIComponent(current)}`)
    } else if (status === 403 && code === 'ONBOARDING_REQUIRED') {
      const current = window.location.pathname + window.location.search
      safeRedirect(`/onboarding?return=${encodeURIComponent(current)}`)
    }

    const isExpectedError = status !== undefined && authConfig?.expectedErrorStatuses?.includes(status)
    if (!isExpectedError) {
      console.warn('[HTTP][ERR]', {
        status,
        url,
        message: err.message,
        isAxiosError: (err as any).isAxiosError,
        data: err.response?.data
      })
    }
    return Promise.reject(err)
  }
)

// ------------------ 경로 정규화 래퍼 ----------------
type HttpResponse<T = any> = Promise<AxiosResponse<T>>
function norm(p: string) { return ensureLeadingSlash(p || '/') }

// 요청 로그에는 값이 아니라 바디의 필드명만 남긴다 (지침 §4: "로그에 토큰이나 개인정보를 출력하지 않는다").
// 이전에는 data(비밀번호/탈퇴사유 등 실제 값 포함 가능)를 그대로 콘솔에 찍고 있었다.
function fieldNamesOnly(data: any): string[] | undefined {
  if (!data || typeof data !== 'object') return undefined
  return Object.keys(data)
}

export const http = {
  get<T = any>(url: string, config?: AxiosRequestConfig): HttpResponse<T> {
    const path = norm(url)
    if (HTTP_DEBUG) console.log('[HTTP][REQ]', { method: 'GET', url: joinUrl(ENV_BASE, path), params: config?.params, withCredentials: USE_COOKIES })
    return api.get<T>(path, config)
  },
  post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): HttpResponse<T> {
    const path = norm(url)
    if (HTTP_DEBUG) console.log('[HTTP][REQ]', { method: 'POST', url: joinUrl(ENV_BASE, path), params: config?.params, dataFields: fieldNamesOnly(data), withCredentials: USE_COOKIES })
    return api.post<T>(path, data, config)
  },
  put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): HttpResponse<T> {
    const path = norm(url)
    if (HTTP_DEBUG) console.log('[HTTP][REQ]', { method: 'PUT', url: joinUrl(ENV_BASE, path), params: config?.params, dataFields: fieldNamesOnly(data), withCredentials: USE_COOKIES })
    return api.put<T>(path, data, config)
  },
  patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): HttpResponse<T> {
    const path = norm(url)
    if (HTTP_DEBUG) console.log('[HTTP][REQ]', { method: 'PATCH', url: joinUrl(ENV_BASE, path), params: config?.params, dataFields: fieldNamesOnly(data), withCredentials: USE_COOKIES })
    return api.patch<T>(path, data, config)
  },
  delete<T = any>(url: string, config?: AxiosRequestConfig): HttpResponse<T> {
    const path = norm(url)
    if (HTTP_DEBUG) console.log('[HTTP][REQ]', { method: 'DELETE', url: joinUrl(ENV_BASE, path), params: config?.params, withCredentials: USE_COOKIES })
    return api.delete<T>(path, config)
  },
}

// ------------------ 인증 편의 함수 ----------------
export const auth = {
  async login(body: { username: string; password: string }) {
    const res = await api.post('/api/login', body)
    const token = (res?.data as any)?.token ?? (res?.data as any)?.data?.token ?? null
    const refreshToken = (res?.data as any)?.refreshToken ?? (res?.data as any)?.data?.refreshToken ?? null
    if (token) setAuthToken(token)
    if (refreshToken) setRefreshToken(refreshToken)
    return res
  },
  me() { return api.get('/api/me') },
  async logout() {
    try { await api.post('/api/logout') } finally { clearAuthToken() }
  },
  // ------------------ 전화번호 인증 로그인 ----------------
  requestPhoneCode(phone: string) {
    return api.post('/api/auth/phone/request', { phone })
  },
  async verifyPhoneCode(phone: string, code: string) {
    const res = await api.post('/api/auth/phone/verify', { phone, code })
    const token = (res?.data as any)?.token ?? (res?.data as any)?.data?.token ?? null
    const refreshToken = (res?.data as any)?.refreshToken ?? (res?.data as any)?.data?.refreshToken ?? null
    if (token) setAuthToken(token)
    if (refreshToken) setRefreshToken(refreshToken)
    return res
  },
  requestPublicPhoneChangeEmail(body: { currentPhone: string; currentEmail: string }) {
    return api.post('/api/auth/phone/change/email/request', body)
  },
  requestPublicPhoneChangeSms(body: { currentPhone: string; currentEmail: string; newPhone: string; emailCode: string }) {
    return api.post('/api/auth/phone/change/sms/request', body)
  },
  commitPublicPhoneChange(body: {
    currentPhone: string
    currentEmail: string
    newPhone: string
    emailCode: string
    smsCode: string
  }) {
    return api.post('/api/auth/phone/change/commit', body)
  },
  // 기존 이메일 계정 호환용 API
  requestEmailCode(email: string) {
    return api.post('/api/auth/email/request', { email })
  },
  async verifyEmailCode(email: string, code: string) {
    const res = await api.post('/api/auth/email/verify', { email, code })
    const token = (res?.data as any)?.token ?? (res?.data as any)?.data?.token ?? null
    const refreshToken = (res?.data as any)?.refreshToken ?? (res?.data as any)?.data?.refreshToken ?? null
    if (token) setAuthToken(token)
    if (refreshToken) setRefreshToken(refreshToken)
    return res
  },
}

export type OnboardingStep = 'birthDate' | 'gender' | 'complete'
export type OnboardingStatus = {
  complete: boolean
  nextStep: OnboardingStep
  hasBirthYear: boolean
  /** 이전 앱 버전 호환 필드 */
  hasBirthDate: boolean
  hasGender: boolean
  birthyear: number | null
  gender: 'man' | 'woman' | null
}

export const onboarding = {
  async status(): Promise<OnboardingStatus> {
    const { data } = await api.get('/api/onboarding/status')
    return data?.data
  },
  async saveBirthYear(birthYear: number): Promise<OnboardingStatus> {
    const { data } = await api.patch('/api/onboarding/birth-year', { birthYear })
    return data?.data
  },
  async saveGender(gender: 'man' | 'woman'): Promise<OnboardingStatus> {
    const { data } = await api.patch('/api/onboarding/gender', { gender })
    return data?.data
  },
}

// ------------------ 약관/동의/관리자 API ----------------
export const getActiveTerms = () => http.get('/api/terms/active')
export const getActiveTermBySlug = (slug: string) => {
  const s = encodeURIComponent(String(slug || ''))
  return http.get(`/api/terms/${s}/active`)
}
export const getTermVersions = (slug: string) => {
  const s = encodeURIComponent(String(slug || ''))
  return http.get(`/api/terms/${s}/versions`)
}

export type PendingConsentItem = {
  slug: string
  title?: string
  isRequired?: boolean
  hasRecord?: boolean
  sameVersion?: boolean
}
export type AgreementStatusResponse = { data: { pending: PendingConsentItem[] } }

async function fetchAgreementStatus(): Promise<AgreementStatusResponse> {
  // 1) 최신 엔드포인트: 정확한 pending
  try {
    const { data } = await http.get('/api/terms/agreements/status')
    const pending: PendingConsentItem[] = data?.data?.pending ?? []
    return { data: { pending } }
  } catch (e) {
    if (HTTP_DEBUG) console.warn('[agreements] status 미가용 → list로 폴백')
  }

  // 2) 폴백1: list 사용 + pending=true 필터
  try {
    const { data } = await http.get('/api/terms/agreements/list')
    const items: any[] = data?.data?.items ?? []
    const pending: PendingConsentItem[] = items
      .filter(i => i?.pending === true)
      .map(i => ({
        slug: i.slug,
        title: i.title,
        isRequired: !!(i.isRequired ?? i.defaultRequired),
      }))
    return { data: { pending } }
  } catch (e) {
    if (HTTP_DEBUG) console.warn('[agreements] list 미가용 → require-consent로 폴백')
  }

  // 3) 폴백2: 구버전(필수만 표시됨)
  const [reqRes, actRes] = await Promise.all([
    http.get('/api/terms/require-consent'),
    http.get('/api/terms/active'),
  ])
  const requiredSlugs: string[] = reqRes.data?.requiredSlugs ?? []
  const actives: any[] = actRes.data?.data ?? []
  const bySlug: Record<string, any> = {}
  for (const a of actives) if (!bySlug[a.slug]) bySlug[a.slug] = a
  const pending: PendingConsentItem[] = requiredSlugs.map(slug => ({
    slug,
    title: bySlug[slug]?.title,
    isRequired: !!bySlug[slug]?.defaultRequired,
  }))
  return { data: { pending } }
}

export const getAgreementStatus = (
  options: { force?: boolean } = {},
): Promise<AgreementStatusResponse> => {
  const now = Date.now()
  if (!options.force && agreementStatusCache && agreementStatusCache.expiresAt > now) {
    return Promise.resolve(agreementStatusCache.value)
  }
  if (!options.force && agreementStatusRequest) return agreementStatusRequest

  const request = fetchAgreementStatus().then((value) => {
    agreementStatusCache = {
      expiresAt: Date.now() + AGREEMENT_STATUS_CACHE_TTL_MS,
      value,
    }
    return value
  })

  if (!options.force) {
    agreementStatusRequest = request.finally(() => {
      agreementStatusRequest = null
    })
    return agreementStatusRequest
  }
  return request
}

export const getUserProfileImages = (userId: string): Promise<any | null> => {
  const id = String(userId || '').trim()
  if (!id) return Promise.resolve(null)

  const cached = profileImageCache.get(id)
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.data)

  const existing = profileImageRequests.get(id)
  if (existing) return existing

  const request = api.get(`/api/users/${encodeURIComponent(id)}/profile/images`, {
    withCredentials: true,
    expectedErrorStatuses: [404],
  } as AuthAwareRequestConfig)
    .then(({ data }) => {
      profileImageCache.set(id, {
        expiresAt: Date.now() + PROFILE_IMAGE_CACHE_TTL_MS,
        data,
      })
      return data
    })
    .catch((error: any) => {
      if (error?.response?.status === 404) {
        profileImageCache.set(id, {
          expiresAt: Date.now() + PROFILE_IMAGE_CACHE_TTL_MS,
          data: null,
        })
        return null
      }
      throw error
    })
    .finally(() => {
      profileImageRequests.delete(id)
    })

  profileImageRequests.set(id, request)
  return request
}

export const acceptAgreements = async (slugs: string[]) => {
  agreementStatusCache = null
  try {
    await http.post('/api/terms/agreements/accept', { slugs })
    agreementStatusCache = null
    return { ok: true }
  } catch (e) {
    console.warn('[agreements] accept 배치 미가용 → consents 개별 저장으로 폴백')
    const tasks = slugs.map(async (slug) => {
      const s = encodeURIComponent(String(slug || ''))
      const { data } = await http.get(`/api/terms/${s}/active`)
      const version = data?.data?.version ?? data?.version
      if (!version) throw new Error(`활성 버전을 찾을 수 없습니다: ${slug}`)
      await http.post('/api/terms/consents', { slug, version, optedIn: true })
    })
    await Promise.all(tasks)
    agreementStatusCache = null
    return { ok: true }
  }
}

export const adminCreateTerms = (payload: {
  slug: string
  title: string
  version: string
  content: string
  kind: 'page' | 'consent'
  defaultRequired?: boolean
  effectiveAt?: string
}) => http.post('/api/admin/terms', payload)

export const adminListTerms = (q?: { slug?: string; active?: 'true' | 'false'; kind?: 'page' | 'consent' }) =>
  http.get('/api/admin/terms', { params: q })

export default api
export const AuthAPI = auth
