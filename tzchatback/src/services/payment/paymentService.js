// src/services/payment/paymentService.js
// ────────────────────────────────────────────────────────────
// 결제(임시/인앱결제 도입 전) 도메인 서비스 (지침 §1). routes/payment/paymentRouter.js에서 분리.
// ────────────────────────────────────────────────────────────

const mongoose = require('mongoose');
const User = mongoose.model('User');
const { MembershipOrder } = require('@/models'); // module-alias(@) 사용 시
const { LEVEL, GENDER, PRICE_KRW } = require('@/config/membership');

class PaymentError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function krw(n) {
  if (typeof n !== 'number' || isNaN(n)) return '';
  if (n === 0) return '무료';
  return `₩${n.toLocaleString('ko-KR')}`;
}

// POST /api/purchase (임시 결제)
async function purchase({ userId, planCode, gender }) {
  if (!userId || !planCode) {
    throw new PaymentError(400, 'MISSING_PARAMS');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new PaymentError(404, 'USER_NOT_FOUND');
  }

  // planCode → 등급명 변환
  const planMap = {
    BASIC: LEVEL.BASIC,
    LIGHT: LEVEL.LIGHT,
    PREMIUM: LEVEL.PREMIUM,
  };
  const planName = planMap[planCode.toUpperCase()];
  if (!planName) {
    throw new PaymentError(400, 'INVALID_PLAN');
  }

  const price = PRICE_KRW[planName] ?? 0;

  // 1) 임시 주문 생성
  const order = await MembershipOrder.create({
    user: user._id,
    gender: gender || user.gender || GENDER.MALE,
    planCode,
    planName,
    price,
    status: 'mock_paid',
    paidAt: new Date(),
    note: '임시 결제 성공 (인앱결제 미적용)',
  });

  // 2) 사용자 등급 갱신 (mock)
  user.user_level = planName;
  await user.save();

  return {
    order: {
      id: order._id,
      planCode,
      planName,
      price,
      priceDisplay: krw(price),
      status: order.status,
      paidAt: order.paidAt,
    },
    user: {
      id: user._id,
      nickname: user.nickname,
      user_level: user.user_level,
    },
  };
}

// GET /api/purchase/history?userId=
async function getPurchaseHistory(userId) {
  if (!userId) {
    throw new PaymentError(400, 'MISSING_USER_ID');
  }

  const orders = await MembershipOrder.find({ user: userId })
    .sort({ paidAt: -1 })
    .lean();

  return orders.map((o) => ({
    id: o._id,
    planName: o.planName,
    price: o.price,
    priceDisplay: krw(o.price),
    status: o.status,
    paidAt: o.paidAt,
    note: o.note,
  }));
}

function getHealth() {
  return { service: 'payment', ts: Date.now() };
}

module.exports = { PaymentError, purchase, getPurchaseHistory, getHealth };
