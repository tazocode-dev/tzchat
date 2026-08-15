const crypto = require('crypto');
const http2 = require('http2');
const DEFAULT_TIMEOUT_MS = 9000;

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function apnsConfig() {
  const keyId = String(process.env.APNS_KEY_ID || '').trim();
  const teamId = String(process.env.APNS_TEAM_ID || '').trim();
  const bundleId = String(process.env.APNS_BUNDLE_ID || '').trim();
  const privateKey = String(process.env.APNS_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  const environment = String(process.env.APNS_ENV || '').trim().toLowerCase();
  const environmentValid = ['sandbox', 'production'].includes(environment);
  return {
    keyId,
    teamId,
    bundleId,
    privateKey,
    environment,
    environmentValid,
    host: environment === 'sandbox'
      ? 'https://api.sandbox.push.apple.com'
      : environment === 'production' ? 'https://api.push.apple.com' : '',
    ready: Boolean(environmentValid && keyId && teamId && bundleId && privateKey),
  };
}

function makeProviderToken(config, nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: config.keyId }));
  const claims = base64url(JSON.stringify({ iss: config.teamId, iat: nowSeconds }));
  const unsigned = `${header}.${claims}`;
  const signature = crypto.sign('sha256', Buffer.from(unsigned), {
    key: config.privateKey,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  return `${unsigned}.${signature}`;
}

function buildApnsPayload(payload = {}) {
  return {
    aps: {
      alert: { title: String(payload.title || '손끝'), body: String(payload.body || '새 알림이 있습니다.') },
      sound: 'default',
      badge: 1,
      'thread-id': String(payload.type || 'tzchat'),
    },
    data: {
      type: String(payload.type || ''),
      roomId: String(payload.roomId || ''),
      deeplink: String(payload.deeplink || ''),
    },
  };
}

async function sendApns(token, payload, dependencies = {}) {
  const config = apnsConfig();
  if (!config.environmentValid && config.keyId && config.teamId && config.bundleId && config.privateKey) {
    return { sent: false, reason: 'invalid_environment' };
  }
  if (!config.ready) return { sent: false, reason: 'not_configured' };
  const connect = dependencies.connect || http2.connect;
  const timeoutMs = Number(dependencies.timeoutMs || DEFAULT_TIMEOUT_MS);
  const client = connect(config.host);
  try {
    const body = JSON.stringify(buildApnsPayload(payload));
    const response = await new Promise((resolve, reject) => {
      let settled = false;
      let timer;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        client.removeListener('error', onError);
        callback(value);
      };
      const onError = error => finish(reject, error);
      client.once('error', onError);
      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        authorization: `bearer ${makeProviderToken(config)}`,
        'apns-topic': config.bundleId,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      });
      let data = '';
      let status = 0;
      req.setEncoding('utf8');
      req.on('response', headers => { status = Number(headers[':status'] || 0); });
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => finish(resolve, { status, data }));
      req.on('error', onError);
      timer = setTimeout(() => {
        const error = new Error(`APNs request timed out after ${timeoutMs}ms`);
        error.code = 'APNS_TIMEOUT';
        try { req.close(http2.constants.NGHTTP2_CANCEL); } catch {}
        try { client.destroy(); } catch {}
        finish(reject, error);
      }, timeoutMs);
      req.end(body);
    });
    if (response.status === 200) return { sent: true };
    let reason = '';
    try { reason = JSON.parse(response.data || '{}').reason || ''; } catch {}
    return { sent: false, status: response.status, reason };
  } finally {
    if (!client.destroyed) client.close();
  }
}

module.exports = { DEFAULT_TIMEOUT_MS, apnsConfig, buildApnsPayload, makeProviderToken, sendApns };
