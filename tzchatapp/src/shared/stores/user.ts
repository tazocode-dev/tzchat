import { defineStore } from 'pinia'
import api, {
  clearAuthToken,
  getStoredAuthState,
  type AuthAwareRequestConfig,
} from '@/shared/services/api'

export type UserLevel = '베타회원' | '일반회원' | '라이트회원' | '프리미엄회원'
export type UserRole = 'user' | 'master'
export type Gender = 'man' | 'woman' | 'male' | 'female' | '남성' | '여성' | '' | null | undefined

export interface MeUser {
  _id: string
  username?: string
  nickname: string
  role: UserRole
  birthDate?: string | null
  birthyear?: number | null
  gender?: Gender
  profileOnboardingCompletedAt?: string | null
  onboarding?: {
    complete: boolean
    nextStep: 'birthDate' | 'gender' | 'complete'
    hasBirthYear: boolean
    hasBirthDate: boolean
    hasGender: boolean
  }
  user_level: UserLevel
  suspended?: boolean
  [key: string]: any
}

export type AuthBootstrapStatus = 'authenticated' | 'anonymous' | 'expired' | 'unavailable'

export interface AuthBootstrapResult {
  status: AuthBootstrapStatus
  user: MeUser | null
  error?: string
}

type MeResponse =
  | { ok: true; user: MeUser }
  | { success: true; data: { user: MeUser } }
  | { user: MeUser }
  | any

function extractUser(payload: MeResponse): MeUser | null {
  const user =
    payload?.user ??
    payload?.data?.user ??
    (payload && typeof payload === 'object' && ('_id' in payload || 'user' in payload)
      ? payload.user ?? payload
      : null)
  return user ?? null
}

/** ✅ 인증 부트스트랩과 /api/me 결과를 함께 공유하는 TTL/inflight 캐시 */
const _meCache = {
  checkedAt: 0,
  user: null as MeUser | null,
  credentialKey: '',
  result: null as AuthBootstrapResult | null,
  inflight: null as { credentialKey: string; promise: Promise<AuthBootstrapResult> } | null,
}
const ME_CACHE_TTL_MS = 30_000

function currentCredentialKey(): string {
  const { hasAccessToken, hasRefreshToken, credentialRevision = 0 } = getStoredAuthState()
  return `${hasAccessToken ? 1 : 0}:${hasRefreshToken ? 1 : 0}:${credentialRevision}`
}

