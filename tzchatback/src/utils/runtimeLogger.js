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
  'configured',
  'success',
  'failure',
]);

const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

let guardInstalled = false;

function sanitizeLogText(value) {
  return String(value ?? '')
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted-token]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted-token]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(?:\+?82[-\s]?)?0?1[016789](?:[-\s]?\d){7,8}/g, '[redacted-phone]')
    .replace(/\b[0-9a-f]{24}\b/gi, '[redacted-id]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[redacted-ip]')
    .replace(/(https?:\/\/[^\s?]+)\?[^\s]+/gi, '$1?[redacted-query]')
    .replace(/\b\d{6,}\b/g, '[redacted-number]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 500);
}

function sanitizeLogValue(value, depth = 0) {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return sanitizeLogText(value);
  if (value instanceof Error) {
    return {
      name: sanitizeLogText(value.name || 'Error'),
      ...(value.code ? { code: sanitizeLogText(value.code) } : {}),
      message: sanitizeLogText(value.message || 'Unknown error'),
    };
  }
  if (depth >= 2 || Array.isArray(value)) return '[redacted]';
  if (typeof value === 'object') {
    const safe = {};
    for (const [key, nested] of Object.entries(value)) {
      if (!SAFE_DETAIL_KEYS.has(key)) continue;
      safe[key] = sanitizeLogValue(nested, depth + 1);
    }
    return Object.keys(safe).length ? safe : '[redacted]';
  }
  return sanitizeLogText(value);
}

function sanitizeLogArgs(args) {
  return (Array.isArray(args) ? args : [args]).map((value, index) => {
    // 첫 문자열은 정적 이벤트 라벨로 취급하되, 뒤따르는 raw message/payload 문자열은 폐기한다.
    if (index > 0 && typeof value === 'string') return '[redacted]';
    return sanitizeLogValue(value);
  });
}

function normalizeAccessPath(req) {
  const routePath = req?.route?.path;
  const baseUrl = String(req?.baseUrl || '');
  if (routePath) return `${baseUrl}${String(routePath)}` || '/';

  const raw = String(req?.path || req?.url || '/').split('?')[0] || '/';
  return raw
    .replace(/\/[0-9a-f]{24}(?=\/|$)/gi, '/:id')
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}(?=\/|$)/gi, '/:id')
    .replace(/\/\d{4,}(?=\/|$)/g, '/:id')
    .replace(/[\r\n\t]/g, '')
    .slice(0, 240);
}

function installProductionConsoleGuard({ forceProduction = false } = {}) {
  const production = forceProduction || process.env.NODE_ENV === 'production';
  if (!production || guardInstalled) return () => {};

  guardInstalled = true;
  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};
  console.warn = (...args) => originalConsole.warn(...sanitizeLogArgs(args));
  console.error = (...args) => originalConsole.error(...sanitizeLogArgs(args));

  return () => {
    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.debug = originalConsole.debug;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    guardInstalled = false;
  };
}

function formatAccessLog({ method, path, status, durationMs }) {
  const safeMethod = String(method || 'UNKNOWN').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 12);
  const safePath = sanitizeLogText(normalizeAccessPath({ path: path || '/' }));
  const safeStatus = Number.isInteger(status) ? status : 0;
  const safeDuration = Number.isFinite(durationMs) ? Number(durationMs).toFixed(1) : '0.0';
  return `[ACCESS] ${safeMethod} ${safePath} ${safeStatus} ${safeDuration}ms`;
}

function logAccess(details) {
  originalConsole.log(formatAccessLog(details));
}

function reportError(event, error, details = {}) {
  const safeError = error instanceof Error
    ? sanitizeLogValue(error)
    : sanitizeLogValue({
        name: error?.name || 'Error',
        code: error?.code,
        message: error?.message || 'Non-error value thrown',
      });
  originalConsole.error(
    `[ERROR] ${sanitizeLogText(event || 'UNEXPECTED')}`,
    safeError,
    sanitizeLogValue(details),
  );
}

module.exports = {
  installProductionConsoleGuard,
  formatAccessLog,
  logAccess,
  normalizeAccessPath,
  reportError,
  sanitizeLogArgs,
  sanitizeLogText,
  sanitizeLogValue,
};
