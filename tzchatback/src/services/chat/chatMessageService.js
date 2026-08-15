// src/services/chat/chatMessageService.js
// ────────────────────────────────────────────────────────────
// 채팅 메시지 도메인 서비스 (지침 §1). routes/chat/chatMessageRouter.js에서 분리.
// ────────────────────────────────────────────────────────────

const mongoose = require('mongoose');
const { ChatRoom, Message } = require('@/models');
const { toAbsoluteMediaUrl } = require('@/utils/mediaUrl');
const { getHiddenAt } = require('@/services/chat/chatRoomService');

class ChatMessageError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ✅ 이미지 메시지 저장값을 항상 상대경로(/uploads/...)로 정규화
function normalizeUploadPathForDb(input) {
  if (!input) return '';
  const s = String(input).trim();

  // 절대 URL이면 /uploads/... 부분만 떼서 저장
  if (/^https?:\/\//i.test(s)) {
    try {
      const url = new URL(s);
      if (url.pathname.startsWith('/uploads/')) return url.pathname;
      return s; // uploads가 아니면 그대로 (원치 않으면 ''로 바꿔도 됨)
    } catch {
      // 실패 시 아래로
    }
  }

  // 상대경로 업로드
  if (s.startsWith('/uploads/')) return s;
  if (s.startsWith('uploads/')) return `/${s}`;
  return s;
}

/* ===========================================
 * [1] 메시지 전송 (텍스트/이미지)
 * =========================================== */
async function sendMessage(roomId, myId, { content, type }, req) {
  const myObjId = new mongoose.Types.ObjectId(String(myId));

  if (type !== 'image' && (!content || !content.trim())) {
    throw new ChatMessageError(400, '메시지 내용이 비어 있습니다');
  }

  const chatRoom = await ChatRoom.findById(roomId);
  const isMember = chatRoom?.participants?.some(p => String(p) === String(myId));
  if (!chatRoom || !isMember) throw new ChatMessageError(403, '채팅방 접근 권한 없음');

  const messageData = {
    chatRoom: roomId, sender: myObjId, type: type || 'text',
    readBy: [myObjId], content: '', imageUrl: ''
  };

  if (type === 'image') {
    // ✅ DB에는 /uploads/... 상대경로만 저장
    messageData.imageUrl = normalizeUploadPathForDb(content);
  } else {
    messageData.content = content;
  }

  let message = await Message.create(messageData);
  chatRoom.messages.push(message._id);

  if (typeof chatRoom.setLastMessageAndTouch === 'function') {
    chatRoom.setLastMessageAndTouch({
      content: message.content || '',
      imageUrl: message.imageUrl || '',
      sender: message.sender,
      createdAt: message.createdAt
    });
  } else {
    chatRoom.lastMessage = {
      content: message.content || '',
      imageUrl: message.imageUrl || '',
      sender: message.sender,
      createdAt: message.createdAt
    };
    chatRoom.updatedAt = new Date();
  }
  await chatRoom.save();

  message = await Message.findById(message._id).populate('sender', 'nickname').lean();

  // ✅ 응답/소켓에는 절대 URL로 정규화(https + 도메인 강제)
  message.imageUrl = toAbsoluteMediaUrl(message.imageUrl || '', req);

  return { chatRoom, message };
}

// 신규 메시지 알림(소켓+푸시). emit.chatMessageNew가 있으면 그쪽이 소켓emit과 푸시를 모두
// 처리하므로, 여기서는 emit이 없을 때만(비정상 상황) 소켓 배지 갱신 + 푸시를 대신 보낸다.
// ⚠️ 이전 라우터 코드는 emit.chatMessageNew가 있어도 별도로 또 push를 보내
// 매 메시지마다 푸시가 "두 번" 발송되는 버그가 있었다. socket/index.js의
// emit.chatMessageNew가 이미 push까지 책임지므로 여기서는 폴백 경로에서만 보낸다.
async function notifyNewMessage({ req, getEmit, getIO, chatRoom, message, myId }) {
  const emit = getEmit(req);
  if (emit && typeof emit.chatMessageNew === 'function') {
    await emit.chatMessageNew(String(chatRoom._id), message);
    return;
  }

  const io = getIO(req);
  if (io && Array.isArray(chatRoom.participants)) {
    chatRoom.participants.forEach((uid) => {
      const roomName = `user:${String(uid)}`;
      io.to(roomName).emit('chatrooms:badge', { changedRoomId: String(chatRoom._id) });
      io.to(roomName).emit('chatrooms:updated', {
        changedRoomId: String(chatRoom._id),
        lastMessage: {
          _id: message?._id,
          content: message?.content || '',
          imageUrl: message?.imageUrl || '',
          sender: message?.sender || null,
          createdAt: message?.createdAt || new Date(),
        }
      });
    });
  }

  // 폴백 경로(emit 미사용 시)에서만 직접 푸시를 보낸다.
  const { sendPushToUser } = require('@/services/push/sender');
  try {
    const targetUserIds = (chatRoom.participants || [])
      .map(String)
      .filter(uid => uid !== String(myId));

    for (const uid of targetUserIds) {
      await sendPushToUser(uid, {
        title: '새 메시지',
        body: '새 메시지가 도착했습니다.',
        type: 'chat',
        roomId: String(chatRoom._id),
      });
    }
  } catch (pushErr) {
    console.error('[PUSH][ERR]', pushErr?.message);
  }
}

/* ===========================================
 * [2] 읽음 처리
 * =========================================== */
function buildMarkAsReadFilter(roomId, myObjId, hiddenAt = null) {
  const filter = {
    chatRoom: roomId,
    sender: { $ne: myObjId },
    readBy: { $ne: myObjId },
  };
  if (hiddenAt) filter.createdAt = { $gt: hiddenAt };
  return filter;
}

async function markAsRead(roomId, myId) {
  const myObjId = new mongoose.Types.ObjectId(String(myId));

  const room = await ChatRoom.findById(roomId).select('_id participants hiddenFor');
  const isMember = room?.participants?.some(p => String(p) === String(myId));
  if (!room || !isMember) throw new ChatMessageError(403, '채팅방 접근 권한 없음');

  const filter = buildMarkAsReadFilter(roomId, myObjId, getHiddenAt(room, myObjId));
  const targets = await Message.find(filter, { _id: 1 }).lean();
  const ids = targets.map(t => t._id);

  if (ids.length) {
    await Message.updateMany({ _id: { $in: ids } }, { $addToSet: { readBy: myObjId } });
  }

  return { ids };
}

module.exports = {
  ChatMessageError,
  normalizeUploadPathForDb,
  sendMessage,
  notifyNewMessage,
  markAsRead,
  buildMarkAsReadFilter,
};
