const { PhoneVerificationError, requestCode } = require('@/services/auth/phoneVerificationService');
const { PhoneAuthError, verifyAndLogin } = require('@/services/auth/phoneAuthService');
const { setJwtCookie, setRefreshCookie } = require('@/controllers/session.controller');

function handleError(res, error, step) {
  if (error instanceof PhoneVerificationError || error instanceof PhoneAuthError) {
    const payload = { ok: false, code: error.code, message: error.message };
    if (error.retryAfterSeconds != null) payload.retryAfterSeconds = error.retryAfterSeconds;
    if (error.sent != null) payload.sent = error.sent;
    if (error.reviewLogin != null) payload.reviewLogin = error.reviewLogin;
    return res.status(error.status).json(payload);
  }
  console.error('[AUTH][ERR]', { step, message: error?.message });
  return res.status(500).json({ ok: false, message: '서버 오류' });
}

async function request(req, res) {
  try {
    const result = await requestCode({ phone: req.body?.phone, ip: req.ip });
    return res.json({
      ok: true,
      message: result.sent ? '인증번호를 문자로 발송했습니다.' : '테스트 인증번호를 준비했습니다.',
      ...result,
    });
  } catch (error) {
    return handleError(res, error, 'phone/request');
  }
}

async function verify(req, res) {
  try {
    const result = await verifyAndLogin({ phone: req.body?.phone, code: req.body?.code });
    setJwtCookie(res, result.token);
    setRefreshCookie(res, result.refreshToken);

    if (req.session) {
      await new Promise((resolve, reject) => req.session.regenerate(error => (error ? reject(error) : resolve())));
      req.session.user = { _id: result.user._id, nickname: result.user.nickname };
      await new Promise((resolve, reject) => req.session.save(error => (error ? reject(error) : resolve())));
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      message: result.isNewUser ? '회원가입 및 로그인 성공' : '로그인 성공',
      isNewUser: result.isNewUser,
      nickname: result.user.nickname,
      phone: result.user.phone,
      role: result.role,
      roles: result.roles,
      isAdmin: result.isAdmin,
      token: result.token,
      refreshToken: result.refreshToken,
      expiresIn: result.expiresIn,
    });
  } catch (error) {
    return handleError(res, error, 'phone/verify');
  }
}

module.exports = { request, verify };
