const crypto = require('crypto');

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_PRINCIPAL_LIMIT = 5;
const DEFAULT_IP_LIMIT = 30;
const DEFAULT_MAX_PRINCIPALS = 5000;
const DEFAULT_MAX_IPS = 2000;

function normalizeKeyPart(value, maxLength) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .slice(0, maxLength);
}

function normalizeLoginUsername(value) {
  return normalizeKeyPart(value, 128);
}

function normalizeLoginIp(value) {
  return normalizeKeyPart(value, 64) || 'unknown';
}

function hashKey(scope, ...parts) {
  return crypto.createHash('sha256')
    .update([scope, ...parts].join('\u0000'))
    .digest('hex');
}

class LoginAttemptLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || DEFAULT_WINDOW_MS;
    this.principalLimit = options.principalLimit || DEFAULT_PRINCIPAL_LIMIT;
    this.ipLimit = options.ipLimit || DEFAULT_IP_LIMIT;
    this.maxPrincipalEntries = options.maxPrincipalEntries || DEFAULT_MAX_PRINCIPALS;
    this.maxIpEntries = options.maxIpEntries || DEFAULT_MAX_IPS;
    this.now = options.now || (() => Date.now());
    this.principalAttempts = new Map();
    this.ipAttempts = new Map();
  }

  keys(ip, username) {
    const normalizedIp = normalizeLoginIp(ip);
    const normalizedUsername = normalizeLoginUsername(username);
    return {
      principal: hashKey('principal', normalizedIp, normalizedUsername),
      ip: hashKey('ip', normalizedIp),
    };
  }

  prune(map, maxEntries, now) {
    for (const [key, entry] of map) {
      if (entry.resetAt <= now) map.delete(key);
    }
    while (map.size > maxEntries) {
      map.delete(map.keys().next().value);
    }
  }

  cleanup(now = this.now()) {
    this.prune(this.principalAttempts, this.maxPrincipalEntries, now);
    this.prune(this.ipAttempts, this.maxIpEntries, now);
  }

  increment(map, key, maxEntries, now) {
    let entry = map.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + this.windowMs };
    }
    entry.count += 1;
    map.delete(key);
    map.set(key, entry);
    this.prune(map, maxEntries, now);
    return entry;
  }

  resultFor(keys, now) {
    const principal = this.principalAttempts.get(keys.principal);
    const ip = this.ipAttempts.get(keys.ip);
    const limitedEntries = [
      principal?.count >= this.principalLimit ? principal : null,
      ip?.count >= this.ipLimit ? ip : null,
    ].filter(Boolean);
    const maxResetAt = limitedEntries.length
      ? Math.max(...limitedEntries.map(entry => entry.resetAt))
      : 0;
    const retryAfterSeconds = limitedEntries.length
      ? Math.max(1, Math.ceil((maxResetAt - now) / 1000))
      : 0;
    return { limited: limitedEntries.length > 0, retryAfterSeconds };
  }

  check(ip, username) {
    const now = this.now();
    this.cleanup(now);
    return this.resultFor(this.keys(ip, username), now);
  }

  recordFailure(ip, username) {
    const now = this.now();
    this.cleanup(now);
    const keys = this.keys(ip, username);
    this.increment(this.principalAttempts, keys.principal, this.maxPrincipalEntries, now);
    this.increment(this.ipAttempts, keys.ip, this.maxIpEntries, now);
    return this.resultFor(keys, now);
  }

  recordSuccess(ip, username) {
    this.cleanup();
    this.principalAttempts.delete(this.keys(ip, username).principal);
  }

  entryCounts() {
    this.cleanup();
    return { principals: this.principalAttempts.size, ips: this.ipAttempts.size };
  }
}

module.exports = {
  DEFAULT_IP_LIMIT,
  DEFAULT_PRINCIPAL_LIMIT,
  DEFAULT_WINDOW_MS,
  LoginAttemptLimiter,
  normalizeLoginIp,
  normalizeLoginUsername,
};
