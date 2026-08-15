// models/System/UserDailyScore.js
// tzchat 프로젝트 - 사용자 일일 노출 점수(분배용)
// - UserDailyAgg 를 가중합/정규화하여 산출
// - routes/api/search/targetRouter.js 에서 정렬 기준으로 사용

const mongoose = require('mongoose');

const UserDailyScoreSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
    ymd: { type: String, index: true, required: true }, // 'YYYY-MM-DD' (KST 기준)

    // 원천치(스냅샷)
    agg: {
      messagesSent: { type: Number, default: 0 },
      friendReqSent: { type: Number, default: 0 },
      friendReqRecv: { type: Number, default: 0 },
      friendReqAccepted: { type: Number, default: 0 },
      blocksDone: { type: Number, default: 0 },
    },

    // 가중합 점수(0~1 권장)
    activityScore: { type: Number, default: 0 },
    recencyScore: { type: Number, default: 0 }, // 최근 활동 반영(반감기 12h)
    exposureScore: { type: Number, default: 0 }, // activity ⊗ recency (최종)

    // 디버그/튜닝
    weights: {
      messagesSent: { type: Number, default: 0.25 },
      friendReqSent: { type: Number, default: 0.2 },
      friendReqRecv: { type: Number, default: 0.2 },
      friendReqAccepted: { type: Number, default: 0.3 },
      blocksDone: { type: Number, default: -0.2 },
    },
    meta: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

UserDailyScoreSchema.index({ ymd: 1, exposureScore: -1 });
UserDailyScoreSchema.index({ user: 1, ymd: 1 }, { unique: true });

module.exports = mongoose.model('UserDailyScore', UserDailyScoreSchema);
