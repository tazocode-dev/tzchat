// CORS Origin parsing is shared by startup validation, Express, and Socket.IO.
// Keep this strict: CORS is not authentication, but an imprecise allowlist still
// exposes browser-readable responses to origins we did not intend to trust.

const WEB_PROTOCOLS = new Set(['http:', 'https:']);
const CAPACITOR_PROTOCOL = 'capacitor:';
const ALLOWED_CAPACITOR_ORIGINS = new Set(['capacitor://localhost']);

function normalizeOrigin(value, label = 'Origin') {
  const raw = String(value || '').trim();
  if (!raw) throw new Error(`${label} 값이 비어 있습니다.`);
  if (raw === '*') throw new Error(`${label}에 전체 허용(*)을 사용할 수 없습니다.`);

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label}이 올바른 URL Origin이 아닙니다: "${raw}"`);
  }

  const hasInvalidPath = url.pathname !== '' && url.pathname !== '/';
  if (url.username || url.password || hasInvalidPath || url.search || url.hash) {
    throw new Error(`${label}에는 경로, 쿼리, 해시 또는 사용자 정보가 없어야 합니다: "${raw}"`);
  }

  if (WEB_PROTOCOLS.has(url.protocol)) return url.origin;

  if (url.protocol === CAPACITOR_PROTOCOL) {
    const origin = `${url.protocol}//${url.host}`;
    if (!ALLOWED_CAPACITOR_ORIGINS.has(origin)) {
      throw new Error(`${label}에 허용되지 않은 Capacitor Origin이 지정됐습니다: "${raw}"`);
    }
    return origin;
  }

  throw new Error(`${label}은 http, https 또는 명시적으로 허용된 Capacitor Origin이어야 합니다: "${raw}"`);
}

function parseCorsOrigins(value) {
  const entries = String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!entries.length) throw new Error('CORS_ORIGIN 허용 목록이 비어 있습니다.');

  const origins = [];
  const seen = new Set();
  for (const [index, entry] of entries.entries()) {
    const origin = normalizeOrigin(entry, `CORS_ORIGIN[${index}]`);
    if (seen.has(origin)) {
      throw new Error(`CORS_ORIGIN에 중복 Origin이 있습니다: "${origin}"`);
    }
    seen.add(origin);
    origins.push(origin);
  }
  return origins;
}

function isLoopbackOrPrivateOrigin(origin) {
  const { hostname } = new URL(origin);
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '::1' || host.endsWith('.localhost')) return true;
  if (/^127(?:\.\d{1,3}){3}$/.test(host)) return true;

  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((part) => part > 255)) return false;
  return octets[0] === 10
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
    || (octets[0] === 169 && octets[1] === 254);
}

function createOriginVerifier(allowedOrigins, deniedMessage = 'Origin is not allowed') {
  const allowed = new Set(allowedOrigins);
  return (origin, callback) => {
    if (!origin || allowed.has(origin)) return callback(null, true);
    const error = new Error(deniedMessage);
    error.status = 403;
    return callback(error);
  };
}

module.exports = {
  ALLOWED_CAPACITOR_ORIGINS,
  normalizeOrigin,
  parseCorsOrigins,
  isLoopbackOrPrivateOrigin,
  createOriginVerifier,
};
