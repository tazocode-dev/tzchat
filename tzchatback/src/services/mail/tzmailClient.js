// backend/services/mail/tzmailClient.js
// ------------------------------------------------------------
// TZMail(내부 메일 발송 API) HTTP 클라이언트.
// - 실제 검증된 규격: POST {TZMAIL_BASE_URL}/v1/mail/send
//   헤더: x-tzmail-app-id, x-tzmail-api-key (body에 자격증명 넣으면 TZMail이 400으로 거부함)
//   바디: { to, subject, text, html }
// - 이 파일만 TZMail 자격증명을 다룬다. 다른 코드는 반드시 아래 sendMail()을 거쳐야 한다.
// - 실패/타임아웃은 provider 내부 세부사항을 감추고 일반화된 에러로 변환해서 던진다
//   (지침: 외부 서비스 연동은 표준 내부 에러 형태로 변환, 클라이언트에 provider 원문 노출 금지).
// ------------------------------------------------------------
const axios = require('axios');

class TzMailError extends Error {
  constructor(message, code = 'EMAIL_DELIVERY_FAILED', details = {}) {
    super(message);
    this.code = code;
    Object.assign(this, details);
  }
}

function getBaseUrl() {
  if (String(process.env.MAIL_PROVIDER || '').trim().toLowerCase() !== 'tzmail') {
    throw new TzMailError('TZMail provider is disabled', 'PROVIDER_DISABLED');
  }
  const base = String(process.env.TZMAIL_BASE_URL || '').trim();
  if (!base) {
    const err = new TzMailError('TZMAIL_BASE_URL is missing', 'ENV_MISSING');
    throw err;
  }
  return base.replace(/\/+$/, '');
}

function getCredentials() {
  const appId = String(process.env.TZMAIL_APP_ID || '').trim();
  const apiKey = String(process.env.TZMAIL_API_KEY || '').trim();
  if (!appId || !apiKey) {
    const err = new TzMailError('TZMAIL_APP_ID/TZMAIL_API_KEY is missing', 'ENV_MISSING');
    throw err;
  }
  return { appId, apiKey };
}

/**
 * TZMail로 메일을 발송한다.
 * @param {{to:string, subject:string, text:string, html:string}} mail
 * @returns {Promise<{status:number, data:any}>}
 */
async function sendMail({ to, subject, text, html }) {
  const base = getBaseUrl();
  const { appId, apiKey } = getCredentials();

  let res;
  try {
    res = await axios.post(
      `${base}/v1/mail/send`,
      { to, subject, text, html },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-tzmail-app-id': appId,
          'x-tzmail-api-key': apiKey,
        },
        timeout: 15000,
        validateStatus: () => true,
      }
    );
  } catch (err) {
    const timeout = err?.code === 'ECONNABORTED' || err?.code === 'ETIMEDOUT';
    console.error('[TZMAIL]', {
      event: timeout ? 'timeout' : 'network_error',
      code: err?.code || null,
    });
    throw new TzMailError(
      '메일 발송 서버와 통신할 수 없습니다.',
      timeout ? 'TZMAIL_TIMEOUT' : 'TZMAIL_NETWORK_ERROR'
    );
  }

  const deliveryStatus = res.data?.data?.status || null;
  if (
    res.status < 200
    || res.status >= 300
    || res.data?.success === false
    || deliveryStatus !== 'sent'
  ) {
    const providerCode = res.data?.error?.code
      || res.data?.code
      || res.data?.data?.errorCode
      || (deliveryStatus && deliveryStatus !== 'sent' ? `DELIVERY_${String(deliveryStatus).toUpperCase()}` : null);
    console.error('[TZMAIL]', {
      event: 'delivery_rejected',
      status: res.status,
      deliveryStatus,
      providerCode,
      // provider 응답 원문(message 등)은 로그에도 과다 노출하지 않는다.
    });
    throw new TzMailError('메일 발송에 실패했습니다.', 'EMAIL_DELIVERY_REJECTED', {
      providerStatus: res.status,
      providerCode,
    });
  }

  return { status: res.status, data: res.data };
}

module.exports = { sendMail, TzMailError };
