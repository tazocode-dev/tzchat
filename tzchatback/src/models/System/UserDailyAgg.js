// models/System/UserDailyAgg.js
// tzchat 프로젝트 - 사용자 일일 활동 집계(원천 지표)
// - 매일 11:00(KST) 리셋 기준으로 '해당일' 집계 문서를 1건 유지
// - jobs/dailyScoreJob.js 에 의해 생성/업데이트됨

const mongoose = require('mongoose');

const UserDailyAggSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
    ymd: { type: String, index: true, required: true }, // 'YYYY-MM-DD' (KST 기준)
    // 활동 카운트(필요에 따라 확장)
    messagesSent: { type: Number, default: 0 },
    messagesRecv: { type: Number, default: 0 }, // (옵션) 필요시 채팅방 참여자 기준 수신 추정
    friendReqSent: { type: Number, default: 0 },
    friendReqRecv: { type: Number, default: 0 },
    friendReqAccepted: { type: Number, default: 0 },
    blocksDone: { type: Number, default: 0 },

    // 여유 필드
    meta: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

UserDailyAggSchema.index({ user: 1, ymd: 1 }, { unique: true });

module.exports = mongoose.model('UserDailyAgg', UserDailyAggSchema);
