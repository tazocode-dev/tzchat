/**
 * 결제 라우터 (임시 / 인앱결제 도입 전용) — 실제 로직은 controllers/payment/payment.controller.js에 있다 (지침 §1).
 * ------------------------------------------------------------
 * - POST /api/purchase
 *   { userId, planCode, gender } → MembershipOrder 생성
 * - 결제 성공 후 user.user_level 갱신 (mock)
 * - 실제 결제 없음. 임시 구매 페이지 전용 API
 */

const express = require('express');
const router = express.Router();
const controller = require('@/controllers/payment/payment.controller');

router.post('/purchase', controller.postPurchase);
router.get('/purchase/history', controller.purchaseHistory);
router.get('/health', controller.health);

module.exports = router;
