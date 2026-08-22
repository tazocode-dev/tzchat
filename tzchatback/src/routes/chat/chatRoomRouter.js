// src/routes/chat/chatRoomRouter.js
// base: /api
// -------------------------------------------------------------
// 💬 채팅방 라우터 — 실제 로직은 controllers/chat/chatRoom.controller.js에 있다 (지침 §1).
// - GET    /chatrooms                   : 내 채팅방 목록(마지막 메시지+미읽음 수)
// - GET    /chatrooms/unread-total      : 총 미읽음 합계(TopMenu 뱃지)
// - GET    /chatrooms/partners          : 내가 대화한 상대 ID 목록
// - GET    /chatrooms/:id               : 채팅방 상세(참가자+메시지 목록)
// - POST   /chatrooms                   : 1:1 방 생성 또는 기존 방 반환
// - DELETE /chatrooms/:id               : 요청 사용자 목록에서만 숨김(원본 보존)
// -------------------------------------------------------------
const express = require('express');

const authMiddleware = require('@/middlewares/authMiddleware');
const controller = require('@/controllers/chat/chatRoom.controller');

const router = express.Router();
router.use(authMiddleware);

router.get('/chatrooms', controller.listRooms);
router.get('/chatrooms/unread-total', controller.unreadTotal);
router.get('/chatrooms/partners', controller.partners);
router.get('/chatrooms/:id', controller.roomDetail);
router.post('/chatrooms', controller.createRoom);
router.delete('/chatrooms/:id', controller.removeRoom);

module.exports = router;
