// config/secrets.js
// -------------------------------------------------------------
// JWT_SECRET / SESSION_SECRET 단일 진실 공급원.
// 이전에는 5개 파일이 각자 `process.env.JWT_SECRET || 'tzchatjwtsecret'` 식으로
// 하드코딩된 기본값을 갖고 있었다. 운영에서 JWT_SECRET이 비어 있으면
// 토큰이 공개된 문자열로 위조 가능해지므로, 기본값 없이 필수값으로 강제한다.
// -------------------------------------------------------------

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`[config/secrets] 필수 환경변수 ${name}가 설정되지 않았습니다.`);
  }
  return value;
}

const JWT_SECRET = requireEnv('JWT_SECRET');
const SESSION_SECRET = requireEnv('SESSION_SECRET');

module.exports = { JWT_SECRET, SESSION_SECRET };
