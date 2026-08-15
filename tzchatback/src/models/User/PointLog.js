// backend/models/User/PointLog.js
// ------------------------------------------------------------
// PointLog 모델 (포인트 원장)
// - heart / star / ruby 변동을 모두 기록
// - 서비스/라우터에서 포인트 변동 시 반드시 로그를 남길 것
// - 일관성: balanceBefore + delta = balanceAfter
// - 인덱스: user+createdAt, user+currency+createdAt, type+createdAt 등
// ------------------------------------------------------------
const mongoose = require('mongoose');

const { Schema } = mongoose;

const PointLogSchema = new Schema(
  {
    // 대상 유저
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // 포인트 종류
    currency: {
      type: String,
      enum: ['heart', 'star', 'ruby'],
      required: true,
    },

    // 변동 유형(필요 시 확장)
    type: {
      type: String,
      enum: [
        // 지급/차감 공통
        'system_adjust',          // 시스템 수동 정정(비상/테스트)
        'admin_grant',            // 관리자 지급
        'admin_deduct',           // 관리자 차감

        // 사용/소비
        'friend_request_spend',   // 친구신청 시 차감

        // 되돌림/환불
        'friend_request_refund',  // 친구신청 취소/실패 환불
        'rollback',               // 기타 롤백(예외 처리)

        // 자동 지급/이벤트/구매
        'daily_grant',            // 일일 지급(하트 등)
        'signup_bonus',           // 가입 보너스
        'event_reward',           // 이벤트 보상
        'purchase',               // 유료 구매(루비)
        'purchase_bonus',         // 구매 보너스(덤)
      ],
      required: true,
      index: true,
    },

    // 증감값(음수 가능)
    delta: { type: Number, required: true },

    // 변동 이전/이후 잔액 (정합성 확인에 사용)
    balanceBefore: { type: Number, required: true, min: 0 },
    balanceAfter:  { type: Number, required: true, min: 0 },

    // 관련 엔터티(있을 때만)
    relatedUser:   { type: Schema.Types.ObjectId, ref: 'User', default: null },
    friendRequest: { type: Schema.Types.ObjectId, default: null }, // 모델명 고정 안함(루트에서 populate 안해도 됨)
    chatRoom:      { type: Schema.Types.ObjectId, default: null },

    // 부가 정보
    reason: { type: String, default: '' },     // 간단한 사유/메모
    meta:   { type: Schema.Types.Mixed, default: {} }, // 상세 메타(자유 필드)

    // 트레이스(누가/어디서)
    trace: {
      by:     { type: String, enum: ['system', 'user', 'admin'], default: 'system' },
      actor:  { type: String, default: null },   // 실행 주체 식별자(관리자ID/유저ID/서버명 등 문자열)
      source: { type: String, default: null },   // 호출 소스(service/router/job 등)
      ip:         { type: String, default: null },
      userAgent:  { type: String, default: null },
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

// ────────────────────────────────────────────────────────────
// 유효성: balanceBefore + delta === balanceAfter
// ────────────────────────────────────────────────────────────
PointLogSchema.pre('validate', function (next) {
  try {
    const before = Number(this.balanceBefore ?? 0);
    const delta  = Number(this.delta ?? 0);
    const after  = Number(this.balanceAfter ?? 0);
    if (before + delta !== after) {
      return next(new Error('PointLog 정합성 오류: balanceBefore + delta != balanceAfter'));
    }
    if (after < 0 || before < 0) {
      return next(new Error('PointLog 정합성 오류: 잔액은 음수가 될 수 없습니다.'));
    }
    next();
  } catch (e) {
    next(e);
  }
});

// ────────────────────────────────────────────────────────────
// 인덱스
// ────────────────────────────────────────────────────────────
PointLogSchema.index({ user: 1, createdAt: -1 }, { name: 'user_createdAt' });
PointLogSchema.index({ user: 1, currency: 1, createdAt: -1 }, { name: 'user_currency_createdAt' });
PointLogSchema.index({ type: 1, createdAt: -1 }, { name: 'type_createdAt' });
PointLogSchema.index({ friendRequest: 1 }, { name: 'friendRequest_1' });

// ────────────────────────────────────────────────────────────
/**
 * 정규 API(서비스)에서 호출할 로그 기록 헬퍼
 * - 트랜잭션 session을 인자로 받을 수 있음
 * - balanceBefore/After는 호출측에서 계산하여 전달(서비스에서 User 업데이트 직후 값 사용)
 *
 * @param {Object} params
 * @param {String|ObjectId} params.userId
 * @param {'heart'|'star'|'ruby'} params.currency
 * @param {Number} params.delta
 * @param {String} params.type
 * @param {Number} params.balanceBefore
 * @param {Number} params.balanceAfter
 * @param {String} [params.reason]
 * @param {Object} [params.meta]
 * @param {String|ObjectId} [params.relatedUserId]
 * @param {String|ObjectId} [params.friendRequestId]
 * @param {String|ObjectId} [params.chatRoomId]
 * @param {{ by?: 'system'|'user'|'admin', actor?: string, source?: string, ip?: string, userAgent?: string }} [params.trace]
 * @param {ClientSession} [session]
 */
PointLogSchema.statics.recordChange = async function (params = {}, session) {
  const {
    userId,
    currency,
    delta,
    type,
    balanceBefore,
    balanceAfter,
    reason = '',
    meta = {},
    relatedUserId = null,
    friendRequestId = null,
    chatRoomId = null,
    trace = {},
  } = params;

  const doc = {
    user: userId,
    currency,
    type,
    delta,
    balanceBefore,
    balanceAfter,
    reason,
    meta,
    relatedUser: relatedUserId,
    friendRequest: friendRequestId,
    chatRoom: chatRoomId,
    trace: {
      by: trace.by ?? 'system',
      actor: trace.actor ?? null,
      source: trace.source ?? null,
      ip: trace.ip ?? null,
      userAgent: trace.userAgent ?? null,
    },
  };

  return this.create([doc], { session }).then((arr) => arr[0]);
};

/**
 * 기본 내역 조회(페이징)
 * @param {Object} opt
 * @param {String|ObjectId} opt.userId
 * @param {'heart'|'star'|'ruby'} [opt.currency]
 * @param {Number} [opt.limit=20]
 * @param {Number} [opt.skip=0]
 */
PointLogSchema.statics.listHistory = async function (opt = {}) {
  const { userId, currency, limit = 20, skip = 0 } = opt;
  const q = { user: userId };
  if (currency) q.currency = currency;
  return this.find(q)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Math.min(limit, 100));
};

module.exports = mongoose.model('PointLog', PointLogSchema);
