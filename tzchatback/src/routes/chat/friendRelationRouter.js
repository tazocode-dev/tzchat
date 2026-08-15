// src/routes/chat/friendRelationRouter.js
// base: /api
// ------------------------------------------------------------
// 친구/차단 "관계" 전용 라우터 — 실제 로직은 controllers/chat/friendRelation.controller.js에 있다 (지침 §1).
// - GET    /friends                 : 친구 목록
// - DELETE /friend/:id              : 친구 삭제
// - GET    /blocks                  : 차단 목록
// - PUT    /block/:id               : 일반 차단 생성
// - DELETE /block/:id               : 차단 해제
// - GET    /users/:id               : 유저 프로필(+ isFriend/isBlocked)
// ------------------------------------------------------------

const express = require('express');
const requireLogin = require('@/middlewares/authMiddleware');
const blockIfPendingDeletion = require('@/middlewares/blockIfPendingDeletion');
const controller = require('@/controllers/chat/friendRelation.controller');

const router = express.Router();
router.use(requireLogin, blockIfPendingDeletion, controller.requestLogger);

router.get('/friends', controller.listFriends);
router.delete('/friend/:id', controller.deleteFriend);
router.get('/blocks', controller.listBlocks);
router.put('/block/:id', controller.putBlock);
router.delete('/block/:id', controller.deleteBlock);
router.get('/notifications/status', controller.notificationStatus);
router.put('/notifications/:category/read', controller.readNotification);
router.get('/users/:id', controller.getUserProfile);

module.exports = router;
