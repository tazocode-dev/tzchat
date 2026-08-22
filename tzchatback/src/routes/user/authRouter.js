// backend/routes/user/authRouter.js
// base: /api
// ------------------------------------------------------
// 인증된 사용자의 유저 목록
// - GET  /users   (간단 공개 목록)
// ------------------------------------------------------

const express = require('express');

const controller = require('@/controllers/auth.controller');
const authMiddleware = require('@/middlewares/authMiddleware');
const requireCompletedOnboarding = require('@/middlewares/requireCompletedOnboarding');

const router = express.Router();

// 사용자 목록은 메인 기능이므로 인증과 필수 완료 게이트를 적용한다.
router.get('/users', authMiddleware, requireCompletedOnboarding, controller.listUsers);

module.exports = router;
