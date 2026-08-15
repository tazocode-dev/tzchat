// scripts/buildCheck.js
// -------------------------------------------------------------
// `npm run build`: 배포 전 검증 (지침 §2). 컴파일이 필요 없는 Node 백엔드이므로
// 가짜 산출물을 만드는 대신, 1) 모든 .js 파일 구문 검사 2) 운영 필수 환경변수 검증을
// 배포 전에 수행하고 하나라도 실패하면 종료 코드를 0이 아닌 값으로 반환한다.
// -------------------------------------------------------------
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'uploads', 'keys', '.backup']);

function collectJsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectJsFiles(full, out);
    else if (/\.(?:js|cjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

let failed = false;

console.log('▶ 1/2 구문 검사(node --check) 실행...');
for (const file of collectJsFiles(ROOT)) {
  try {
    execSync(`${JSON.stringify(process.execPath)} --check ${JSON.stringify(file)}`, { stdio: 'pipe' });
  } catch (e) {
    failed = true;
    console.error(`❌ 구문 오류: ${path.relative(ROOT, file)}`);
    console.error(e.stdout?.toString() || e.message);
  }
}
if (!failed) console.log('✅ 구문 검사 통과');

console.log('▶ 2/2 운영 환경변수 검증 실행...');
try {
  require(path.join(ROOT, 'src/config/loadEnv')).loadEnv({ rootDir: ROOT });
  // validateEnv()는 실패 시 process.exit(1)을 직접 호출한다.
  // 배포 전 로컬 검사에서는 운영 서버의 외부 FCM 파일이 아직 없어도 된다.
  // 실제 production 기동은 server.js에서 runtime=true로 파일 존재·읽기 권한까지 검사한다.
  require(path.join(ROOT, 'src/config/validateEnv')).validateEnv({ runtime: false });
  console.log('✅ 운영 환경변수 검증 통과');
} catch (e) {
  failed = true;
  console.error('❌ 환경변수 검증 실패:', e.message);
}

if (failed) {
  console.error('❌ build 검증 실패');
  process.exit(1);
}
console.log('✅ build 검증 완료');
