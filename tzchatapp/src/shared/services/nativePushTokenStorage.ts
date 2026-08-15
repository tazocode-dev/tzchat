export const NATIVE_PUSH_TOKEN_KEY = 'TZCHAT_NATIVE_PUSH_TOKEN'

export function readStoredNativePushToken(): string {
  try { return localStorage.getItem(NATIVE_PUSH_TOKEN_KEY)?.trim() || '' } catch { return '' }
}

export function writeStoredNativePushToken(token: string): void {
  try { localStorage.setItem(NATIVE_PUSH_TOKEN_KEY, token) } catch {}
}

export function clearStoredNativePushToken(): void {
  try { localStorage.removeItem(NATIVE_PUSH_TOKEN_KEY) } catch {}
}

export function appendNativePushTokenToLogout(
  url: unknown,
  data: unknown,
  token = readStoredNativePushToken(),
): unknown {
  if (!String(url || '').startsWith('/api/logout') || !token) return data
  const body = data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  return { ...body, nativePushToken: token }
}
