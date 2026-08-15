// src/routes/chat/chatMessageRouter.js
// base: /api
// -------------------------------------------------------------
// 📨 채팅 메시지 라우터 — 실제 로직은 controllers/chat/chatMessage.controller.js에 있다 (지침 §1).
// - POST /chatrooms/:id/message       : 텍스트/이미지 전송(+ lastMessage 갱신, 소켓, 푸시)
// - PUT  /chatrooms/:id/read          : 읽음 처리(readBy 추가, 소켓)
// - POST /chatrooms/:id/upload-image  : 이미지 업로드(1024px 리사이즈, 확장자/타입 정합성)
// -------------------------------------------------------------
const express = require('express');

const requireLogin = require('@/middlewares/authMiddleware');
const blockIfPendingDeletion = require('@/middlewares/blockIfPendingDeletion');
const controller = require('@/controllers/chat/chatMessage.controller');

const router = express.Router();
router.use(requireLogin, blockIfPendingDeletion);

router.post('/chatrooms/:id/message', controller.postMessage);
router.put('/chatrooms/:id/read', controller.putRead);
router.post('/chatrooms/:id/upload-image', controller.uploadMiddleware.single('image'), controller.postUploadImage);

module.exports = router;
