const test = require('node:test');
const assert = require('node:assert/strict');
const cors = require('cors');

const {
  normalizeOrigin,
  parseCorsOrigins,
  isLoopbackOrPrivateOrigin,
  createOriginVerifier,
} = require('../src/config/corsOrigins');

test('CORS 목록의 공백과 trailing slash를 정규화한다', () => {
  assert.deepEqual(
    parseCorsOrigins(' https://tzchat.tazocode.com/ , https://localhost , capacitor://localhost/ '),
    ['https://tzchat.tazocode.com', 'https://localhost', 'capacitor://localhost']
  );
});

test('정규화 후 중복되는 Origin을 거부한다', () => {
  assert.throws(
    () => parseCorsOrigins('https://tzchat.tazocode.com,https://TZCHAT.TAZOCODE.COM/'),
    /중복 Origin/
  );
});

test('와일드카드와 Origin이 아닌 URL을 거부한다', () => {
  assert.throws(() => parseCorsOrigins('*'), /전체 허용/);
  assert.throws(() => normalizeOrigin('https://tzchat.tazocode.com/api'), /경로/);
  assert.throws(() => normalizeOrigin('capacitor://evil'), /허용되지 않은 Capacitor Origin/);
  assert.throws(() => normalizeOrigin('capacitor://example.com'), /허용되지 않은 Capacitor Origin/);
});

test('loopback 및 사설망 Origin을 식별한다', () => {
  assert.equal(isLoopbackOrPrivateOrigin('https://localhost'), true);
  assert.equal(isLoopbackOrPrivateOrigin('http://10.0.2.2:11017'), true);
  assert.equal(isLoopbackOrPrivateOrigin('http://192.168.0.10'), true);
  assert.equal(isLoopbackOrPrivateOrigin('https://tzchat.tazocode.com'), false);
});

const productionOrigins = [
  'https://tzchat.tazocode.com',
  'https://localhost',
  'capacitor://localhost',
];

test('운영 웹과 Android/iOS 앱 Origin만 정확히 허용한다', async () => {
  const verify = createOriginVerifier(productionOrigins);
  const check = (origin) => new Promise((resolve) => {
    verify(origin, (error, allowed) => resolve({ error, allowed }));
  });

  assert.deepEqual(await check('https://tzchat.tazocode.com'), { error: null, allowed: true });
  assert.deepEqual(await check('https://localhost'), { error: null, allowed: true });
  assert.deepEqual(await check('capacitor://localhost'), { error: null, allowed: true });
  assert.deepEqual(await check(undefined), { error: null, allowed: true });

  for (const origin of ['capacitor://evil', 'capacitor://example.com', 'http://localhost', 'https://evil.example', 'null']) {
    const denied = await check(origin);
    assert.equal(denied.allowed, undefined);
    assert.equal(denied.error.status, 403);
  }
});

test('OPTIONS 응답은 요청 Origin을 정확히 반환하고 미허용 Origin을 거부한다', async () => {
  const options = {
    origin: createOriginVerifier(productionOrigins),
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204,
  };
  const middleware = cors(options);
  const preflight = (origin) => new Promise((resolve) => {
    const responseHeaders = new Map();
    const req = {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    };
    const res = {
      statusCode: 200,
      setHeader: (name, value) => responseHeaders.set(name.toLowerCase(), String(value)),
      getHeader: (name) => responseHeaders.get(name.toLowerCase()),
      removeHeader: (name) => responseHeaders.delete(name.toLowerCase()),
      end: () => resolve({ error: null, status: res.statusCode, headers: responseHeaders }),
    };
    middleware(req, res, (error) => resolve({ error, status: res.statusCode, headers: responseHeaders }));
  });

  for (const origin of productionOrigins) {
    const response = await preflight(origin);
    assert.equal(response.error, null);
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  }

  const denied = await preflight('https://attacker.example');
  assert.equal(denied.error.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), undefined);
});

test('REST와 Socket.IO가 동일한 allowlist 검증 결과를 사용한다', async () => {
  const allowedOrigins = parseCorsOrigins(productionOrigins.join(','));
  const restVerify = createOriginVerifier(allowedOrigins, 'REST CORS blocked');
  const socketVerify = createOriginVerifier(allowedOrigins, 'Socket.IO CORS blocked');

  const check = (verify, origin) => new Promise((resolve) => {
    verify(origin, (error, allowed) => resolve({ blocked: !!error, allowed: allowed === true }));
  });

  for (const origin of [...productionOrigins, 'capacitor://evil', 'https://evil.example', 'null', undefined]) {
    assert.deepEqual(await check(restVerify, origin), await check(socketVerify, origin));
  }
});
