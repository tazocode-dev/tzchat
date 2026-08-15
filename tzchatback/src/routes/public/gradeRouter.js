// routes/public/gradeRouter.js
// base: /api
// -------------------------------------------------------------
// 👤 회원 등급 수동 변경 (TEST) 라우터 — 실제 로직은 controllers/public/grade.controller.js에 있다 (지침 §1).
//  - DB 변경 없음: 기존 User 스키마의 user_level 필드만 갱신
//  - 허용 등급: "일반회원" | "라이트회원" | "프리미엄"
// -------------------------------------------------------------

const express = require('express');
const requireLogin = require('@/middlewares/authMiddleware');
const blockIfPendingDeletion = require('@/middlewares/blockIfPendingDeletion');
const controller = require('@/controllers/public/grade.controller');

const router = express.Router();

// 전역 미들웨어
router.use(requireLogin, blockIfPendingDeletion);

/**
 * PATCH /api/user/grade
 * body: { grade: "일반회원" | "라이트회원" | "프리미엄회원" }
 * 효과: 현재 로그인 사용자의 user_level 값을 grade로 업데이트
 */
router.patch('/user/grade', controller.updateGrade);

module.exports = router;
