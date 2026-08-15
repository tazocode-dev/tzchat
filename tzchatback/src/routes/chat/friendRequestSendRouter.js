// src/routes/chat/friendRequestSendRouter.js
// base: /api
// ------------------------------------------------------------
// 친구 "신청 발송/취소" 전용 라우터 — 실제 로직은 controllers/chat/friendRequestSend.controller.js에 있다 (지침 §1).
// - POST   /friend-request           : 일반 매칭 신청
// - POST   /friend-request-speed     : 스피드 매칭 신청
// - POST   /friend-request-premium   : 이전 앱 호환용 스피드 매칭 별칭
// - DELETE /friend-request/:id       : 신청 취소
// ------------------------------------------------------------
const express = require('express');
const requireLogin = require('@/middlewares/authMiddleware');
const blockIfPendingDeletion = require('@/middlewares/blockIfPendingDeletion');
const controller = require('@/controllers/chat/friendRequestSend.controller');

const router = express.Router();
router.use(requireLogin, blockIfPendingDeletion, controller.requestLogger);

router.post('/friend-request', controller.postFriendRequest);
router.post('/friend-request-speed', controller.postFriendRequestSpeed);
router.post('/friend-request-premium', controller.postFriendRequestSpeed);
router.delete('/friend-request/:id', controller.deleteFriendRequest);

module.exports = router;
