require('module-alias/register')

const test = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const VALID_PRODUCTION = {
  NODE_ENV: 'production',
  PORT: '11018',
  MONGO_URI: 'mongodb://127.0.0.1:27017/tzchat',
  SESSION_SECRET: 'test-session-secret',
  JWT_SECRET: 'test-jwt-secret',
  APP_WEB_ORIGIN: 'https://tzchat.tazocode.com',
  API_ORIGIN: 'https://tzchat.tazocode.com',
  PUBLIC_API_ORIGIN: 'https://tzchat.tazocode.com',
  CAPACITOR_APP_ORIGINS: 'https://localhost,capacitor://localhost',
  CORS_ORIGIN: 'https://tzchat.tazocode.com,https://localhost,capacitor://localhost',
  MAIL_PROVIDER: 'tzmail',
  EMAIL_CODE_FIXED: 'false',
  EMAIL_FIXED_LOGIN_ACCOUNTS: 'review@example.com:123456',
  EMAIL_ACCOUNT_ROLE_OVERRIDES: 'admin@example.com:master,review@example.com:user',
  REVIEW_LOGIN_PHONES: '00010000001,00010000002',
  REVIEW_CODE: '123456',
  PHONE_FIXED_LOGIN_ACCOUNTS: '00020000001:654321,99920000002:654321',
  PHONE_ACCOUNT_ROLE_OVERRIDES: '00020000001:master,99920000002:user,01030000003:master',
  SMS_PROVIDER: 'tzphone',
  TZMAIL_BASE_URL: 'http://127.0.0.1:10024/api',
  TZMAIL_APP_ID: 'com.tazocode.com',
  TZMAIL_API_KEY: `tzm_${'a'.repeat(64)}`,
  TZPHONE_BASE_URL: 'http://127.0.0.1:10022/api',
  TZPHONE_APP_ID: 'tzchat',
  TZPHONE_API_KEY: 'test-key',
  FCM_SA_PATH: '',
}

function validate(overrides = {}, { runtime = false } = {}) {
  const env = { ...process.env, ...VALID_PRODUCTION, ...overrides }
  delete env.pm_id
  if (overrides.pm_id !== undefined) env.pm_id = overrides.pm_id
  return spawnSync(
    process.execPath,
    ['-r', 'module-alias/register', '-e', `require('./src/config/validateEnv').validateEnv({ runtime: ${runtime} })`],
    { cwd: ROOT, env, encoding: 'utf8' },
  )
}

function loadFrom(rootDir, nodeEnv, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv }
  if (nodeEnv === undefined) delete env.NODE_ENV
  else env.NODE_ENV = nodeEnv
  return spawnSync(
    process.execPath,
    [
      '-e',
      `const result = require(${JSON.stringify(path.join(ROOT, 'src/config/loadEnv'))}).loadEnv({ rootDir: process.argv[1] }); process.stdout.write(JSON.stringify({ loaded: result.loaded, marker: process.env.ENV_TEST_MARKER, precedence: process.env.ENV_TEST_PRECEDENCE }))`,
      rootDir,
    ],
    { cwd: ROOT, env, encoding: 'utf8' },
  )
}

test('NODE_ENV가 환경 파일보다 먼저 지정되어야 한다', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tzchat-env-'))
  try {
    fs.writeFileSync(path.join(rootDir, '.env.development'), 'ENV_TEST_MARKER=development\n')
    assert.notEqual(loadFrom(rootDir, undefined).status, 0)
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true })
  }
})

