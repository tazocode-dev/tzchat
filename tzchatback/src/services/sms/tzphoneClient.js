const axios = require('axios');

class TzPhoneError extends Error {
  constructor(message, code = 'SMS_DELIVERY_FAILED') {
    super(message);
    this.code = code;
  }
}

function getConfig() {
  const provider = String(process.env.SMS_PROVIDER || '').trim().toLowerCase();
  if (provider === 'mock' && String(process.env.NODE_ENV || '') === 'test') {
    return { mock: true };
  }
  if (provider !== 'tzphone') {
    throw new TzPhoneError('TZPhone provider is disabled', 'PROVIDER_DISABLED');
  }
  const baseUrl = String(process.env.TZPHONE_BASE_URL || '').trim().replace(/\/+$/, '');
  const appId = String(process.env.TZPHONE_APP_ID || '').trim();
  const apiKey = String(process.env.TZPHONE_API_KEY || '').trim();
  if (!baseUrl || !appId || !apiKey) {
    throw new TzPhoneError('TZPhone configuration is missing', 'ENV_MISSING');
  }
  return { baseUrl, appId, apiKey, mock: false };
}

async function sendVerificationSms({ phone, code }) {
  const { baseUrl, appId, apiKey, mock } = getConfig();
  if (mock) return { status: 202, mock: true };
  let response;
  try {
    response = await axios.post(
      `${baseUrl}/v1/sms/send-verification`,
      { phone, code },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-tzphone-app-id': appId,
          'x-tzphone-api-key': apiKey,
        },
        timeout: 15000,
        validateStatus: () => true,
      }
    );
  } catch (error) {
    console.error('[TZPHONE][NETWORK_ERR]', { message: error?.message });
    throw new TzPhoneError('문자 발송 서버와 통신할 수 없습니다.');
  }

  if (response.status < 200 || response.status >= 300 || response.data?.success === false) {
    console.error('[TZPHONE][ERR]', { status: response.status, code: response.data?.error?.code });
    throw new TzPhoneError('인증 문자 발송에 실패했습니다.');
  }
  return { status: response.status };
}

module.exports = { TzPhoneError, sendVerificationSms };
