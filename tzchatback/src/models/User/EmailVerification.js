// backend/models/User/EmailVerification.js
// ------------------------------------------------------------
// 이메일 인증번호(6자리) 저장소
// - 코드 원문은 저장하지 않고 bcrypt 해시만 저장한다.
// - expiresAt에 TTL 인덱스를 걸어 만료 문서를 MongoDB가 자동 삭제한다
//   (Redis 없이 기존 MongoDB 구조만으로 만료 처리).
// - used 플래그로 1회성 소모를 제어하고, attempts로 무차별 대입 시도를 제한한다.
// ------------------------------------------------------------
const mongoose = require('mongoose');
const { Schema } = mongoose;

const EmailVerificationSchema = new Schema(
  {
    // 정규화(소문자, trim)된 이메일
    email: { type: String, required: true, trim: true, lowercase: true },

    // 6자리 인증번호의 bcrypt 해시 (원문 미저장)
    codeHash: { type: String, required: true, select: false },

    // 만료 시각 — TTL 인덱스 대상
    expiresAt: { type: Date, required: true, index: { expires: 0 } },

    // 1회성 소모 제어
    used: { type: Boolean, default: false },
    usedAt: { type: Date, default: null },

    // 인증 실패 횟수(무차별 대입 방지)
    attempts: { type: Number, default: 0 },

    // 요청 IP(동일 IP 과도 요청 차단용)
    ip: { type: String, default: '' },
  },
  { timestamps: true }
);

// 이메일별 최신 미사용 코드 조회, 재발송 쿨다운 판정, 시간당 요청 횟수 집계에 사용
EmailVerificationSchema.index({ email: 1, createdAt: -1 });
// 동일 IP 시간당 요청 횟수 집계에 사용
EmailVerificationSchema.index({ ip: 1, createdAt: -1 });

module.exports = mongoose.model('EmailVerification', EmailVerificationSchema);
