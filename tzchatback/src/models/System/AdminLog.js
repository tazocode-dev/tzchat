// models/System/AdminLog.js 
const mongoose = require('mongoose');
const retention = require('../../config/retention'); // LOG_DAYS 불러오기

const adminLogSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true }, // e.g., 'promote', 'block', 'deleteRoom'
  targetId: { type: String },               // 유저/방/공지 등 타깃 식별자
  meta: { type: Object, default: {} },      // 추가 정보

  // TTL 삭제용 필드
  expiresAt: { type: Date, index: { expires: 0 } }
}, { timestamps: true });

// 저장 전에 expiresAt 자동 설정
adminLogSchema.pre('save', function(next) {
  if (!this.expiresAt) {
    const days = retention?.LOG_DAYS ?? 90;
    this.expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
  next();
});

// toJSON 정리 (불필요한 __v 제거)
adminLogSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('AdminLog', adminLogSchema);
