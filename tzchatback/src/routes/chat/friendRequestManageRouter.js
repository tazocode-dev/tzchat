// src/routes/chat/friendRequestManageRouter.js
// base: /api
// ------------------------------------------------------------
// 친구 "신청 처리/목록" 전용 라우터 — 실제 로직은 controllers/chat/friendRequestManage.controller.js에 있다 (지침 §1).
// - PUT  /friend-request/:id/accept  : 신청 수락 (채팅방 생성/반환)
// - PUT  /friend-request/:id/reject  : 신청 거절
// - PUT  /friend-request/:id/block   : 신청에서 바로 차단
// - GET  /friend-requests/received   : 받은 신청 목록
// - GET  /friend-requests/sent       : 보낸 신청 목록
// ------------------------------------------------------------
const express = require('express');
const requireLogin = require('@/middlewares/authMiddleware');
const blockIfPendingDeletion = require('@/middlewares/blockIfPendingDeletion');
const controller = require('@/controllers/chat/friendRequestManage.controller');

const router = express.Router();
router.use(requireLogin, blockIfPendingDeletion, controller.requestLogger);

router.put('/friend-request/:id/accept', controller.accept);
router.put('/friend-request/:id/reject', controller.reject);
router.put('/friend-request/:id/block', controller.blockFrom);
router.get('/friend-requests/received', controller.received);
router.get('/friend-requests/sent', controller.sent);
router.get('/friend-requests/speed/results', controller.speedResults);

module.exports = router;
