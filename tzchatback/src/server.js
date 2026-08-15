// src/server.js
// 🌐 tzchat 백엔드 진입점 — env 로딩 → DB 연결 → Express 앱 → http 서버 → Socket.IO → 스케줄러 → listen
// (main.js를 지침/다른 서비스 컨벤션에 맞춰 app.js/socket/index.js/server.js로 분리했다.)

// NODE_ENV는 npm/PM2가 먼저 지정한다. 개발·운영 모두 서버 전용 공통 비밀값 .env를
// 먼저 읽고 환경별 설정을 덧붙이며, 셸/PM2 환경변수가 항상 우선한다.
const { loadEnv } = require('./config/loadEnv');
const loadedEnv = loadEnv();
// DB 연결이나 라우터 로드 전에 잘못된 FCM 자격증명 경로를 포함한 환경 설정을 거부한다.
require('./config/validateEnv').validateEnv({ runtime: true });
console.log(`[ENV] ${loadedEnv.nodeEnv} 환경 파일 ${loadedEnv.loaded.length}개 적용됨`);

require('module-alias/register');

const http = require('http');

async function startServer() {
  const { connectDatabase } = require('@/config/database');
  await connectDatabase();

  const { app, sessionMiddleware, allowedOriginsList, ChatRoom } = require('@/app');

  const server = http.createServer(app);

  const { initSocket } = require('@/socket');
  initSocket(server, { app, sessionMiddleware, allowedOriginsList, ChatRoom });

  // ★ 스케줄러 로드 (앱 구동 시 1회)
  require('@/jobs/retentionWorker');
  require('@/jobs/dailyScoreJob').initDailyScoreCron();

  process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled Promise Rejection:', err);
  });
  process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
  });

  const PORT = Number(process.env.PORT || 11018);
  const HOST = process.env.HOST || '0.0.0.0';
  const isProd = process.env.NODE_ENV === 'production' || process.env.USE_TLS === '1';
  const isCapAppMode = process.env.APP_MODE === 'capacitor' || process.env.FORCE_MOBILE_SESSION === '1';
  const isSecureMode = isProd || isCapAppMode;

  server.listen(PORT, HOST, () => {
    const addr = server.address();
    console.log(`🚀 서버 실행 중: http://${addr.address}:${addr.port}`);
    if (!isProd) console.log(`🧪 로컬 API: http://localhost:${PORT}`);
    if (isSecureMode) {
      console.log('🔒 SameSite=None + Secure 쿠키 사용중(세션 호환) + JWT 병행 → HTTPS(프록시) 권장.');
      console.log('   Nginx 설정에 proxy_set_header X-Forwarded-Proto $scheme; 가 필요합니다.');
    } else {
      console.log('🧪 DEV 모드: sameSite=lax, secure=false 쿠키 / 로컬 개발 오리진 허용');
    }
    console.log('[AUTH] JWT 사용 준비 완료. 라우터는 req.user(JWT) → 없으면 req.session.user 순으로 참조 권장.');
  });
}

startServer().catch((err) => {
  console.error('❌ 서버 시작 실패:', err);
  process.exit(1);
});
