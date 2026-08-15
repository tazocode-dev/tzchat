const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const SUPPORTED_NODE_ENVS = new Set(['development', 'production', 'test']);

function loadEnv({ rootDir = path.join(__dirname, '..', '..') } = {}) {
  const nodeEnv = String(process.env.NODE_ENV || '').trim();
  if (!SUPPORTED_NODE_ENVS.has(nodeEnv)) {
    throw new Error('NODE_ENV를 development, production 또는 test로 먼저 지정해야 합니다.');
  }

  // 개발과 운영 모두 공통 비밀값(.env)의 TZMail 자격증명을 서버에서만 읽는다.
  // 환경별 공개 설정은 뒤의 .env.development/.env.production이 덮어쓴다.
  // test는 실제 앱 실행 설정과 분리해 .env.test가 있을 때만 읽는다.
  const candidates = nodeEnv === 'test'
    ? ['.env.test']
    : ['.env', `.env.${nodeEnv}`];

  const externalEnv = { ...process.env };
  const loaded = [];
  for (const filename of candidates) {
    const envPath = path.join(rootDir, filename);
    if (!fs.existsSync(envPath)) {
      if (nodeEnv !== 'test') throw new Error(`필수 환경 파일이 없습니다: ${filename}`);
      continue;
    }
    const result = dotenv.config({
      path: envPath,
      // 환경별 파일은 공통 .env보다 우선하지만 셸/PM2 값은 아래에서 복원한다.
      override: filename !== '.env',
      quiet: true,
    });
    if (result.error) throw result.error;
    loaded.push(filename);
  }

  Object.assign(process.env, externalEnv);

  return { nodeEnv, loaded };
}

module.exports = { loadEnv, SUPPORTED_NODE_ENVS };
