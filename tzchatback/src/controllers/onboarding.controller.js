const {
  OnboardingError,
  getStatus,
  saveBirthDate,
  saveBirthYear,
  saveGender,
} = require('@/services/onboardingService');

function handleError(err, res) {
  if (err instanceof OnboardingError) {
    return res.status(err.status).json({ ok: false, code: err.code, message: err.message });
  }
  console.error('[ONBOARDING][ERR]', { message: err?.message });
  return res.status(500).json({ ok: false, code: 'ONBOARDING_FAILED', message: '온보딩 처리에 실패했습니다.' });
}

async function status(req, res) {
  try {
    const data = await getStatus(req.auth.userId);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ ok: true, data });
  } catch (err) {
    return handleError(err, res);
  }
}

async function birthDate(req, res) {
  try {
    const data = await saveBirthDate(req.auth.userId, req.body?.birthDate);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ ok: true, data });
  } catch (err) {
    return handleError(err, res);
  }
}

async function birthYear(req, res) {
  try {
    const data = await saveBirthYear(req.auth.userId, req.body?.birthYear);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ ok: true, data });
  } catch (err) {
    return handleError(err, res);
  }
}

async function gender(req, res) {
  try {
    const data = await saveGender(req.auth.userId, req.body?.gender);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ ok: true, data });
  } catch (err) {
    return handleError(err, res);
  }
}

module.exports = { status, birthDate, birthYear, gender };
