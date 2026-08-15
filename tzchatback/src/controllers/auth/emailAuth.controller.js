// backend/controllers/auth/emailAuth.controller.js
// ------------------------------------------------------------
// 이메일 인증 로그인 컨트롤러: 요청 파싱 + 쿠키/세션(Express 트랜스포트) 처리 + 응답 조립.
// 실제 로직은 services/auth/emailVerificationService.js, services/auth/emailAuthService.js가 담당한다.
// ------------------------------------------------------------
const { EmailVerificationError, requestCode } = require('@/services/auth/emailVerificationService');
const { verifyAndLogin } = require('@/services/auth/emailAuthService');
const { setJwtCookie, setRefreshCookie } = require('@/controllers/session.controller');

// POST /api/auth/email/request
async function request(req, res) {
  const { email } = req.body || {};
  console.log('[API][REQ] /api/auth/email/request', { ip: req.ip });

  try {
    const result = await requestCode({ email, ip: req.ip });
    const message = result.reviewLogin
      ? '심사용 인증번호를 준비했습니다.'
      : result.sent
        ? '인증번호를 발송했습니다.'
        : '테스트 전용 환경이라 실제 이메일을 발송하지 않았습니다.';
    return res.json({
      ok: true,
      message,
      ...result,
    });
  } catch (err) {
    if (err instanceof EmailVerificationError) {
      console.log('[AUTH][ERR]', { step: 'email/request', code: err.code, message: err.message });
      const payload = { ok: false, code: err.code, message: err.message };
      if (err.retryAfterSeconds != null) payload.retryAfterSeconds = err.retryAfterSeconds;
      if (err.sent != null) payload.sent = err.sent;
      if (err.reviewLogin != null) payload.reviewLogin = err.reviewLogin;
      return res.status(err.status).json(payload);
    }
    console.log('[AUTH][ERR]', { step: 'email/request', message: err?.message });
    return res.status(500).json({ ok: false, message: '서버 오류' });
  }
}

// POST /api/auth/email/verify
async function verify(req, res) {
  const { email, code } = req.body || {};
  console.log('[API][REQ] /api/auth/email/verify', { ip: req.ip });

  try {
    const { user, isNewUser, token, refreshToken, role, roles, isAdmin, expiresIn } =
      await verifyAndLogin({ email, code });

    setJwtCookie(res, token);
    setRefreshCookie(res, refreshToken);

    if (req.session) {
      await new Promise((resolve, reject) => {
        req.session.regenerate(err => (err ? reject(err) : resolve()));
      });
      req.session.user = { _id: user._id, nickname: user.nickname };
      await new Promise((resolve, reject) => {
        req.session.save(err => (err ? reject(err) : resolve()));
      });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      message: isNewUser ? '회원가입 및 로그인 성공' : '로그인 성공',
      isNewUser,
      nickname: user.nickname,
      email: user.email,
      role,
      roles,
      isAdmin,
      token,
      refreshToken,
      expiresIn,
    });
  } catch (err) {
    if (err instanceof EmailVerificationError) {
      console.log('[AUTH][ERR]', { step: 'email/verify', code: err.code, message: err.message });
      return res.status(err.status).json({ ok: false, code: err.code, message: err.message });
    }
    console.log('[AUTH][ERR]', { step: 'email/verify', message: err?.message });
    return res.status(500).json({ ok: false, message: '서버 오류' });
  }
}

module.exports = { request, verify };
