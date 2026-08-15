// backend/models/User/DeletionRequest.js
// ---------------------------------------------
// 공개 웹폼에서 들어온 "계정 삭제 요청" 접수용 모델
// - 실제 삭제는 운영 정책에 따라 별도 수동/자동 처리
// - 로그/추적 가능하도록 저장
// ---------------------------------------------
const mongoose = require('mongoose')

const deletionRequestSchema = new mongoose.Schema({
  username: { type: String, required: true, index: true }, // 필수 식별자
  email: { type: String, default: '' },                    // 연락 수단(선택)
  note: { type: String, default: '' },                     // 추가 메모
  ip: { type: String, default: '' },                       // 요청 IP
  ua: { type: String, default: '' },                       // User-Agent
  status: { type: String, enum: ['received', 'verified', 'completed', 'rejected'], default: 'received' },
  handledBy: { type: String, default: '' },                // 처리자(운영자)
  handledAt: { type: Date, default: null },                // 처리 일시
}, { timestamps: true })

module.exports = mongoose.model('DeletionRequest', deletionRequestSchema)
