// /routes/membership/membershipRouter.js
// -----------------------------------------------
// 멤버십 플랜 조회 라우터 (임시 구매 페이지용) — 실제 로직은
// controllers/membership/membership.controller.js에 있다 (지침 §1).
// - GET /api/membership/plans?gender=male|female
// - 성별별 혜택 문구/가격/정렬을 반환
// - 베타 종료 여부 / 현재 기본 등급도 함께 제공
//
// 마운트: routes/index.js 에서 app.use('/api/membership', membershipRouter)
// -----------------------------------------------

const express = require('express');
const router = express.Router();

const controller = require('@/controllers/membership/membership.controller');

router.get('/plans', controller.plans);
router.get('/health', controller.health);

module.exports = router;