test('개발·운영은 공통 비밀 파일 뒤 환경별 파일을 읽고 외부 환경변수를 보존한다', () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tzchat-env-'))
  try {
    fs.writeFileSync(path.join(rootDir, '.env'), 'ENV_TEST_MARKER=common\nENV_TEST_PRECEDENCE=common\n')
    fs.writeFileSync(path.join(rootDir, '.env.development'), 'ENV_TEST_MARKER=development\nENV_TEST_PRECEDENCE=development\n')
    fs.writeFileSync(path.join(rootDir, '.env.production'), 'ENV_TEST_MARKER=production\nENV_TEST_PRECEDENCE=production\n')

    const development = loadFrom(rootDir, 'development')
    assert.equal(development.status, 0)
    assert.deepEqual(JSON.parse(development.stdout), {
      loaded: ['.env', '.env.development'],
      marker: 'development',
      precedence: 'development',
    })

    const production = loadFrom(rootDir, 'production')
    assert.equal(production.status, 0)
    assert.deepEqual(JSON.parse(production.stdout), {
      loaded: ['.env', '.env.production'],
      marker: 'production',
      precedence: 'production',
    })

    const external = loadFrom(rootDir, 'production', { ENV_TEST_PRECEDENCE: 'external' })
    assert.equal(external.status, 0)
    assert.equal(JSON.parse(external.stdout).precedence, 'external')
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true })
  }
})

test('정상 production 환경은 검증에 성공한다', () => {
  assert.equal(validate().status, 0)
})

test('FCM 서비스 계정은 절대경로이며 tzchatback 저장소 외부여야 한다', () => {
  const relative = validate({ FCM_SA_PATH: 'keys/firebase-service-account.json' })
  assert.notEqual(relative.status, 0)
  assert.match(relative.stderr, /FCM_SA_PATH는 반드시 절대경로/)

  const internal = validate({ FCM_SA_PATH: path.join(ROOT, 'keys', 'firebase-service-account.json') })
  assert.notEqual(internal.status, 0)
  assert.match(internal.stderr, /tzchatback 저장소 외부/)

  const external = validate({ FCM_SA_PATH: path.join(os.tmpdir(), 'tzchat-fcm-service-account.json') })
  assert.equal(external.status, 0)
})

test('배포 전 검사는 없는 외부 FCM 경로를 허용하지만 production 런타임은 거부한다', () => {
  const missing = path.join(os.tmpdir(), `tzchat-missing-fcm-${process.pid}.json`)
  assert.equal(validate({ FCM_SA_PATH: missing }).status, 0)

  const runtime = validate({ FCM_SA_PATH: missing }, { runtime: true })
  assert.notEqual(runtime.status, 0)
  assert.match(runtime.stderr, /파일이 없거나 읽을 수 없습니다/)
})

