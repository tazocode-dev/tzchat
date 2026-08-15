// src/controllers/admin/adminMonitor.controller.js
// ────────────────────────────────────────────────────────────
// 관리자 서버/시스템 모니터링 컨트롤러: 권한가드 + 로깅 + 응답 조립.
// 실제 로직은 services/admin/adminMonitorService.js가 담당한다.
// ────────────────────────────────────────────────────────────

const {
  getHeartbeat,
  pingDb,
  getOnlineStatus,
  getRecentLogs,
  getAdminUsers,
} = require('@/services/admin/adminMonitorService');
const {
  AdminPushTestError,
  sendAdminTestPush,
} = require('@/services/admin/adminPushTestService');

// 🔒 master 권한 체크
function requireMaster(req, res, next) {
  if (req?.user?.role === 'master') return next();
  return res.status(403).json({ ok: false, error: '관리자 권한이 필요합니다.' });
}

function getAdminId(req) {
  return req?.user?._id || null;
}

// 공통 요청/응답 로그 미들웨어
function requestLogger(req, res, next) {
  const adminId = getAdminId(req);
  console.log('[API][REQ]', {
    path: req.baseUrl + req.path,
    method: req.method,
    params: req.params,
    query: req.query,
    adminId,
  });
  const started = Date.now();
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    const ms = Date.now() - started;
    const status = res.statusCode;
    const size = typeof body === 'string' ? body.length : Buffer.byteLength(JSON.stringify(body || {}));
    console.log('[API][RES]', { path: req.baseUrl + req.path, status, ms, size });
    return originalJson(body);
  };
  next();
}

function heartbeat(req, res) {
  try {
    const result = getHeartbeat();
    console.log('[ADMIN] HEARTBEAT', { adminId: getAdminId(req), at: result.serverTime });
    res.json({ ok: true, message: '관리자 대시보드 연결 OK', ...result });
  } catch (e) {
    console.log('[API][ERR]', { path: req.baseUrl + req.path, message: e?.message });
    res.status(500).json({ ok: false, error: 'heartbeat 실패' });
  }
}

async function dbPing(req, res) {
  try {
    const result = await pingDb();
    res.json({ ok: true, result });
  } catch (e) {
    console.error('[API][ERR]', { path: req.baseUrl + req.path, message: e?.message });
    res.status(500).json({ ok: false, error: 'DB ping 실패' });
  }
}

function online(req, res) {
  try {
    const result = getOnlineStatus(req.app);
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[API][ERR]', { path: req.baseUrl + req.path, message: e?.message });
    res.status(500).json({ ok: false, error: 'online 조회 실패' });
  }
}

async function logs(req, res) {
  try {
    const logs = await getRecentLogs();
    res.json({ ok: true, logs });
  } catch (e) {
    console.error('[API][ERR]', { path: req.baseUrl + req.path, message: e?.message });
    res.status(500).json({ ok: false, error: 'logs 조회 실패' });
  }
}

async function users(req, res) {
  try {
    const result = await getAdminUsers(req.query || {});
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[API][ERR]', { path: req.baseUrl + req.path, message: e?.message });
    res.status(500).json({ ok: false, error: '회원 조회 실패' });
  }
}

function pushTestHttpStatus(result) {
  const failureStatus = {
    not_configured: 503,
    notifications_disabled: 409,
    no_tokens: 404,
    send_error: 502,
  }[result?.skipped];
  if (failureStatus) return failureStatus;
  if (!result?.success && result?.failure) return 502;
  return 200;
}

async function pushTest(req, res) {
  try {
    const result = await sendAdminTestPush(req.body || {}, getAdminId(req));
    const status = pushTestHttpStatus(result);
    if (status !== 200) return res.status(status).json({ ok: false, result });
    return res.json({ ok: true, result });
  } catch (error) {
    if (error instanceof AdminPushTestError) {
      return res.status(error.status).json({ ok: false, error: error.message });
    }
    console.error('[API][ERR]', { path: req.baseUrl + req.path, message: error?.message });
    return res.status(500).json({ ok: false, error: '테스트 알림 발송 실패' });
  }
}

module.exports = { requireMaster, requestLogger, heartbeat, dbPing, online, logs, users, pushTestHttpStatus, pushTest };
