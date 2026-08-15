// routes/system/accountDeletionRouter.js
// base: /api/account
// -----------------------------------------------
// 회원 탈퇴 라우터 — 실제 로직은 controllers/system/accountDeletion.controller.js에 있다 (지침 §1).
// -----------------------------------------------
const express = require('express');
const router = express.Router();

const requireLogin = require('@/middlewares/authMiddleware'); // 기존 프로젝트 기준
const controller = require('@/controllers/system/accountDeletion.controller');

// GET /api/account/status — 로그인 직후/앱 진입 시 계정 상태 확인 용도
router.get('/status', requireLogin, controller.status);

// POST /api/account/delete-request — 탈퇴 신청
router.post('/delete-request', requireLogin, controller.deleteRequest);

// POST /api/account/cancel-delete — 유예기간 내 탈퇴 신청 취소
router.post('/cancel-delete', requireLogin, controller.cancelDelete);

module.exports = router;
