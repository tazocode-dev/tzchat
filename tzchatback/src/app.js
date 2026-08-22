// src/app.js
// -------------------------------------------------------------
// Express 앱 조립(미들웨어/CORS/세션/JWT 파서/라우터/에러 핸들러).
// http 서버 생성과 Socket.IO 초기화는 src/server.js가 담당한다(관심사 분리).
// ⚠️ 이 파일이 require되는 시점에는 이미 .env가 로드되어 있어야 한다
//    (src/server.js가 dotenv 설정 후 이 파일을 require하는 순서를 지킨다).
// -------------------------------------------------------------
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const jwt = require('jsonwebtoken');

const { validateEnv } = require('@/config/validateEnv');
const { parseCorsOrigins, createOriginVerifier } = require('@/config/corsOrigins');
const { JWT_SECRET, SESSION_SECRET } = require('@/config/secrets');
const { fail: respondFail } = require('@/utils/response');
const { extractHttpToken } = require('@/utils/authToken');
const { logAccess, normalizeAccessPath, reportError } = require('@/utils/runtimeLogger');

validateEnv();

console.log('[ENV] NODE_ENV=', process.env.NODE_ENV);

const MONGO_URI = process.env.MONGO_URI;

const app = express();
app.disable('x-powered-by');

// 프로젝트 루트 기준 경로(app.js는 src/ 아래에 있으므로 한 단계 위로)
const ROOT_DIR = path.join(__dirname, '..');

// ⚠️ (신규) 채팅방 참여자 조회용 모델 로드
const ChatRoom = require('@/models/Chat/ChatRoom');

// =======================================
// 0) 파서 & 정적 경로 & 기본 로깅
// =======================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
console.log('📦 JSON 및 URL-Encoded 파서 활성화');

/**
 * ✅ /public 정적 파일 서빙
 * - public 폴더가 없으면 종료하지 않고 경고 후 건너뜁니다.
 * - 루트(/)에 직접 물지 않고 /public 경로에만 매핑해 SPA와 충돌 방지.
 */
const publicDir = path.join(ROOT_DIR, 'public');
if (fs.existsSync(publicDir)) {
  app.use('/public', express.static(publicDir));
  console.log('🗂️  /public 정적 서빙 활성화:', publicDir);
} else {
  console.warn('ℹ️  "public" 폴더가 없어 정적 서빙을 건너뜁니다. (운영에서 정상일 수 있음)');
}

/**
 * ✅ /uploads 정적 서빙(루트)
 */
const uploadsRoot = path.resolve(process.env.UPLOAD_ROOT || path.join(ROOT_DIR, 'uploads'));
if (!fs.existsSync(uploadsRoot)) {
  fs.mkdirSync(uploadsRoot, { recursive: true });
  console.warn('ℹ️  uploads 폴더가 없어서 생성했습니다:', uploadsRoot);
}
app.use('/uploads', express.static(uploadsRoot));
console.log('🖼️  /uploads 정적 서빙 활성화:', uploadsRoot);

// 하위 호환
app.use('/uploads/profile', express.static(path.join(uploadsRoot, 'profile')));
app.use('/uploads/chat', express.static(path.join(uploadsRoot, 'chat')));

// 공통 요청 로그: query/body/token/사용자 식별자를 제외한 라우트 패턴만 남긴다.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    logAccess({
      method: req.method,
      path: normalizeAccessPath(req),
      status: res.statusCode,
      durationMs: ms,
    });
  });
  next();
});

// =======================================
// CORS
// =======================================

// 허용 목록은 CORS_ORIGIN 한 곳에서만 관리한다.
const allowedOriginsList = parseCorsOrigins(process.env.CORS_ORIGIN);
const verifyCorsOrigin = createOriginVerifier(allowedOriginsList, 'Not allowed by CORS');

const corsOptions = {
  origin: verifyCorsOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'X-Requested-With'],
  maxAge: 600,
  optionsSuccessStatus: 204,
};

app.use((req, res, next) => { res.setHeader('Vary', 'Origin'); next(); });
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions), (req, res) => res.sendStatus(204));

console.log('🛡️  CORS 허용(ENV allowlist):', allowedOriginsList.join(', '));

