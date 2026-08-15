// config/retention.js
// 모든 보관기간을 한 곳에서 관리 (일 단위)
module.exports = {
  LOG_DAYS: 90,                // 일반 로그/세션 로그 기본값
  MESSAGE_DAYS: 365,           // 채팅 메시지 기본 보관(예: 1년)
  DELETION_GRACE_DAYS: 14,     // 회원 탈퇴 유예 (소프트 삭제 유지 기간)
  PAYMENT_DAYS: 1825,          // 결제/청구 5년 (세무/분쟁 대응용)
  COMPLAINT_DAYS: 1095,        // 고객 문의/민원 3년
  DEVICE_TOKEN_STALE_DAYS: 180 // 디바이스 토큰 마지막 사용 후 180일 정리
};
