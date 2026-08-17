const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const SUPPORTED_NODE_ENVS = new Set(['development', 'production', 'test']);

function loadEnv({ rootDir = path.join(__dirname, '..', '..') } = {}) {
  const nodeEnv = String(process.env.NODE_ENV || '').trim();
  if (!SUPPORTED_NODE_ENVS.has(nodeEnv)) {
    throw new Error('NODE_ENV를 development, production 또는 test로 먼저 지정해야 합니다.');
  }

  const filename = `.env.${nodeEnv}`;
  const envPath = path.join(rootDir, filename);
  if (!fs.existsSync(envPath)) throw new Error(`필수 환경 파일이 없습니다: ${filename}`);

  const result = dotenv.config({
    path: envPath,
    // 셸과 PM2가 명시한 값은 환경 파일보다 항상 우선한다.
    override: false,
    quiet: true,
  });
  if (result.error) throw result.error;

  return { nodeEnv, loaded: [filename] };
}

module.exports = { loadEnv, SUPPORTED_NODE_ENVS };