export const useUserStore = defineStore('user', {
  state: () => ({
    user: null as MeUser | null,
    authStatus: 'unavailable' as AuthBootstrapStatus,
    loading: false as boolean,
    error: '' as string,

    // 소켓 바인딩 상태
    _socketBound: false as boolean,
  }),

  getters: {
    isAuthed: (s) => !!s.user?._id,
    isMaster: (s) => String(s.user?.role || '').toLowerCase() === 'master',
    levelLabel: (s) => s.user?.user_level ?? '베타회원',
    genderSimple: (s): 'male' | 'female' => {
      const g = String(s.user?.gender || '').toLowerCase()
      if (g.includes('여') || g === 'female') return 'female'
      return 'male'
    },
  },

  actions: {
    setUser(u: MeUser | null) {
      const nu = u
      this.user = nu
      // ✅ 캐시도 함께 최신화
      _meCache.user = nu
      _meCache.checkedAt = Date.now()
      if (nu?._id) {
        this.authStatus = 'authenticated'
        _meCache.credentialKey = currentCredentialKey()
        _meCache.result = { status: 'authenticated', user: nu }
      }
    },

    clear() {
      this.user = null
      this.authStatus = 'anonymous'
      this.error = ''
      this.loading = false
      this._socketBound = false

      // ✅ 캐시 초기화
      _meCache.checkedAt = 0
      _meCache.user = null
      _meCache.credentialKey = ''
      _meCache.result = null
      _meCache.inflight = null

    },

    /**
     * 앱 전역 인증 부트스트랩.
     * - 로컬 자격 증명이 없으면 /api/userinfo로 쿠키/세션만 확인한다.
     * - 인증 상태일 때만 /api/me를 호출하고, 동시 호출은 inflight를 공유한다.
     */
    async bootstrapAuth(opts?: { force?: boolean; silent?: boolean }): Promise<AuthBootstrapResult> {
      const force = !!opts?.force
      const silent = !!opts?.silent
      const now = Date.now()
      const credentialKey = currentCredentialKey()

      if (
        !force &&
        _meCache.result &&
        _meCache.credentialKey === credentialKey &&
        _meCache.checkedAt &&
        now - _meCache.checkedAt < ME_CACHE_TTL_MS
      ) {
        if (_meCache.result.user && this.user?._id !== _meCache.result.user._id) {
          this.user = _meCache.result.user
        }
        this.authStatus = _meCache.result.status
        return _meCache.result
      }

      if (_meCache.inflight?.credentialKey === credentialKey) {
        return await _meCache.inflight.promise
      }

      const request = (async () => {
        const [hasAccessToken, hasRefreshToken] = credentialKey.split(':')
        const startedWithCredentials = hasAccessToken === '1' || hasRefreshToken === '1'
        let sessionReportedLoggedIn = false
        const isCurrentCredential = () => currentCredentialKey() === credentialKey

        const commit = (result: AuthBootstrapResult): AuthBootstrapResult => {
          if (!isCurrentCredential()) return result
          this.authStatus = result.status
          _meCache.result = result
          _meCache.user = result.user
          _meCache.checkedAt = Date.now()
          _meCache.credentialKey = currentCredentialKey()
          return result
        }

        try {
          if (!silent) {
            if (isCurrentCredential()) {
              this.loading = true
              this.error = ''
            }
          }

          if (!startedWithCredentials) {
            const info = await api.get(
              '/api/userinfo',
              {
                withCredentials: true,
                authRequestMode: 'optional',
              } as AuthAwareRequestConfig
            )
            sessionReportedLoggedIn = info?.data?.loggedIn === true
            if (!sessionReportedLoggedIn) {
              if (isCurrentCredential()) this.user = null
              return commit({ status: 'anonymous', user: null })
            }
          }

          const res = await api.get(
            '/api/me',
            {
              withCredentials: true,
              authRequestMode: 'bootstrap',
            } as AuthAwareRequestConfig
          )
          const u = extractUser(res?.data)
          if (!u?._id) throw new Error('NO_USER')

          if (isCurrentCredential()) this.user = u
          return commit({ status: 'authenticated', user: u })
        } catch (e: any) {
          const status = e?.response?.status
          const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || 'AUTH_UNAVAILABLE'

          if (status === 401) {
            if (isCurrentCredential()) {
              this.error = msg
              this.user = null
            }
            if (startedWithCredentials || sessionReportedLoggedIn) {
              if (isCurrentCredential()) clearAuthToken()
              return commit({ status: 'expired', user: null, error: msg })
            }
            return commit({ status: 'anonymous', user: null })
          }

          if (isCurrentCredential()) this.error = msg
          const currentUser = isCurrentCredential() ? this.user ?? _meCache.user : null
          return commit({ status: 'unavailable', user: currentUser, error: msg })
        } finally {
          if (!silent && isCurrentCredential()) this.loading = false
        }
      })()

      const inflight = { credentialKey, promise: request }
      _meCache.inflight = inflight

      try {
        return await request
      } finally {
        if (_meCache.inflight === inflight) _meCache.inflight = null
      }
    },

    /** 기존 컴포넌트 API를 유지하면서 중앙 인증 inflight/캐시를 재사용한다. */
    async fetchMe(opts?: { force?: boolean; silent?: boolean }): Promise<MeUser | null> {
      const result = await this.bootstrapAuth(opts)
      if (result.status === 'authenticated') return result.user
      if (result.status === 'unavailable') return result.user ?? this.user
      return null
    },

    /** 소켓에서 내 정보 변경을 받아 인증 사용자 상태를 갱신한다. */
    bindSocket(io: any) {
      if (this._socketBound || !io) return
      this._socketBound = true

      io.on('connect', () => {
        // ✅ 재연결 직후 정합성은 "백그라운드(silent)"로만
        // (TTL 캐시가 있어 폭주 방지)
        try { this.fetchMe({ silent: true }) } catch {}
      })

      io.on('me:update', (data: any) => {
        const u = extractUser(data)
        if (u) this.setUser(u)
      })
    },
  },
})
