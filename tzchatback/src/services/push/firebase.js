// tzchatback/push/firebase.js
// -------------------------------------------------------------
// ✅ Firebase Admin 초기화 (서버에서 FCM 발송용)
// - 설치/키파일 이슈가 있어도 서버가 죽지 않도록 방어
// - 중복 초기화 방지(firebaseAdmin.apps.length 체크)
// - 환경변수 FCM_SA_PATH로 지정한 파일만 지원
// -------------------------------------------------------------
const { validateFcmServiceAccountPath } = require('@/config/fcmServiceAccountPath');

let admin = null;
let initialized = false;

try {
  // 설치 안되어 있으면 여기서만 실패 → 서버는 계속 동작
  // eslint-disable-next-line import/no-extraneous-dependencies
  const firebaseAdmin = require('firebase-admin');

  // 1) 서비스 계정 로딩: 명시적으로 지정된 파일 경로만 허용
  let credentialObj = null;

  // 상대경로·저장소 내부 파일·암묵적 기본 경로는 허용하지 않는다.
  const serviceAccountPath = validateFcmServiceAccountPath(process.env.FCM_SA_PATH);
  if (serviceAccountPath) credentialObj = require(serviceAccountPath);
  if (!credentialObj) {
    throw new Error('FCM_SA_PATH 환경변수가 설정되지 않았습니다.');
  }

  // 2) 중복 초기화 방지
  if (!firebaseAdmin.apps || firebaseAdmin.apps.length === 0) {
    firebaseAdmin.initializeApp({
      credential: firebaseAdmin.credential.cert(credentialObj),
      // 필요 시 projectId 명시 가능:
      // projectId: process.env.GOOGLE_CLOUD_PROJECT || credentialObj.project_id,
    });
  }

  admin = firebaseAdmin;
  initialized = true;

  // 경로/환경정보는 민감하니 상세 경로는 로그에 노출하지 않음
  console.log('[FCM] Firebase Admin 초기화 완료');
} catch (err) {
  const reason = process.env.FCM_SA_PATH ? 'credential_load_failed' : 'not_configured';
  console.error('[FCM] 초기화 실패(발송 비활성):', { reason });
}

module.exports = {
  admin,
  isInitialized: () => initialized,
};
