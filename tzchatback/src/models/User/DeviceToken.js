// /server/models/User/DeviceToken.js
// -------------------------------------------------------------
// ✅ 사용자별 디바이스 토큰 저장 모델 (TTL 연동)
//  - lastSeenAt 기준으로 retention.DEVICE_TOKEN_STALE_DAYS 후 만료
//  - expiresAt(Date) + TTL 인덱스(expires: 0) 적용
// -------------------------------------------------------------
const mongoose = require('mongoose');
const { Schema, model } = mongoose;
const retention = require('@/config/retention'); // DEVICE_TOKEN_STALE_DAYS 사용

const deviceTokenSchema = new Schema(
  {
    userId:     { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    token:      { type: String, required: true, unique: true },
    platform:   { type: String, enum: ['android', 'ios', 'web'], required: true },
    app:        { type: String, default: 'tzchat' },
    appVersion: { type: String, default: '' },

    // 마지막 사용 시각
    lastSeenAt: { type: Date, default: Date.now, index: true },

    // ✅ TTL 만료 기준 시간 (MongoDB가 이 시각이 되면 자동 삭제)
    //    각 문서별로 개별 만기일을 주기 위해 expires: 0 사용
    expiresAt:  { type: Date, index: { expires: 0 } },
  },
  { timestamps: true }
);

// 만기일 계산 헬퍼
function calcExpiry(lastSeen) {
  const days = Number(retention?.DEVICE_TOKEN_STALE_DAYS ?? 180);
  const base = lastSeen instanceof Date ? lastSeen.getTime() : Date.now();
  return new Date(base + days * 24 * 60 * 60 * 1000);
}

// 저장 전 만기일 자동 설정/갱신
deviceTokenSchema.pre('save', function (next) {
  try {
    // lastSeenAt가 비었으면 현재 시각으로 보정
    if (!this.lastSeenAt) this.lastSeenAt = new Date();

    // expiresAt 미설정이거나 lastSeenAt이 바뀐 경우 재계산
    if (!this.expiresAt || this.isModified('lastSeenAt')) {
      this.expiresAt = calcExpiry(this.lastSeenAt);
    }
    next();
  } catch (e) {
    next(e);
  }
});

// 토큰 사용 시 lastSeenAt 갱신용 정적 메서드(선택 사용)
deviceTokenSchema.statics.touch = async function (token) {
  const now = new Date();
  const expires = calcExpiry(now);
  return this.updateOne(
    { token },
    { $set: { lastSeenAt: now, expiresAt: expires } }
  ).exec();
};

module.exports = model('DeviceToken', deviceTokenSchema);
