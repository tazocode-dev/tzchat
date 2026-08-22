// src/controllers/search/emergencyMode.controller.js
// ────────────────────────────────────────────────────────────
// Emergency 모드 컨트롤러: 요청 파싱 + 응답 조립.
// 실제 로직은 services/search/emergencyModeService.js가 담당한다.
// ────────────────────────────────────────────────────────────

const { EmergencyError, syncExpirationIfNeeded, turnOn, turnOff, listActiveUsers, filterActiveUsersByRegion } = require('@/services/search/emergencyModeService');

function getAuthUserId(req) {
  const jwtId  = req?.user?._id || req?.user?.sub || null;
  const sessId = req?.session?.user?._id || null;
  return (jwtId && String(jwtId)) || (sessId && String(sessId)) || null;
}

const p = (req) => (req.baseUrl || '') + (req.path || '');

// 🧹 만료 동기화 미들웨어(활성 중 만료되었으면 자동 OFF)
async function syncEmergencyExpiration(req, _res, next) {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return next();

    console.log('[API][REQ]', { path: p(req) + '::syncEmergencyExpiration', method: req.method, userId });
    await syncExpirationIfNeeded(userId);
    return next();
  } catch (err) {
    console.error('[API][ERR]', { path: p(req) + '::syncEmergencyExpiration', message: err?.message });
    return next();
  }
}

async function putOn(req, res) {
  const label = `[API] ${req.method} ${p(req)}`;
  console.time(label);
  const userId = getAuthUserId(req);
  console.log('[API][REQ]', { path: p(req), method: 'PUT', userId });

  try {
    const result = await turnOn(userId);
    console.log('[API][EMERGENCY_ON]', { path: p(req), userId, ...result });
    console.timeEnd(label);
    console.log('[API][RES]', { path: p(req), status: 200 });
    return res.json({ message: '스피드 매칭에 참여했습니다.', ...result });
  } catch (error) {
    console.timeEnd(label);
    console.error('[API][ERR]', { path: p(req), message: error?.message });
    if (error instanceof EmergencyError) {
      return res.status(error.status).json({ message: error.message, ...error.details });
    }
    return res.status(500).json({ message: '서버 오류' });
  }
}

async function putOff(req, res) {
  const label = `[API] ${req.method} ${p(req)}`;
  console.time(label);
  const userId = getAuthUserId(req);
  console.log('[API][REQ]', { path: p(req), method: 'PUT', userId });

  try {
    const result = await turnOff(userId);
    console.log('[API][EMERGENCY_OFF]', { path: p(req), userId });
    console.timeEnd(label);
    console.log('[API][RES]', { path: p(req), status: 200 });
    return res.json({ message: '스피드 매칭에서 잠시 숨겼습니다.', ...result });
  } catch (err) {
    console.timeEnd(label);
    console.error('[API][ERR]', { path: p(req), message: err?.message });
    return res.status(500).json({ message: '스피드 매칭 숨기기에 실패했습니다.' });
  }
}

async function getList(req, res) {
  const label = `[LOAD] ${req.method} ${p(req)}`;
  console.time(label);
  const userId = getAuthUserId(req);
  console.log('[API][REQ]', { path: p(req), method: 'GET', userId });

  try {
    const result = await listActiveUsers(req?.user?.email, userId);
    console.log('[API][EMERGENCY_LIST]', { path: p(req), count: result.users.length, duration: result.durationSeconds });
    console.timeEnd(label);
    console.log('[API][RES]', { path: p(req), status: 200 });
    return res.json(result);
  } catch (err) {
    console.timeEnd(label);
    console.error('[API][ERR]', { path: p(req), message: err?.message });
    return res.status(500).json({ message: '스피드 매칭 사용자 조회 실패' });
  }
}

async function postFilter(req, res) {
  const label = `[LOAD] ${req.method} ${p(req)}`;
  console.time(label);
  const userId = getAuthUserId(req);
  console.log('[API][REQ]', { path: p(req), method: 'POST', userId, bodyKeys: Object.keys(req.body || {}) });

  try {
    const { regions } = req.body || {};
    const result = await filterActiveUsersByRegion(regions, req?.user?.email, userId);
    console.log('[API][EMERGENCY_FILTER]', { path: p(req), count: result.users.length, duration: result.durationSeconds });
    console.timeEnd(label);
    console.log('[API][RES]', { path: p(req), status: 200 });
    return res.json(result);
  } catch (err) {
    console.timeEnd(label);
    console.error('[API][ERR]', { path: p(req), message: err?.message });
    return res.status(500).json({ message: '스피드 매칭 사용자 필터링 실패' });
  }
}

module.exports = { syncEmergencyExpiration, putOn, putOff, getList, postFilter };
