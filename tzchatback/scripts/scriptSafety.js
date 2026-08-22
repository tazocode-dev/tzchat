function sanitizeDiagnosticMessage(value) {
  return String(value || '알 수 없는 오류')
    .replace(/mongodb(?:\+srv)?:\/\/[^\s]+/gi, '[mongodb-uri]')
    .replace(/([?&](?:password|token|secret|key)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/:\/\/[^/@\s]+@/g, '://[redacted]@')
    .slice(0, 300);
}

function safeErrorDetails(error) {
  const details = {
    name: String(error?.name || 'Error').slice(0, 80),
    message: sanitizeDiagnosticMessage(error?.message),
  };
  if (error?.code !== undefined && error?.code !== null) {
    details.code = String(error.code).slice(0, 80);
  }
  return details;
}

function redactMongoUri(value) {
  const scheme = String(value || '').trim().match(/^(mongodb(?:\+srv)?):\/\//i)?.[1];
  return scheme ? `${scheme.toLowerCase()}://[redacted]` : '[configured MongoDB URI]';
}

function requireMongoUri(env = process.env) {
  const mongoUri = String(env.MONGO_URI || '').trim();
  if (!mongoUri) {
    const error = new Error('MONGO_URI 환경변수가 필요합니다.');
    error.code = 'MONGO_URI_REQUIRED';
    throw error;
  }
  return mongoUri;
}

module.exports = {
  redactMongoUri,
  requireMongoUri,
  safeErrorDetails,
  sanitizeDiagnosticMessage,
};
