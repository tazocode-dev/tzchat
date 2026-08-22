// src/services/chat/chatMessageService.js
// ────────────────────────────────────────────────────────────
// 채팅 메시지 도메인 서비스 (지침 §1). routes/chat/chatMessageRouter.js에서 분리.
// ────────────────────────────────────────────────────────────

const mongoose = require('mongoose');
const { ChatRoom, Message } = require('@/models');
const { toAbsoluteMediaUrl } = require('@/utils/mediaUrl');
const { getHiddenAt } = require('@/services/chat/chatRoomService');
const { normalizeUserId, areUsersBlocked } = require('@/services/chat/blockPolicyService');
const { validateUserGeneratedText } = require('@/services/system/ugcContentPolicyService');

class ChatMessageError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// 업로드 API가 반환하는 현재 경로(/YYYY/MM/DD/<roomId>/file)와
// 날짜 폴더 도입 전 경로(/<roomId>/file)만 신규 메시지에 허용한다.
// 과거 DB에 저장된 GIF 메시지는 조회 시 이 검증을 다시 거치지 않으므로 계속 표시된다.
function validateChatImagePathForDb(input, roomId) {
  if (typeof input !== 'string') {
    throw new ChatMessageError(400, '이미지 경로가 올바르지 않습니다.', 'INVALID_CHAT_IMAGE_PATH');
  }
  const value = input.trim();
  const normalizedRoomId = String(roomId || '').trim();
  const safeRoomId = normalizedRoomId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pathPattern = new RegExp(
    `^/uploads/chat/(?:\\d{4}/\\d{2}/\\d{2}/)?${safeRoomId}/[a-f0-9]{32}\\.(?:jpe?g|png|webp)$`,
    'i'
  );
  if (!normalizedRoomId || value.includes('\\') || value.includes('%') || !pathPattern.test(value)) {
    throw new ChatMessageError(400, '이미지 경로가 올바르지 않습니다.', 'INVALID_CHAT_IMAGE_PATH');
  }
  return value;
}

/* ===========================================
 * [1] 메시지 전송 (텍스트/이미지)
 * =========================================== */
async function assertCanUseChatRoom(roomId, myId, dependencies = {}) {
  let normalizedMyId;
  try {
    normalizedMyId = normalizeUserId(myId, '요청자');
  } catch (error) {
    throw new ChatMessageError(error.status || 400, error.message);
  }
  const ChatRoomModel = dependencies.ChatRoomModel || ChatRoom;
  const checkBlocked = dependencies.areUsersBlocked || areUsersBlocked;
  const chatRoom = await ChatRoomModel.findById(roomId);
  const isMember = chatRoom?.participants?.some(participant => String(participant?._id || participant) === normalizedMyId);
  if (!chatRoom || !isMember) throw new ChatMessageError(403, '채팅방 접근 권한 없음');
  const partner = (chatRoom.participants || [])
    .find(participant => String(participant?._id || participant) !== normalizedMyId);
  if (!partner || await checkBlocked(normalizedMyId, String(partner?._id || partner), dependencies)) {
    throw new ChatMessageError(403, '차단 관계에서는 메시지를 전송할 수 없습니다.');
  }
  return chatRoom;
}

async function sendMessage(roomId, myId, { content, type }, req, dependencies = {}) {
  const myObjId = new mongoose.Types.ObjectId(String(myId));

  const normalizedType = type == null ? 'text' : String(type).trim();
  if (!['text', 'image'].includes(normalizedType)) {
    throw new ChatMessageError(400, '지원하지 않는 메시지 형식입니다.', 'INVALID_CHAT_MESSAGE_TYPE');
  }

  let normalizedContent;
  if (normalizedType === 'image') {
    normalizedContent = validateChatImagePathForDb(content, roomId);
  } else {
    try {
      normalizedContent = validateUserGeneratedText(content, { field: 'chatMessage' });
    } catch (error) {
      throw new ChatMessageError(error.status || 400, error.message, error.code);
    }
  }

  const chatRoom = await assertCanUseChatRoom(roomId, myId, dependencies);
  const MessageModel = dependencies.MessageModel || Message;

  const messageData = {
    chatRoom: roomId, sender: myObjId, type: normalizedType,
    readBy: [myObjId], content: '', imageUrl: ''
  };

  if (normalizedType === 'image') {
    messageData.imageUrl = normalizedContent;
  } else {
    messageData.content = normalizedContent;
  }

  let message = await MessageModel.create(messageData);
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

  message = await MessageModel.findById(message._id).populate('sender', 'nickname').lean();

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
  validateChatImagePathForDb,
  assertCanUseChatRoom,
  sendMessage,
  notifyNewMessage,
  markAsRead,
  buildMarkAsReadFilter,
};
