const service = require('@/services/auth/accountVerificationService');

function clientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || '').slice(0, 128);
}

function handleError(res, error) {
  if (error instanceof service.AccountVerificationError) {
    const body = { ok: false, code: error.code, message: error.message };
    if (error.retryAfterSeconds) body.retryAfterSeconds = error.retryAfterSeconds;
    return res.status(error.status).json(body);
  }
  console.error('[ACCOUNT_VERIFICATION][ERR]', { message: error?.message });
  return res.status(500).json({ ok: false, message: '인증정보 처리 중 오류가 발생했습니다.' });
}

async function requestEmail(req, res) {
  try {
    const result = await service.requestEmailCode({
      userId: req.auth.userId,
      kind: req.body?.kind,
      newEmail: req.body?.newEmail,
      ip: clientIp(req),
    });
    return res.json({
      ok: true,
      message: result.sent ? '인증번호를 발송했습니다.' : '실제 이메일을 발송하지 않았습니다.',
      ...result,
    });
  } catch (error) { return handleError(res, error); }
}

async function commitEmail(req, res) {
  try {
    const result = await service.commitEmailChange({
      userId: req.auth.userId,
      newEmail: req.body?.newEmail,
      currentCode: req.body?.currentCode,
      newCode: req.body?.newCode,
    });
    return res.json({ ok: true, message: '이메일 인증정보가 변경되었습니다.', data: result });
  } catch (error) { return handleError(res, error); }
}

async function requestPhoneEmail(req, res) {
  try {
    const result = await service.requestPhoneEmailCode({ userId: req.auth.userId, ip: clientIp(req) });
    return res.json({
      ok: true,
      message: result.sent ? '인증번호를 발송했습니다.' : '실제 이메일을 발송하지 않았습니다.',
      ...result,
    });
  } catch (error) { return handleError(res, error); }
}

async function requestPhoneSms(req, res) {
  try {
    const result = await service.requestPhoneSmsCode({
      userId: req.auth.userId,
      newPhone: req.body?.newPhone,
      ip: clientIp(req),
    });
    return res.json({
      ok: true,
      message: result.testPhone
        ? '테스트 전화번호 인증번호를 준비했습니다.'
        : '새 전화번호로 인증 문자를 보냈습니다.',
      ...result,
    });
  } catch (error) { return handleError(res, error); }
}

async function commitPhone(req, res) {
  try {
    const result = await service.commitPhoneChange({
      userId: req.auth.userId,
      newPhone: req.body?.newPhone,
      emailCode: req.body?.emailCode,
      smsCode: req.body?.smsCode,
    });
    return res.json({ ok: true, message: '전화번호가 변경되었습니다.', data: result });
  } catch (error) { return handleError(res, error); }
}

function handlePublicPhoneChangeError(res, error) {
  if (error instanceof service.AccountVerificationError) {
    const formatCodes = new Set(['INVALID_PHONE', 'INVALID_EMAIL', 'INVALID_NEW_PHONE']);
    if (formatCodes.has(error.code)) {
      return res.status(400).json({ ok: false, code: error.code, message: error.message });
    }
    return res.status(400).json({
      ok: false,
      code: 'PUBLIC_PHONE_CHANGE_FAILED',
      message: '입력 정보 또는 인증번호를 확인해주세요.',
    });
  }
  console.error('[PUBLIC_PHONE_CHANGE][ERR]', { message: error?.message });
  return res.status(500).json({ ok: false, message: '전화번호 변경 처리 중 오류가 발생했습니다.' });
}

function publicRequestResponse(res) {
  return res.json({
    ok: true,
    message: '입력 정보가 일치하면 인증번호를 발송합니다.',
    accepted: true,
    expiresInSeconds: 300,
    resendAfterSeconds: 60,
  });
}

function runPublicRequestInBackground(promise) {
  promise.catch((error) => {
    // 계정·인증 상태에 따른 응답 시간 차이를 만들지 않도록 공개 요청은 같은 응답을 먼저 반환한다.
    if (!(error instanceof service.AccountVerificationError)) {
      console.error('[PUBLIC_PHONE_CHANGE_REQUEST][ERR]', { message: error?.message });
    }
  });
}

async function requestPublicPhoneChangeEmail(req, res) {
  runPublicRequestInBackground(service.requestPublicPhoneChangeEmailCode({
    currentPhone: req.body?.currentPhone,
    currentEmail: req.body?.currentEmail,
    ip: clientIp(req),
  }));
  return publicRequestResponse(res);
}

async function requestPublicPhoneChangeSms(req, res) {
  runPublicRequestInBackground(service.requestPublicPhoneChangeSmsCode({
    currentPhone: req.body?.currentPhone,
    currentEmail: req.body?.currentEmail,
    newPhone: req.body?.newPhone,
    emailCode: req.body?.emailCode,
    ip: clientIp(req),
  }));
  return publicRequestResponse(res);
}

async function commitPublicPhoneChange(req, res) {
  try {
    const result = await service.commitPublicPhoneChange({
      currentPhone: req.body?.currentPhone,
      currentEmail: req.body?.currentEmail,
      newPhone: req.body?.newPhone,
      emailCode: req.body?.emailCode,
      smsCode: req.body?.smsCode,
    });
    return res.json({ ok: true, message: '전화번호가 변경되었습니다.', data: result });
  } catch (error) { return handlePublicPhoneChangeError(res, error); }
}

module.exports = {
  requestEmail,
  commitEmail,
  requestPhoneEmail,
  requestPhoneSms,
  commitPhone,
  requestPublicPhoneChangeEmail,
  requestPublicPhoneChangeSms,
  commitPublicPhoneChange,
};
