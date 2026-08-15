// config/validateEnv.js
// -------------------------------------------------------------
// 기동 시점 설정 검증 (지침 §3: "설정 오류는 첫 요청까지 미루지 않고 시작 단계에서 발견한다").
// - 필수값 누락, 잘못된 NODE_ENV/PORT, 운영에서 localhost가 남아있는 경우를 즉시 차단한다.
// -------------------------------------------------------------

function fail(msg) {
  console.error(`❌ [config/validateEnv] ${msg}`);
  process.exit(1);
}

function looksLocal(value) {
  return /localhost|127\.0\.0\.1|(?:^|\D)10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}/i.test(String(value || ''));
}

function isEnabled(value) {
  return /^(?:1|true|yes|on)$/i.test(String(value || '').trim());
}

function requireExactOrigins(actual, expected, label) {
  if (actual.length !== expected.length || expected.some((origin) => !actual.includes(origin))) {
    fail(`${label}은 다음 Origin만 정확히 포함해야 합니다: ${expected.join(', ')}`);
  }
}

function requireHttpsOrigin(value, key) {
  let url;
  try { url = new URL(String(value || '')); }
  catch { fail(`${key}가 올바른 URL이 아닙니다.`); }
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    fail(`${key}는 경로 없는 HTTPS Origin이어야 합니다.`);
  }
  return url.origin;
}

const {
  ALLOWED_CAPACITOR_ORIGINS,
  parseCorsOrigins,
  isLoopbackOrPrivateOrigin,
} = require('./corsOrigins');
const { validateEmailAuthPolicyEnv } = require('./emailAuthPolicy');
const { validatePhoneAuthPolicyEnv } = require('./phoneAuthPolicy');
const { validateFcmServiceAccountPath } = require('./fcmServiceAccountPath');

const ANDROID_CAPACITOR_ORIGIN = 'https://localhost';
const EXPECTED_TZMAIL_APP_ID = 'com.tazocode.com';
const LOCAL_TZMAIL_BASE_URL = 'https://tzmail.tazocode.com/api';
const PRODUCTION_TZMAIL_BASE_URL = 'http://127.0.0.1:10024/api';
const TZMAIL_API_KEY_PATTERN = /^tzm_[a-f0-9]{64}$/;
const EXPECTED_TZPHONE_APP_ID = 'tzchat';
const LOCAL_TZPHONE_BASE_URL = 'https://tzphone.tazocode.com/api';
const PRODUCTION_TZPHONE_BASE_URL = 'http://127.0.0.1:10022/api';
const PRODUCTION_PUBLIC_ORIGIN = 'https://tzchat.tazocode.com';
const DEPRECATED_PUBLIC_URL_KEYS = ['PUBLIC_BASE_URL', 'FILE_BASE_URL', 'API_BASE_URL'];

