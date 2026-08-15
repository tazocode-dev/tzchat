// routes/admin/termsRouter.js
// base: /api/admin
// -----------------------------------------------
// 관리자 약관 발행/조회 라우터 — 실제 로직은 controllers/admin/adminTerms.controller.js에 있다 (지침 §1).
// 주의: 다른 admin 라우터와 달리 authMiddleware가 아니라 requireLogin + requireMaster
// 미들웨어를 직접 사용한다 (원본 그대로 보존).
// -----------------------------------------------
const express = require('express');
const router = express.Router();

const requireLogin = require('@/middlewares/requireLogin');   // JWT/세션에서 req.user 세팅
const requireMaster = require('@/middlewares/requireMaster'); // req.user.role === 'master' 확인
const controller = require('@/controllers/admin/adminTerms.controller');

// /api/admin 에 마운트되므로 실제 경로는 /api/admin/...
router.use(requireLogin, requireMaster);

router.post('/terms', controller.create);
router.get('/terms', controller.list);

module.exports = router;