// =======================================
// 실행 모드
// =======================================
const isProd = process.env.NODE_ENV === 'production' || process.env.USE_TLS === '1';
const isCapAppMode = process.env.APP_MODE === 'capacitor' || process.env.FORCE_MOBILE_SESSION === '1';
console.log('🧭 실행 모드:', isProd ? 'PROD(HTTPS 프록시 뒤)' : 'DEV', '| 앱세션강제:', isCapAppMode);

// =======================================
// 1) 세션 설정 + ✅ JWT 파서
// =======================================
app.set('trust proxy', 1);

const sessionStore = MongoStore.create({
  mongoUrl: MONGO_URI,
  ttl: 60 * 60 * 24,
});

const cookieForProd = {
  httpOnly: true,
  maxAge: 1000 * 60 * 60 * 24,
  sameSite: 'none',
  secure: true,
  path: '/',
};
const cookieForDevWeb = {
  httpOnly: true,
  maxAge: 1000 * 60 * 60 * 24,
  sameSite: 'lax',
  secure: false,
  path: '/',
};

const isSecureMode = isProd || isCapAppMode;
const cookieConfig = isSecureMode ? cookieForProd : cookieForDevWeb;

const sessionMiddleware = session({
  name: 'tzchat.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: cookieConfig,
});

app.use((req, res, next) => {
  const origin = req.headers.origin || '(no-origin)';
  const xfProto = req.headers['x-forwarded-proto'] || '(none)';
  console.log('🍪 [SessionCookiePolicy] origin=', origin, '| sameSite=', cookieConfig.sameSite, '| secure=', cookieConfig.secure, '| xfp=', xfProto);
  if (cookieConfig.secure === true && xfProto !== 'https') {
    console.warn('⚠️ secure 쿠키 모드인데 X-Forwarded-Proto !== https 입니다. Nginx proxy_set_header X-Forwarded-Proto $scheme; 확인 필요');
  }
  next();
});

app.use(sessionMiddleware);
app.set('sessionStore', sessionStore);
console.log('🔐 세션 설정 완료:', cookieConfig);

// ---------------------------------------
// ✅ JWT 파서/검증 미들웨어
// ---------------------------------------
app.use((req, res, next) => {
  const token = extractHttpToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      _id: payload._id || payload.sub || null,
      username: payload.username || null,
      nickname: payload.nickname || null,
      roles: payload.roles || [],
    };
    req.auth = { type: 'jwt', tokenMasked: token.slice(0, 8) + '***' };
  } catch (err) {
    console.log('[AUTH][ERR]', { step: 'jwt.verify', code: err.name, message: err.message });
  }
  next();
});

// 디버그 라우트는 개발 환경에서만 노출한다.
if (!isProd) app.get('/debug/echo', (req, res) => {
  res.json({ ok: true, gotCookieHeader: !!req.headers.cookie });
});
if (!isProd) app.get('/debug/session', (req, res) => {
  res.json({
    ok: true,
    hasSession: Boolean(req.sessionID),
    sessionUserId: req.session?.user?._id || null,
    jwtUserId: req.user?._id || null,
  });
});
if (!isProd) app.get('/debug/set-cookie', (req, res) => {
  const value = Date.now().toString(36);
  res.cookie('tzchat_test', value, {
    httpOnly: true,
    sameSite: cookieConfig.sameSite,
    secure: cookieConfig.secure,
    path: '/',
  });
  res.json({ ok: true, set: true });
});

// ✅ 헬스 체크
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// =======================================
// 2) 라우터 등록
// =======================================
require('@/routes')(app);

// ✅ 중앙 not-found 미들웨어 (지침 §4: "중앙 not-found 및 error middleware를 유지한다")
app.use((req, res, next) => {
  respondFail(res, 404, 'NOT_FOUND', '요청한 API를 찾을 수 없습니다.');
});

/* ---------------------------------------
 * 🧯 전역 에러 핸들러
 *  - JSON 500 응답에서 사용자 메시지와 내부 진단 로그를 분리한다 (지침 §4)
 * ------------------------------------- */
app.use((err, req, res, next) => {
  reportError('UNHANDLED_REQUEST', err, {
    method: req.method,
    path: normalizeAccessPath(req),
    status: Number(err?.status || 500),
  });
  if (err && err.status === 403 && err.message === 'Not allowed by CORS') {
    return respondFail(res, 403, 'CORS_ORIGIN_DENIED', '허용되지 않은 요청 Origin입니다.');
  }
  respondFail(res, 500, 'UNHANDLED', '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
});

module.exports = { app, sessionMiddleware, allowedOriginsList, ChatRoom };
