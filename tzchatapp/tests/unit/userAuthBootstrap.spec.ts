// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('localStorage', {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
})

const apiGet = vi.fn()
const clearAuthToken = vi.fn()
const getStoredAuthState = vi.fn()

vi.mock('@/shared/services/api', () => ({
  default: { get: apiGet, post: vi.fn(), patch: vi.fn() },
  clearAuthToken,
  getStoredAuthState,
}))

const { createPinia, setActivePinia } = await import('pinia')
const { useUserStore } = await import('@/shared/stores/user')

const me = {
  _id: 'user-1',
  nickname: 'tester',
  role: 'user' as const,
  user_level: '베타회원' as const,
}

describe('user auth bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    useUserStore().clear()
  })

  it('uses one /api/userinfo request and no /api/me request for an anonymous user', async () => {
    getStoredAuthState.mockReturnValue({ hasAccessToken: false, hasRefreshToken: false })
    apiGet.mockResolvedValueOnce({ data: { ok: true, loggedIn: false } })

    const store = useUserStore()
    const [first, second] = await Promise.all([
      store.bootstrapAuth(),
      store.bootstrapAuth(),
    ])

    expect(first.status).toBe('anonymous')
    expect(second.status).toBe('anonymous')
    expect(apiGet).toHaveBeenCalledTimes(1)
    expect(apiGet).toHaveBeenCalledWith('/api/userinfo', expect.any(Object))
    expect(apiGet).not.toHaveBeenCalledWith('/api/me', expect.anything())
  })

  it('restores a cookie-only session with /api/userinfo followed by one /api/me', async () => {
    getStoredAuthState.mockReturnValue({ hasAccessToken: false, hasRefreshToken: false })
    apiGet
      .mockResolvedValueOnce({ data: { ok: true, loggedIn: true, via: 'session' } })
      .mockResolvedValueOnce({ data: { ok: true, user: me } })

    const result = await useUserStore().bootstrapAuth()

    expect(result).toMatchObject({ status: 'authenticated', user: me })
    expect(apiGet.mock.calls.map(([url]) => url)).toEqual(['/api/userinfo', '/api/me'])
  })

  it('uses one /api/me request when local credentials exist', async () => {
    getStoredAuthState.mockReturnValue({ hasAccessToken: true, hasRefreshToken: true })
    apiGet.mockResolvedValueOnce({ data: { ok: true, user: me } })

    const result = await useUserStore().bootstrapAuth()

    expect(result.status).toBe('authenticated')
    expect(apiGet).toHaveBeenCalledTimes(1)
    expect(apiGet).toHaveBeenCalledWith('/api/me', expect.any(Object))
  })

  it('marks existing credentials expired and clears only auth credentials after a final 401', async () => {
    getStoredAuthState.mockReturnValue({ hasAccessToken: true, hasRefreshToken: true })
    apiGet.mockRejectedValueOnce({
      response: { status: 401, data: { message: '인증이 만료되었습니다.' } },
    })

    const result = await useUserStore().bootstrapAuth()

    expect(result.status).toBe('expired')
    expect(clearAuthToken).toHaveBeenCalledTimes(1)
  })
})