test('production 런타임은 읽을 수 있는 외부 FCM 파일만 허용한다', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tzchat-fcm-runtime-'))
  const credentialPath = path.join(tempDir, 'firebase-service-account.json')
  try {
    fs.writeFileSync(credentialPath, '{}\n')
    assert.equal(validate({ FCM_SA_PATH: credentialPath }, { runtime: true }).status, 0)

    const directory = validate({ FCM_SA_PATH: tempDir }, { runtime: true })
    assert.notEqual(directory.status, 0)
    assert.match(directory.stderr, /읽을 수 있는 파일이어야 합니다/)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('저장소 외부 심볼릭 링크가 tzchatback 내부 파일을 가리키면 거부한다', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tzchat-fcm-link-'))
  const externalLink = path.join(tempDir, 'firebase-service-account.json')
  try {
    fs.symlinkSync(path.join(ROOT, 'package.json'), externalLink)
    const result = validate({ FCM_SA_PATH: externalLink })
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /실제 대상은 tzchatback 저장소 외부/)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test('Firebase 초기화 코드에는 JSON 문자열이나 기본 파일 fallback이 없다', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/services/push/firebase.js'), 'utf8')
  const legacyJsonKey = ['FCM', 'SA', 'JSON'].join('_')
  assert.equal(source.includes(legacyJsonKey), false)
  assert.equal(source.includes('path.join'), false)
  assert.match(source, /validateFcmServiceAccountPath\(process\.env\.FCM_SA_PATH\)/)
})

test('운영 CORS의 와일드카드·추가 Origin·localhost 개발 포트를 거부한다', () => {
  for (const cors of [
    '*',
    'https://tzchat.tazocode.com,https://localhost,capacitor://localhost,https://extra.example.com',
    'https://tzchat.tazocode.com,http://localhost:11017,https://localhost,capacitor://localhost',
  ]) {
    assert.notEqual(validate({ CORS_ORIGIN: cors }).status, 0)
  }
})

test('운영 공개 Origin은 실제 서비스 HTTPS Origin과 정확히 일치해야 한다', () => {
  for (const overrides of [
    { PUBLIC_API_ORIGIN: 'https://api.example.com' },
    { PUBLIC_API_ORIGIN: 'https://tzchat.tazocode.com/api' },
    { API_ORIGIN: 'https://api.example.com' },
    { APP_WEB_ORIGIN: 'https://web.example.com', CORS_ORIGIN: 'https://web.example.com,https://localhost,capacitor://localhost' },
  ]) {
    assert.notEqual(validate(overrides).status, 0)
  }
})

test('폐기된 공개 URL 환경 키를 거부한다', () => {
  for (const key of ['PUBLIC_BASE_URL', 'FILE_BASE_URL', 'API_BASE_URL']) {
    assert.notEqual(validate({ [key]: 'https://legacy.example.com' }).status, 0)
  }
})

test('운영 고정 이메일 인증번호 활성화를 거부한다', () => {
  assert.notEqual(validate({ EMAIL_CODE_FIXED: 'true' }).status, 0)
})

test('계정별 로그인 고정번호와 권한 보정의 올바른 환경변수 형식을 허용한다', () => {
  assert.equal(validate({
    EMAIL_FIXED_LOGIN_ACCOUNTS: 'admin@example.com:000001,user@example.com:123456',
    EMAIL_ACCOUNT_ROLE_OVERRIDES: 'admin@example.com:master,user@example.com:user',
  }).status, 0)
})

test('계정별 정책의 잘못된 이메일·번호·권한·중복 항목을 기동 시 거부한다', () => {
  for (const overrides of [
    { EMAIL_FIXED_LOGIN_ACCOUNTS: 'not-an-email:123456' },
    { EMAIL_FIXED_LOGIN_ACCOUNTS: 'user@example.com:12345' },
    { EMAIL_FIXED_LOGIN_ACCOUNTS: 'user@example.com:123456,user@example.com:654321' },
    { EMAIL_ACCOUNT_ROLE_OVERRIDES: 'admin@example.com:admin' },
    { EMAIL_ACCOUNT_ROLE_OVERRIDES: 'admin@example.com:master,ADMIN@example.com:user' },
  ]) {
    assert.notEqual(validate(overrides).status, 0)
  }
})

test('전화 로그인 정책의 올바른 환경변수 형식을 허용한다', () => {
  assert.equal(validate({
    REVIEW_LOGIN_PHONES: '00010000001,00010000002',
    REVIEW_CODE: '123456',
    PHONE_FIXED_LOGIN_ACCOUNTS: '00020000001:654321,99920000002:654321',
    PHONE_ACCOUNT_ROLE_OVERRIDES: '00020000001:master,99920000002:user,01030000003:master',
  }).status, 0)
})

test('전화 로그인 정책의 잘못된 번호·코드·권한·중복 항목을 기동 시 거부한다', () => {
  for (const overrides of [
    { REVIEW_LOGIN_PHONES: '0101234', REVIEW_CODE: '123456' },
    { REVIEW_LOGIN_PHONES: '00010000001', REVIEW_CODE: '12345' },
    { REVIEW_LOGIN_PHONES: '', REVIEW_CODE: '123456' },
    { PHONE_FIXED_LOGIN_ACCOUNTS: '00020000001:12345' },
    { PHONE_ACCOUNT_ROLE_OVERRIDES: '01030000003:admin' },
    { REVIEW_LOGIN_PHONES: '00010000001', PHONE_FIXED_LOGIN_ACCOUNTS: '00010000001:654321' },
  ]) {
    assert.notEqual(validate(overrides).status, 0)
  }
})

test('운영 dev provider와 잘못된 TZMail 앱 ID·키 형식 및 TZPhone 자격증명 누락을 거부한다', () => {
  assert.notEqual(validate({ MAIL_PROVIDER: 'dev' }).status, 0)
  assert.notEqual(validate({ TZMAIL_APP_ID: 'guessed-app' }).status, 0)
  assert.notEqual(validate({ SMS_PROVIDER: 'mock' }).status, 0)
  assert.notEqual(validate({ TZMAIL_API_KEY: '' }).status, 0)
  assert.notEqual(validate({ TZMAIL_API_KEY: 'wrong-format' }).status, 0)
  assert.notEqual(validate({ TZPHONE_API_KEY: '' }).status, 0)
})

test('운영 TZMail은 같은 서버의 loopback URL만 허용한다', () => {
  assert.notEqual(validate({ TZMAIL_BASE_URL: 'https://tzmail.tazocode.com/api' }).status, 0)
})

test('PM2 직접 실행은 거부하고 ecosystem 표식이 있는 실행만 허용한다', () => {
  assert.notEqual(validate({ pm_id: '0', TZCHAT_PM2_ECOSYSTEM: '' }).status, 0)
  assert.equal(validate({ pm_id: '0', TZCHAT_PM2_ECOSYSTEM: '1' }).status, 0)
})

test('정상 development 환경은 로컬 Origin과 실제 메일·문자 provider를 허용한다', () => {
  const result = validate({
    NODE_ENV: 'development',
    CORS_ORIGIN: 'http://localhost:11017',
    APP_WEB_ORIGIN: 'http://localhost:11017',
    API_ORIGIN: 'http://localhost:11018',
    PUBLIC_API_ORIGIN: 'http://localhost:11018',
    MAIL_PROVIDER: 'tzmail',
    EMAIL_CODE_FIXED: 'false',
    TZMAIL_BASE_URL: 'https://tzmail.tazocode.com/api',
    TZMAIL_APP_ID: 'com.tazocode.com',
    TZMAIL_API_KEY: `tzm_${'b'.repeat(64)}`,
    SMS_PROVIDER: 'tzphone',
    TZPHONE_BASE_URL: 'https://tzphone.tazocode.com/api',
    TZPHONE_APP_ID: 'tzchat',
  })
  assert.equal(result.status, 0)
})

test('development에서도 dev provider와 EMAIL_CODE_FIXED=true를 거부한다', () => {
  const base = {
    NODE_ENV: 'development',
    CORS_ORIGIN: 'http://localhost:11017',
    APP_WEB_ORIGIN: 'http://localhost:11017',
    API_ORIGIN: 'http://localhost:11018',
    PUBLIC_API_ORIGIN: 'http://localhost:11018',
    TZMAIL_BASE_URL: 'https://tzmail.tazocode.com/api',
    TZMAIL_APP_ID: 'com.tazocode.com',
    TZMAIL_API_KEY: `tzm_${'c'.repeat(64)}`,
    SMS_PROVIDER: 'tzphone',
    TZPHONE_BASE_URL: 'https://tzphone.tazocode.com/api',
    TZPHONE_APP_ID: 'tzchat',
  }
  assert.notEqual(validate({ ...base, MAIL_PROVIDER: 'dev' }).status, 0)
  assert.notEqual(validate({ ...base, MAIL_PROVIDER: 'tzmail', EMAIL_CODE_FIXED: 'true' }).status, 0)
  assert.notEqual(validate({ ...base, MAIL_PROVIDER: 'tzmail', SMS_PROVIDER: 'mock' }).status, 0)
  assert.notEqual(validate({ ...base, MAIL_PROVIDER: 'tzmail', TZPHONE_API_KEY: '' }).status, 0)
})