function validateEnv({ runtime = false } = {}) {
  const nodeEnv = process.env.NODE_ENV;
  if (!['development', 'production', 'test'].includes(nodeEnv)) {
    fail(`NODE_ENV 값이 올바르지 않습니다: "${nodeEnv}" (development|production|test 중 하나여야 합니다)`);
  }

  const port = Number(process.env.PORT || 11018);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    fail(`PORT 값이 올바르지 않습니다: "${process.env.PORT}"`);
  }

  const required = ['MONGO_URI', 'SESSION_SECRET', 'JWT_SECRET', 'CORS_ORIGIN'];
  for (const key of required) {
    if (!process.env[key] || !String(process.env[key]).trim()) {
      fail(`필수 환경변수 ${key}가 비어 있습니다.`);
    }
  }

  const deprecatedPublicUrlKey = DEPRECATED_PUBLIC_URL_KEYS.find(
    key => String(process.env[key] || '').trim()
  );
  if (deprecatedPublicUrlKey) {
    fail(`${deprecatedPublicUrlKey}는 폐기되었습니다. PUBLIC_API_ORIGIN을 사용해야 합니다.`);
  }

  try {
    validateFcmServiceAccountPath(process.env.FCM_SA_PATH, {
      requireReadableFile: runtime && nodeEnv === 'production',
    });
  } catch (error) {
    fail(error.message);
  }

  let corsOrigins;
  try {
    corsOrigins = parseCorsOrigins(process.env.CORS_ORIGIN);
  } catch (error) {
    fail(error.message);
  }

  const mailProvider = String(process.env.MAIL_PROVIDER || '').trim().toLowerCase();
  const smsProvider = String(process.env.SMS_PROVIDER || '').trim().toLowerCase();
  const apnsEnvironment = String(process.env.APNS_ENV || '').trim().toLowerCase();
  const apnsCredentialKeys = ['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_BUNDLE_ID', 'APNS_PRIVATE_KEY'];
  const configuredApnsCredentials = apnsCredentialKeys.filter(key => String(process.env[key] || '').trim());
  if (apnsEnvironment && !['sandbox', 'production'].includes(apnsEnvironment)) {
    fail('APNS_ENV는 sandbox 또는 production이어야 합니다.');
  }
  if ((apnsEnvironment || configuredApnsCredentials.length) && (!apnsEnvironment || configuredApnsCredentials.length !== apnsCredentialKeys.length)) {
    fail('APNs를 사용하려면 APNS_ENV와 APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, APNS_PRIVATE_KEY를 모두 설정해야 합니다.');
  }
  if (!['dev', 'tzmail'].includes(mailProvider)) {
    fail('MAIL_PROVIDER는 dev 또는 tzmail이어야 합니다.');
  }
  if (!['mock', 'tzphone'].includes(smsProvider)) {
    fail('SMS_PROVIDER는 mock 또는 tzphone이어야 합니다.');
  }
  if (nodeEnv !== 'test' && isEnabled(process.env.EMAIL_CODE_FIXED)) {
    fail('로컬·운영 런타임에서는 EMAIL_CODE_FIXED=true를 사용할 수 없습니다.');
  }
  if (nodeEnv !== 'test' && mailProvider !== 'tzmail') {
    fail('로컬·운영 런타임은 MAIL_PROVIDER=tzmail을 사용해야 합니다.');
  }
  if (nodeEnv === 'test' && !['dev', 'tzmail'].includes(mailProvider)) {
    fail('자동화 테스트는 MAIL_PROVIDER=dev 또는 tzmail만 사용할 수 있습니다.');
  }

  try {
    validateEmailAuthPolicyEnv();
    validatePhoneAuthPolicyEnv();
  } catch (error) {
    fail(error.message);
  }

  if (mailProvider === 'tzmail') {
    for (const key of ['TZMAIL_BASE_URL', 'TZMAIL_APP_ID', 'TZMAIL_API_KEY']) {
      if (!String(process.env[key] || '').trim()) fail(`${key}가 비어 있습니다.`);
    }
    if (String(process.env.TZMAIL_APP_ID).trim() !== EXPECTED_TZMAIL_APP_ID) {
      fail(`TZMAIL_APP_ID는 TZMail에 등록된 ${EXPECTED_TZMAIL_APP_ID}여야 합니다.`);
    }
    if (!TZMAIL_API_KEY_PATTERN.test(String(process.env.TZMAIL_API_KEY).trim())) {
      fail('TZMAIL_API_KEY 형식이 올바르지 않습니다.');
    }
  }

  if (smsProvider === 'tzphone') {
    for (const key of ['TZPHONE_BASE_URL', 'TZPHONE_APP_ID', 'TZPHONE_API_KEY']) {
      if (!String(process.env[key] || '').trim()) fail(`${key}가 비어 있습니다.`);
    }
    if (String(process.env.TZPHONE_APP_ID).trim() !== EXPECTED_TZPHONE_APP_ID) {
      fail(`TZPHONE_APP_ID는 TZPhone에 등록된 ${EXPECTED_TZPHONE_APP_ID}이어야 합니다.`);
    }
  }

  if (nodeEnv === 'development') {
    const expectedWebOrigin = 'http://localhost:11017';
    const expectedApiOrigin = 'http://localhost:11018';
    requireExactOrigins(corsOrigins, [expectedWebOrigin], '개발 CORS_ORIGIN');
    if (process.env.APP_WEB_ORIGIN !== expectedWebOrigin) fail(`개발 APP_WEB_ORIGIN은 ${expectedWebOrigin}이어야 합니다.`);
    for (const key of ['API_ORIGIN', 'PUBLIC_API_ORIGIN']) {
      if (process.env[key] !== expectedApiOrigin) fail(`개발 ${key}은 ${expectedApiOrigin}이어야 합니다.`);
    }
    if (mailProvider !== 'tzmail' || smsProvider !== 'tzphone') {
      fail('개발 환경은 MAIL_PROVIDER=tzmail, SMS_PROVIDER=tzphone을 사용해야 합니다.');
    }
    if (process.env.TZMAIL_BASE_URL !== LOCAL_TZMAIL_BASE_URL) {
      fail(`개발 TZMAIL_BASE_URL은 ${LOCAL_TZMAIL_BASE_URL}이어야 합니다.`);
    }
    if (process.env.TZPHONE_BASE_URL !== LOCAL_TZPHONE_BASE_URL) {
      fail(`개발 TZPHONE_BASE_URL은 ${LOCAL_TZPHONE_BASE_URL}이어야 합니다.`);
    }
  }

  if (nodeEnv === 'production') {
    // MONGO_URI는 DB가 백엔드와 같은 서버에 동거(127.0.0.1)하는 배포 방식이 실제로 쓰이고 있어
    // localhost 여부만으로 차단하지 않는다. 브라우저/클라이언트가 직접 접근하는 origin만 검증한다.
    const configuredCapacitorOriginValues = [process.env.CAPACITOR_APP_ORIGINS].filter(Boolean);

    if (!configuredCapacitorOriginValues.length) {
      fail('운영(NODE_ENV=production)에서 CAPACITOR_APP_ORIGINS가 비어 있습니다.');
    }

    let capacitorAppOrigins;
    try {
      capacitorAppOrigins = [...new Set(
        configuredCapacitorOriginValues.flatMap((value) => parseCorsOrigins(value))
      )];
    } catch (error) {
      fail(error.message);
    }

    const allowedAppOrigins = new Set([
      ANDROID_CAPACITOR_ORIGIN,
      ...ALLOWED_CAPACITOR_ORIGINS,
    ]);

    for (const requiredOrigin of allowedAppOrigins) {
      if (!capacitorAppOrigins.includes(requiredOrigin)) {
        fail(`CAPACITOR_APP_ORIGINS에 필수 앱 Origin(${requiredOrigin})이 포함되어야 합니다.`);
      }
    }

    for (const origin of capacitorAppOrigins) {
      if (!allowedAppOrigins.has(origin)) {
        fail(`운영 Capacitor Origin에 허용되지 않은 값이 있습니다: ${origin}`);
      }
      if (!corsOrigins.includes(origin)) {
        fail(`CORS_ORIGIN에 Capacitor Origin(${origin})이 포함되어야 합니다.`);
      }
    }

    // Android(https://localhost)와 iOS(capacitor://localhost)는 위의 exact 목록에
    // 명시된 경우에만 허용한다. 그 외 사설/loopback Origin은 계속 차단한다.
    const unexpectedPrivateOrigin = corsOrigins.find(
      (origin) => isLoopbackOrPrivateOrigin(origin) && !capacitorAppOrigins.includes(origin)
    );
    if (unexpectedPrivateOrigin) {
      fail(`운영 CORS_ORIGIN에 허용되지 않은 로컬/사설 Origin이 있습니다: ${unexpectedPrivateOrigin}`);
    }
    if (looksLocal(process.env.API_ORIGIN) || looksLocal(process.env.APP_WEB_ORIGIN) || looksLocal(process.env.PUBLIC_API_ORIGIN)) {
      fail('운영(NODE_ENV=production)에서 API_ORIGIN/APP_WEB_ORIGIN/PUBLIC_API_ORIGIN 중 localhost 값이 남아 있습니다.');
    }

    const webOrigin = requireHttpsOrigin(process.env.APP_WEB_ORIGIN, 'APP_WEB_ORIGIN');
    const apiOrigin = requireHttpsOrigin(process.env.API_ORIGIN, 'API_ORIGIN');
    const publicApiOrigin = requireHttpsOrigin(process.env.PUBLIC_API_ORIGIN, 'PUBLIC_API_ORIGIN');
    for (const [key, origin] of [
      ['APP_WEB_ORIGIN', webOrigin],
      ['API_ORIGIN', apiOrigin],
      ['PUBLIC_API_ORIGIN', publicApiOrigin],
    ]) {
      if (origin !== PRODUCTION_PUBLIC_ORIGIN) {
        fail(`운영 ${key}은 ${PRODUCTION_PUBLIC_ORIGIN}이어야 합니다.`);
      }
    }
    requireExactOrigins(corsOrigins, [webOrigin, ...allowedAppOrigins], '운영 CORS_ORIGIN');

    if (mailProvider !== 'tzmail' || smsProvider !== 'tzphone') {
      fail('운영 환경은 MAIL_PROVIDER=tzmail, SMS_PROVIDER=tzphone을 사용해야 합니다.');
    }
    if (isEnabled(process.env.EMAIL_CODE_FIXED)) {
      fail('운영 환경에서는 고정 이메일 인증번호를 활성화할 수 없습니다.');
    }

    if (process.env.TZMAIL_BASE_URL !== PRODUCTION_TZMAIL_BASE_URL) {
      fail(`운영 TZMAIL_BASE_URL은 ${PRODUCTION_TZMAIL_BASE_URL}이어야 합니다.`);
    }
    if (process.env.TZPHONE_BASE_URL !== PRODUCTION_TZPHONE_BASE_URL) {
      fail(`운영 TZPHONE_BASE_URL은 ${PRODUCTION_TZPHONE_BASE_URL}이어야 합니다.`);
    }

    // PM2에서는 ecosystem의 안전 설정을 거치지 않은 직접 실행을 거부한다.
    if (process.env.pm_id !== undefined && process.env.TZCHAT_PM2_ECOSYSTEM !== '1') {
      fail('운영 PM2 프로세스는 ecosystem.config.cjs를 통해서만 실행해야 합니다.');
    }

  }
}

module.exports = { validateEnv };
