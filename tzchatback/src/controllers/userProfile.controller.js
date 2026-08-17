// src/controllers/userProfile.controller.js
// ────────────────────────────────────────────────────────────
// 사용자 프로필 컨트롤러: 요청 파싱 + 로깅 + 응답 조립.
// 실제 로직은 services/userProfileService.js가 담당한다.
// ────────────────────────────────────────────────────────────

const {
  ProfileError,
  updateNickname,
  updateRegion,
  updateSelfintro,
  updatePreference,
  updateMarriage,
} = require('@/services/userProfileService');

// 공통: 내 사용자 ID
function getMyId(req) {
  const jwtId = req?.user?._id;
  const sessId = req?.session?.user?._id;
  if (jwtId) return String(jwtId);
  if (sessId) return String(sessId);
  return null;
}

// 라우터 전용 로깅
function requestLogger(req, res, next) {
  const started = Date.now();
  console.log('[API][REQ]', {
    path: req.baseUrl + req.path,
    method: req.method,
    params: req.params,
    query: req.query,
    userId: getMyId(req),
  });

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

async function patchNickname(req, res) {
  try {
    const userId = getMyId(req);
    if (!userId) return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });

    await updateNickname(userId, (req.body || {}).nickname);
    return res.json({ success: true });
  } catch (err) {
    if (err instanceof ProfileError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    console.error('[API][ERR]', { path: req.baseUrl + req.path, message: err?.message, name: err?.name });
    return res.status(500).json({ success: false, message: '서버 오류' });
  }
}

async function patchRegion(req, res) {
  try {
    const userId = getMyId(req);
    if (!userId) return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });

    const { region1, region2 } = req.body || {};
    const result = await updateRegion(userId, region1, region2);
    return res.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ProfileError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    console.error('[API][ERR]', { path: req.baseUrl + req.path, message: err?.message, name: err?.name });
    return res.status(500).json({ success: false, message: '서버 오류' });
  }
}

async function patchSelfintro(req, res) {
  try {
    const userId = getMyId(req);
    if (!userId) return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });

    const selfintro = await updateSelfintro(userId, (req.body || {}).selfintro);
    return res.json({ success: true, selfintro });
  } catch (error) {
    if (error instanceof ProfileError) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error('[API][ERR]', { path: req.baseUrl + req.path, message: error?.message, name: error?.name });
    return res.status(500).json({ success: false, message: '서버 에러' });
  }
}

async function patchPreference(req, res) {
  try {
    const userId = getMyId(req);
    if (!userId) return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });

    const result = await updatePreference(userId, (req.body || {}).preference);
    return res.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ProfileError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    if (err?.code === 'OPTIONAL_CONSENT_REQUIRED') {
      return res.status(403).json({ ok: false, code: err.code, slug: err.details?.slug, message: err.message, error: err.message });
    }
    console.error('[API][ERR]', { path: req.baseUrl + req.path, message: err?.message, name: err?.name });
    return res.status(500).json({ success: false, message: '서버 에러' });
  }
}

async function patchMarriage(req, res) {
  try {
    const userId = getMyId(req);
    if (!userId) return res.status(401).json({ success: false, error: '로그인이 필요합니다.' });

    const result = await updateMarriage(userId, req.body?.marriage);
    return res.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ProfileError) {
      // ⚠️ 원본 라우터는 이 엔드포인트에서만 message 대신 error 키를 사용했다(다른 4개는 message).
      //    프론트가 이 키에 의존할 수 있어 그대로 유지한다.
      return res.status(err.status).json({ success: false, error: err.message });
    }
    console.error('[API][ERR] /user/marriage', { message: err?.message });
    return res.status(500).json({ success: false, error: '결혼유무 업데이트 실패' });
  }
}

module.exports = {
  requestLogger,
  patchNickname,
  patchRegion,
  patchSelfintro,
  patchPreference,
  patchMarriage,
};
