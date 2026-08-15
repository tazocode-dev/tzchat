const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i

export function isValidPushRoomId(value: unknown): boolean {
  return OBJECT_ID_PATTERN.test(String(value || ''))
}

type PushRouteData = { type?: unknown; roomId?: unknown; deeplink?: unknown }

function parseRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== 'string' || value.length > 10_000) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function normalizeNativePushData(value: unknown, depth = 0): PushRouteData {
  if (depth > 2) return {}
  const record = parseRecord(value)
  const nested = normalizeNativePushData(record.data, depth + 1)
  return {
    type: record.type ?? nested.type,
    roomId: record.roomId ?? nested.roomId,
    deeplink: record.deeplink ?? nested.deeplink,
  }
}

export function nativePushRoute(value: unknown = {}): string {
  const data = normalizeNativePushData(value)
  const deeplink = String(data.deeplink || '')
  if (deeplink.startsWith('tzchat://chat/')) {
    const roomId = deeplink.slice('tzchat://chat/'.length)
    return isValidPushRoomId(roomId) ? `/home/chat/${roomId}` : '/home/6page'
  }
  if (deeplink === 'tzchat://friends/received') return '/home/3page?tab=received'
  if (deeplink === 'tzchat://friends/speed') return '/home/3page?tab=premium'
  if (deeplink === 'tzchat://friends/friends') return '/home/3page?tab=friends'
  if (deeplink === 'tzchat://friends/sent') return '/home/3page?tab=sent'
  if (deeplink === 'tzchat://home') return '/home'
  if (String(data.type || '') === 'chat' && isValidPushRoomId(data.roomId)) return `/home/chat/${data.roomId}`
  if (String(data.type || '').includes('friend') || String(data.type || '').includes('speed')) return '/home/3page'
  return '/home/6page'
}
