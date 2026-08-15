const fs = require('node:fs');
const path = require('node:path');

const BACKEND_ROOT = path.resolve(__dirname, '..', '..');

function isInsideBackendRoot(candidatePath, backendRoot = BACKEND_ROOT) {
  const relative = path.relative(path.resolve(backendRoot), path.resolve(candidatePath));
  return relative === ''
    || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function validateFcmServiceAccountPath(value, options = {}) {
  const { requireReadableFile = false } = options;
  const configured = String(value || '').trim();
  if (!configured) {
    if (requireReadableFile) throw new Error('운영 런타임에는 FCM_SA_PATH가 필요합니다.');
    return null;
  }
  if (!path.isAbsolute(configured)) {
    throw new Error('FCM_SA_PATH는 반드시 절대경로여야 합니다.');
  }

  const resolved = path.resolve(configured);
  const backendRoot = options.backendRoot || BACKEND_ROOT;
  if (isInsideBackendRoot(resolved, backendRoot)) {
    throw new Error('FCM_SA_PATH는 tzchatback 저장소 외부 파일을 가리켜야 합니다.');
  }

  // 존재하는 외부 심볼릭 링크가 저장소 내부 파일을 가리키는 우회도 차단한다.
  // realpath는 경로 메타데이터만 확인하며 자격증명 파일 내용은 읽지 않는다.
  if (fs.existsSync(resolved)) {
    const realCandidate = fs.realpathSync(resolved);
    const realBackendRoot = fs.realpathSync(backendRoot);
    if (isInsideBackendRoot(realCandidate, realBackendRoot)) {
      throw new Error('FCM_SA_PATH의 실제 대상은 tzchatback 저장소 외부에 있어야 합니다.');
    }
  }

  if (requireReadableFile) {
    let stat;
    try {
      stat = fs.statSync(resolved);
      fs.accessSync(resolved, fs.constants.R_OK);
    } catch {
      throw new Error('FCM_SA_PATH 파일이 없거나 읽을 수 없습니다.');
    }
    if (!stat.isFile()) throw new Error('FCM_SA_PATH는 읽을 수 있는 파일이어야 합니다.');
  }
  return resolved;
}

module.exports = {
  BACKEND_ROOT,
  isInsideBackendRoot,
  validateFcmServiceAccountPath,
};
