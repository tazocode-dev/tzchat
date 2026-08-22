// routes/admin/termsRouter.js
// base: /api/admin
// -----------------------------------------------
// 관리자 약관 발행/조회 라우터 — 실제 로직은 controllers/admin/adminTerms.controller.js에 있다 (지침 §1).
// 공통 인증과 DB 기반 master 권한 검사를 순서대로 적용한다.
// -----------------------------------------------
const express = require('express');
const router = express.Router();

const authMiddleware = require('@/middlewares/authMiddleware');
const requireMaster = require('@/middlewares/requireMaster'); // req.user.role === 'master' 확인
const controller = require('@/controllers/admin/adminTerms.controller');

// /api/admin 에 마운트되므로 실제 경로는 /api/admin/...
router.use(authMiddleware, requireMaster);

router.post('/terms', controller.create);
router.get('/terms', controller.list);

module.exports = router;
