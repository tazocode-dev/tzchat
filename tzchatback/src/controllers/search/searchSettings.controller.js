// src/controllers/search/searchSettings.controller.js
// ────────────────────────────────────────────────────────────
// 검색 설정 컨트롤러: 요청 파싱 + 로깅 + 응답 조립.
// 실제 로직은 services/search/searchSettingsService.js가 담당한다.
// ⚠️ 원본 라우터는 엔드포인트마다 응답 형태가 조금씩 달랐다(success vs ok, error 위치 등).
//    프론트가 특정 키에 의존할 수 있어 엔드포인트별로 원본 그대로 유지했다.
// ────────────────────────────────────────────────────────────

const {
  SearchSettingsError,
  updateSearchYear,
  updateSearchRegions,
  updateSearchPreference,
  updateSearchToggles,
  updateSearchMarriage,
} = require('@/services/search/searchSettingsService');

function getMyId(req) {
  const jwtId = req?.user?._id || req?.user?.sub;
  const sessId = req?.session?.user?._id;
  return (jwtId && String(jwtId)) || (sessId && String(sessId)) || '';
}

// 라우터 로깅 (요약)
function requestLogger(req, res, next) {
  const started = Date.now();
  const path = req.baseUrl + req.path;
  console.log('[API][REQ]', { path, method: req.method, userId: getMyId(req) });

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    const ms = Date.now() - started;
    const status = res.statusCode;
    const size = typeof body === 'string' ? body.length : Buffer.byteLength(JSON.stringify(body || {}));
    console.log('[API][RES]', { path, status, ms, size });
    return originalJson(body);
  };
  next();
}

async function patchYear(req, res, next) {
  try {
    const userId = getMyId(req);
    if (!userId) return res.status(401).json({ success: false, error: '로그인이 필요합니다.' });

    const updated = await updateSearchYear(userId, req.body || {});
    return res.json({ success: true, user: updated });
  } catch (err) {
    if (err instanceof SearchSettingsError) return res.status(err.status).json({ success: false, error: err.message });
    next(err);
  }
}

async function patchRegions(req, res, next) {
  try {
    const userId = getMyId(req);
    if (!userId) return res.status(401).json({ success: false, error: '로그인이 필요합니다.' });

    const { count, user } = await updateSearchRegions(userId, req.body || {});
    return res.json({ success: true, count, user });
  } catch (err) {
    if (err instanceof SearchSettingsError) return res.status(err.status).json({ success: false, error: err.message });
    next(err);
  }
}

async function patchPreference(req, res, next) {
  try {
    const userId = getMyId(req);
    if (!userId) return res.status(401).json({ success: false, error: '로그인이 필요합니다.' });

    const updated = await updateSearchPreference(userId, req.body?.preference);
    return res.json({ success: true, user: updated });
  } catch (err) {
    if (err instanceof SearchSettingsError) return res.status(err.status).json({ success: false, error: err.message });
    if (err?.code === 'OPTIONAL_CONSENT_REQUIRED') {
      return res.status(403).json({ ok: false, code: err.code, slug: err.details?.slug, message: err.message, error: err.message });
    }
    next(err);
  }
}

async function patchSettings(req, res, next) {
  try {
    const userId = getMyId(req);
    if (!userId) return res.status(401).json({ error: '로그인이 필요합니다.' });

    const updated = await updateSearchToggles(userId, req.body || {});
    return res.json({ ok: true, user: updated });
  } catch (err) {
    if (err instanceof SearchSettingsError) return res.status(err.status).json({ error: err.message });
    if (err?.code === 'OPTIONAL_CONSENT_REQUIRED') {
      return res.status(403).json({ ok: false, code: err.code, slug: err.details?.slug, message: err.message, error: err.message });
    }
    next(err);
  }
}

async function patchMarriage(req, res, next) {
  try {
    const userId = getMyId(req);
    if (!userId) return res.status(401).json({ success: false, error: '로그인이 필요합니다.' });

    const updated = await updateSearchMarriage(userId, req.body?.marriage);
    return res.json({ success: true, search_marriage: updated.search_marriage, updatedAt: updated.updatedAt });
  } catch (err) {
    if (err instanceof SearchSettingsError) return res.status(err.status).json({ success: false, error: err.message });
    next(err);
  }
}

// 파일 전용 에러 핸들러
function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  const msg = err.message || 'Internal Server Error';
  console.error('[search/settingsRouter]', status, msg, err.stack);
  res.status(status).json({ ok: false, error: msg });
}

module.exports = { requestLogger, patchYear, patchRegions, patchPreference, patchSettings, patchMarriage, errorHandler };
