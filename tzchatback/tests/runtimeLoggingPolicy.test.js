process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  formatAccessLog,
  installProductionConsoleGuard,
  normalizeAccessPath,
  sanitizeLogArgs,
} = require('../src/utils/runtimeLogger');

const ROOT = path.resolve(__dirname, '..');

test('운영 오류 로그는 진단 필드만 보존하고 토큰·PII·raw payload를 제거한다', () => {
  const [sanitized] = sanitizeLogArgs([{
    status: 401,
    code: 'AUTH_FAILED',
    message: 'user@example.com 010-1234-5678 Bearer secret-token',
    userId: '507f1f77bcf86cd799439011',
    token: 'secret-token',
    body: { password: 'secret-password' },
    providerPayload: { accessToken: 'provider-secret' },
  }]);

  assert.deepEqual(Object.keys(sanitized).sort(), ['code', 'message', 'status']);
  assert.equal(sanitized.status, 401);
  assert.equal(sanitized.code, 'AUTH_FAILED');
  const output = JSON.stringify(sanitized);
  assert.doesNotMatch(output, /user@example\.com|010-1234-5678|secret-token|507f1f77bcf86cd799439011|secret-password|provider-secret/);
  assert.match(output, /redacted-email/);
  assert.match(output, /redacted-phone/);
  assert.deepEqual(sanitizeLogArgs(['EVENT_LABEL', '비공개닉네임']), ['EVENT_LABEL', '[redacted]']);
});

test('HTTP access 로그는 method·route path·status·duration만 남긴다', () => {
  const normalized = normalizeAccessPath({
    url: '/api/notices/507f1f77bcf86cd799439011?token=secret&nickname=tester',
  });
  assert.equal(normalized, '/api/notices/:id');

  const output = formatAccessLog({
    method: 'get',
    path: '/api/notices/507f1f77bcf86cd799439011?token=secret',
    status: 200,
    durationMs: 12.34,
  });
  assert.equal(output, '[ACCESS] GET /api/notices/:id 200 12.3ms');
  assert.doesNotMatch(output, /token|secret|507f1f77bcf86cd799439011/);
});

test('운영 console guard는 routine 로그를 차단하고 경고·오류를 정제한다', () => {
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  let stdout = '';
  let stderr = '';
  process.stdout.write = chunk => { stdout += String(chunk); return true; };
  process.stderr.write = chunk => { stderr += String(chunk); return true; };

  let restore = () => {};
  try {
    restore = installProductionConsoleGuard({ forceProduction: true });
    console.log('routine', { userId: '507f1f77bcf86cd799439011' });
    console.debug('criteria', { nickname: '비공개닉네임' });
    console.error('provider failed for user@example.com', {
      status: 502,
      code: 'PROVIDER_FAILED',
      response: { token: 'provider-secret' },
    });
  } finally {
    restore();
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }

  assert.equal(stdout, '');
  assert.match(stderr, /PROVIDER_FAILED/);
  assert.match(stderr, /redacted-email/);
  assert.doesNotMatch(stderr, /user@example\.com|provider-secret|507f1f77bcf86cd799439011|비공개닉네임/);
});

test('공개 health 응답과 공지 route가 최소 정보·분리된 조회 경계를 유지한다', () => {
  const appSource = fs.readFileSync(path.join(ROOT, 'src/app.js'), 'utf8');
  const serverSource = fs.readFileSync(path.join(ROOT, 'src/server.js'), 'utf8');
  const routerSource = fs.readFileSync(path.join(ROOT, 'src/routes/system/noticeRouter.js'), 'utf8');
  const serviceSource = fs.readFileSync(path.join(ROOT, 'src/services/system/noticeService.js'), 'utf8');

  assert.match(appSource, /app\.get\('\/api\/health',[\s\S]*?res\.json\(\{ ok: true \}\);[\s\S]*?\n\}\);/);
  assert.doesNotMatch(appSource.match(/app\.get\('\/api\/health',[\s\S]*?\n\}\);/)?.[0] || '', /uptime|pid|\bts\b/);
  assert.match(routerSource, /router\.get\('\/manage\/:id', requireMaster, controller\.getManagedOne\)/);
  assert.match(routerSource, /router\.get\('\/:id', controller\.getPublishedOne\)/);
  assert.match(serviceSource, /Notice\.findOne\(\{ _id: id, isPublished: true \}\)/);
  assert.doesNotMatch(serviceSource, /isMasterFromReq/);
  assert.ok(
    serverSource.indexOf('installProductionConsoleGuard();') < serverSource.indexOf("require('@/app')"),
    '운영 console guard는 app/socket/controller/service 로드보다 먼저 설치되어야 한다',
  );
});
