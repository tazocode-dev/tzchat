// backend/routes/user/authRouter.js
// base: /api
// ------------------------------------------------------
// 회원가입 + 공개 유저 목록
// - POST /signup (기존 아이디·비밀번호 회원가입 호환)
// - GET  /users   (간단 공개 목록)
// ------------------------------------------------------

const express = require('express');

const controller = require('@/controllers/auth.controller');
const authMiddleware = require('@/middlewares/authMiddleware');
const requireCompletedOnboarding = require('@/middlewares/requireCompletedOnboarding');

const router = express.Router();

// 회원가입 — 실제 비즈니스 로직은 services/authService.js에 있다 (지침 §1).
router.post('/signup', controller.signup);

// 사용자 목록은 메인 기능이므로 인증과 필수 완료 게이트를 적용한다.
router.get('/users', authMiddleware, requireCompletedOnboarding, controller.listUsers);

module.exports = router;
