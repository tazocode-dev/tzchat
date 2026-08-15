/**
 * MembershipOrder 모델
 * ------------------------------------------------------------
 * - 임시 결제(모의 결제) 및 향후 인앱결제 기록용
 * - 사용자(user), 결제등급(planName/planCode), 성별, 금액, 상태 포함
 * - 실제 PG사 결제ID나 영수증 검증 항목 추가 가능
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const MembershipOrderSchema = new Schema(
  {
    // 구매자
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    // 결제 시점 성별 (남/여 구분된 혜택용)
    gender: { type: String, enum: ['male', 'female'], default: 'male' },

    // 등급 코드 (LVBASIC/LVLIGHT/LVPREMIUM 등)
    planCode: { type: String, required: true },

    // 등급 표시명 (일반회원 / 라이트회원 / 프리미엄회원)
    planName: { type: String, required: true },

    // 결제 금액 (원화)
    price: { type: Number, required: true, min: 0 },

    // 결제 상태
    status: {
      type: String,
      enum: [
        'mock_paid',   // 임시 결제 성공
        'mock_fail',   // 임시 결제 실패
        'paid',        // 실제 결제 완료
        'cancelled',   // 취소됨
        'refunded',    // 환불됨
      ],
      default: 'mock_paid',
    },

    // 결제 완료 일시
    paidAt: { type: Date, default: null },

    // 환불/취소 일시
    cancelledAt: { type: Date, default: null },
    refundedAt: { type: Date, default: null },

    // 결제 관련 메모/비고
    note: { type: String, default: '' },

    // 인앱결제 연동 시 필요한 필드(미사용)
    receiptId: { type: String, default: null },
    transactionId: { type: String, default: null },
  },
  {
    timestamps: true, // createdAt, updatedAt 자동
  }
);

// 인덱스
MembershipOrderSchema.index({ user: 1, paidAt: -1 });
MembershipOrderSchema.index({ status: 1 });
MembershipOrderSchema.index({ planCode: 1 });

module.exports = mongoose.model('MembershipOrder', MembershipOrderSchema);
