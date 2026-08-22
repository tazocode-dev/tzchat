// src/socket/index.js
// -------------------------------------------------------------
// Socket.IO 초기화. main.js에서 분리(지침: server.js/app.js/socket 관심사 분리).
// -------------------------------------------------------------
const { Server } = require('socket.io');
const { createOriginVerifier } = require('@/config/corsOrigins');
const { sendPushToUser } = require('@/services/push/sender');
const { createSocketAuthMiddleware } = require('@/socket/socketAuth');
const { userRoom } = require('@/socket/userConnections');

function initSocket(httpServer, { app, sessionMiddleware, allowedOriginsList, ChatRoom, User }) {
  const verifyCorsOrigin = createOriginVerifier(allowedOriginsList, 'Socket.IO CORS blocked');
  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin: verifyCorsOrigin,
      credentials: true,
    },
  });
  console.log('🔌 Socket.IO 경로(/socket.io) 및 CORS 적용');

  io.use((socket, next) => { sessionMiddleware(socket.request, {}, next); });

  io.use(createSocketAuthMiddleware({ UserModel: User }));

  const onlineUsers = new Set();
  const roomMembers = new Map();
  app.set('io', io);
  app.set('onlineUsers', onlineUsers);
  app.set('roomMembers', roomMembers);

  async function notifyRoomParticipantsForList(roomId, lastMessagePayload) {
    try {
      const room = await ChatRoom.findById(roomId).select('participants').lean();
      const ids = room?.participants?.map((id) => String(id)) || [];
      ids.forEach((pid) => {
        io.to(userRoom(pid)).emit('chatrooms:badge', { changedRoomId: roomId });
        io.to(userRoom(pid)).emit('chatrooms:updated', {
          changedRoomId: roomId,
          lastMessage: lastMessagePayload || null,
        });
      });
      console.log(`[notifyRoomParticipantsForList] room=${roomId} -> users=${ids.join(',')}`);
    } catch (err) {
      console.error('[notifyRoomParticipantsForList] ❌', err);
    }
  }
  app.set('emit', {
    toUser(userId, event, payload) {
      if (!userId) return;
      io.to(userRoom(userId)).emit(event, payload);
    },

    // 친구 신청 소켓 알림. 푸시는 friendRequestSendService에서 유형별 문구로 한 번만 보낸다.
    friendRequestCreated(reqObj) {
      const fromId = typeof reqObj.from === 'object' ? reqObj.from._id : reqObj.from;
      const toId   = typeof reqObj.to   === 'object' ? reqObj.to._id   : reqObj.to;

      if (fromId) io.to(userRoom(fromId)).emit('friendRequest:created', reqObj);
      if (toId) {
        io.to(userRoom(toId)).emit('friendRequest:created', reqObj);
      }
    },

    friendRequestAccepted(reqObj) {
      const fromId = typeof reqObj.from === 'object' ? reqObj.from._id : reqObj.from;
      const toId = typeof reqObj.to === 'object' ? reqObj.to._id : reqObj.to;
      if (fromId) io.to(userRoom(fromId)).emit('friendRequest:accepted', reqObj);
      if (toId) io.to(userRoom(toId)).emit('friendRequest:accepted', reqObj);
    },
    friendRequestRejected(reqObj) {
      const fromId = typeof reqObj.from === 'object' ? reqObj.from._id : reqObj.from;
      const toId = typeof reqObj.to === 'object' ? reqObj.to._id : reqObj.to;
      if (fromId) io.to(userRoom(fromId)).emit('friendRequest:rejected', reqObj);
      if (toId) io.to(userRoom(toId)).emit('friendRequest:rejected', reqObj);
    },
    friendRequestCancelled(reqObj) {
      const fromId = typeof reqObj.from === 'object' ? reqObj.from._id : reqObj.from;
      const toId = typeof reqObj.to === 'object' ? reqObj.to._id : reqObj.to;
      if (fromId) io.to(userRoom(fromId)).emit('friendRequest:cancelled', reqObj);
      if (toId) io.to(userRoom(toId)).emit('friendRequest:cancelled', reqObj);
    },
    blockCreated(blockObj) {
      const { blockerId, blockedId } = blockObj || {};
      if (blockerId) io.to(userRoom(blockerId)).emit('block:created', blockObj);
      if (blockedId) io.to(userRoom(blockedId)).emit('block:created', blockObj);
    },

    notificationsChanged(userIds, categories = []) {
      const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean).map(String))];
      ids.forEach((uid) => {
        io.to(userRoom(uid)).emit('notifications:changed', { categories });
      });
    },

    // ✅ 채팅 메시지 수신자들에게 FCM 푸시 추가(보낸 사람 제외)
    async chatMessageNew(roomId, message) {
      try {
        io.to(roomId).emit('chatMessage', message);

        const lastPayload = {
          _id: message?._id,
          content: message?.content || '',
          imageUrl: message?.imageUrl || '',
          sender: message?.sender || null,
          createdAt: message?.createdAt || new Date(),
        };
        await notifyRoomParticipantsForList(roomId, lastPayload);

        // 푸시 전송: 참여자 조회 후 보낸 사람 제외하고 일괄 전송
        try {
          const room = await ChatRoom.findById(roomId).select('participants').lean();
          const senderId = typeof message?.sender === 'object' ? message.sender?._id : message?.sender;
          const targets = (room?.participants || [])
            .map(String)
            .filter(uid => uid && String(uid) !== String(senderId));

          await Promise.allSettled(
            targets.map(uid =>
              sendPushToUser(uid, {
                type: 'chat',
                title: '새 메시지',
                // 잠금 화면에서 사적인 대화 내용을 노출하지 않는다.
                body: '새 메시지가 도착했습니다.',
                roomId: String(roomId),
              })
            )
          );
        } catch (e) {
          console.warn('[emit.chatMessageNew][push] skip:', e?.message || e);
        }

        console.log('[emit.chatMessageNew] ✅ room=', roomId);
      } catch (err) {
        console.error('[emit.chatMessageNew] ❌', err);
      }
    },

    async chatMessagesRead(roomId, readerId, messageIds) {
      try {
        io.to(roomId).emit('messagesRead', { roomId, readerId, messageIds });
        // 미읽음 수가 바뀌는 사용자는 실제 읽은 당사자뿐이다. 상대방에게까지
        // 배지 재계산 이벤트를 보내면 송신자의 열람이 수신자 NEW에 영향을 줄 수 있다.
        io.to(userRoom(readerId)).emit('chatrooms:badge', { changedRoomId: roomId });
        console.log('[emit.chatMessagesRead] ✅ room=', roomId, 'count=', messageIds?.length || 0);
      } catch (err) {
        console.error('[emit.chatMessagesRead] ❌', err);
      }
    },
  });

  io.on('connection', (socket) => {
    try {
      const userId = String(socket.user._id);

      console.log('[SOCKET][CONN]', { sid: socket.id, via: socket.authVia });

      onlineUsers.add(userId);
      socket.join(userRoom(userId));
      console.log('👤 자동 개인룸 조인');

      socket.on('join', (payload = {}) => {
        try {
          const requestedId = String(payload.userId || '');
          if (requestedId && requestedId !== userId) {
            console.warn('[SOCKET][AUTH][REJECT]', { step: 'join', requestedId, userId });
          }
          socket.join(userRoom(userId));
          console.log(`[SOCKET][MSG] join`, { roomId: userRoom(userId), from: userId, type: 'personal' });
        } catch (err) {
          console.log('[SOCKET][ERR]', { step: 'join', message: err.message });
        }
      });

      socket.on('joinRoom', async (roomId) => {
        try {
          if (!roomId) return;
          const isParticipant = await ChatRoom.exists({ _id: roomId, participants: userId });
          if (!isParticipant) {
            console.warn('[SOCKET][AUTH][REJECT]', { step: 'joinRoom', roomId, userId });
            return;
          }
          socket.join(roomId);
          console.log(`[SOCKET][MSG] joinRoom`, { roomId, type: 'chatroom' });
          if (!roomMembers.has(roomId)) roomMembers.set(roomId, new Set());
          roomMembers.get(roomId).add(userId);
        } catch (err) {
          console.log('[SOCKET][ERR]', { step: 'joinRoom', message: err.message });
        }
      });

      socket.on('leaveRoom', (roomId) => {
        try {
          socket.leave(roomId);
          console.log(`[SOCKET][MSG] leaveRoom`, { roomId });
          if (roomMembers.has(roomId)) {
            roomMembers.get(roomId).delete(userId);
          }
        } catch (err) {
          console.log('[SOCKET][ERR]', { step: 'leaveRoom', message: err.message });
        }
      });

      socket.on('disconnect', () => {
        try {
          console.log(`[SOCKET][DISC]`, { sid: socket.id });
          onlineUsers.delete(userId);
          for (const set of roomMembers.values()) set.delete(userId);
        } catch (err) {
          console.log('[SOCKET][ERR]', { step: 'disconnect', message: err.message });
        }
      });
    } catch (err) {
      console.error('❌ 소켓 connection 핸들러 오류:', err);
    }
  });

  return io;
}

module.exports = { initSocket };
