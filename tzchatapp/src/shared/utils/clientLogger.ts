const SAFE_DETAIL_KEYS = new Set([
  'code',
  'message',
  'name',
  'status',
  'step',
  'reason',
  'operation',
  'event',
  'method',
  'path',
  'durationMs',
  'count',
])

const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
}

let guardInstalled = false

export function sanitizeClientLogText(value: unknown): string {
  return String(value ?? '')
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted-token]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted-token]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(?:\+?82[-\s]?)?0?1[016789](?:[-\s]?\d){7,8}/g, '[redacted-phone]')
    .replace(/\b[0-9a-f]{24}\b/gi, '[redacted-id]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[redacted-ip]')
    .replace(/(https?:\/\/[^\s?]+)\?[^\s]+/gi, '$1?[redacted-query]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 400)
}

export function sanitizeClientLogValue(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') return sanitizeClientLogText(value)
  if (value instanceof Error) {
    const candidate = value as Error & { code?: unknown; status?: unknown }
    return {
      name: sanitizeClientLogText(candidate.name || 'Error'),
      ...(candidate.code ? { code: sanitizeClientLogText(candidate.code) } : {}),
      ...(candidate.status ? { status: Number(candidate.status) || 0 } : {}),
      message: sanitizeClientLogText(candidate.message || 'Unknown error'),
    }
  }
  if (depth >= 2 || Array.isArray(value)) return '[redacted]'
  if (typeof value === 'object') {
    const safe: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (!SAFE_DETAIL_KEYS.has(key)) continue
      safe[key] = sanitizeClientLogValue(nested, depth + 1)
    }
    return Object.keys(safe).length ? safe : '[redacted]'
  }
  return sanitizeClientLogText(value)
}

export function sanitizeClientLogArgs(args: unknown[]): unknown[] {
  return args.map((value, index) => {
    // 첫 문자열은 정적 이벤트 라벨로 취급하되, 뒤따르는 raw message/payload 문자열은 폐기한다.
    if (index > 0 && typeof value === 'string') return '[redacted]'
    return sanitizeClientLogValue(value)
  })
}

export function configureClientConsole({ forceProduction = false } = {}): () => void {
  const production = forceProduction || import.meta.env.PROD
  if (!production || guardInstalled) return () => {}

  guardInstalled = true
  console.log = () => {}
  console.info = () => {}
  console.debug = () => {}
  console.warn = (...args: unknown[]) => originalConsole.warn(...sanitizeClientLogArgs(args))
  console.error = (...args: unknown[]) => originalConsole.error(...sanitizeClientLogArgs(args))

  return () => {
    console.log = originalConsole.log
    console.info = originalConsole.info
    console.debug = originalConsole.debug
    console.warn = originalConsole.warn
    console.error = originalConsole.error
    guardInstalled = false
  }
}
