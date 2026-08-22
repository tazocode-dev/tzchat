// src/services/chat/chatRoomService.js
// ────────────────────────────────────────────────────────────
// 채팅방 도메인 서비스 (지침 §1). routes/chat/chatRoomRouter.js에서 분리.
// ────────────────────────────────────────────────────────────

const mongoose = require('mongoose');
const { ChatRoom, Message } = require('@/models');
const { toAbsoluteMediaUrl, normalizeUserPhotos } = require('@/utils/mediaUrl');
const { normalizeUserId, areUsersBlocked, getBlockedUserIdSet } = require('@/services/chat/blockPolicyService');

class ChatRoomError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const PARTICIPANT_FIELDS =
  'nickname gender profilePhotoUrl photoUrl profile.mainUrl photos.url photos.isMain suspended status isDeleted';

function participantId(participant) {
  return String(participant?._id || participant || '');
}

function otherParticipant(room, myId) {
  return (room?.participants || []).find(participant => participantId(participant) !== String(myId)) || null;
}

function isUnavailableParticipant(participant) {
  return participant?.suspended === true || participant?.isDeleted === true ||
    ['pendingDeletion', 'deleted'].includes(String(participant?.status || ''));
}

function filterAllowedRooms(rooms, myId, blockedUserIds) {
  return (rooms || []).filter(room => {
    const partner = otherParticipant(room, myId);
    return partner && !blockedUserIds.has(participantId(partner)) && !isUnavailableParticipant(partner);
  });
}

function getHiddenAt(room, userId) {
  const entry = (room?.hiddenFor || []).find(item => String(item?.user) === String(userId));
  return entry?.hiddenAt ? new Date(entry.hiddenAt) : null;
}

function buildVisibleMessagesFilter(rooms, userId) {
  const roomFilters = (rooms || []).map(room => {
    const filter = { chatRoom: room._id };
    const hiddenAt = getHiddenAt(room, userId);
    if (hiddenAt) filter.createdAt = { $gt: hiddenAt };
    return filter;
  });

  if (!roomFilters.length) return { chatRoom: { $in: [] } };
  return roomFilters.length === 1 ? roomFilters[0] : { $or: roomFilters };
}

/* ===========================================
 * [1] 채팅방 목록
 * =========================================== */
async function listMyChatRooms(myId, req) {
  const myObjId = new mongoose.Types.ObjectId(String(myId));
  const blockedUserIds = await getBlockedUserIdSet(myId);
  const foundRooms = await ChatRoom.find({ participants: myObjId })
    .select('_id participants lastMessage hiddenFor updatedAt createdAt')
    .populate('participants', PARTICIPANT_FIELDS)
    .sort({ updatedAt: -1 })
    .lean();
  const rooms = filterAllowedRooms(foundRooms, myId, blockedUserIds);

  const roomIds = rooms.map(r => r._id);
  const pipeline = [
    { $match: buildVisibleMessagesFilter(rooms, myObjId) },
    { $sort: { createdAt: -1 } },
    { $group: {
        _id: '$chatRoom',
        last: { $first: '$$ROOT' },
        unreadCount: {
          $sum: {
            $cond: [
              { $and: [
                  { $ne: ['$sender', myObjId] },
                  { $not: [{ $in: [myObjId, { $ifNull: ['$readBy', []] }] }] }
                ]},
              1, 0
            ]
          }
        }
    }}
  ];
  const agg = roomIds.length ? await Message.aggregate(pipeline) : [];
  const byRoomId = new Map(agg.map(x => [String(x._id), x]));

  return rooms.flatMap(r => {
    const extra = byRoomId.get(String(r._id));
    const hiddenAt = getHiddenAt(r, myObjId);
    if (hiddenAt && !extra?.last) return [];
    const lastDoc = extra?.last;
    const normalizedParticipants = Array.isArray(r.participants)
      ? r.participants.map(p => normalizeUserPhotos(p, req))
      : r.participants;

    const lastMessage = lastDoc
      ? {
          _id: lastDoc._id,
          content: lastDoc.content || '',
          imageUrl: toAbsoluteMediaUrl(lastDoc.imageUrl || '', req),
          sender: lastDoc.sender,
          createdAt: lastDoc.createdAt
        }
      : (r.lastMessage
          ? { ...r.lastMessage, imageUrl: toAbsoluteMediaUrl(r.lastMessage.imageUrl || '', req) }
          : null);

    return [{
      _id: r._id,
      participants: normalizedParticipants,
      lastMessage,
      unreadCount: extra?.unreadCount || 0,
      updatedAt: r.updatedAt,
      createdAt: r.createdAt
    }];
  });
}

/* ===========================================
 * [1-1] 총 미읽음 합계
 * =========================================== */
function buildUnreadTotalFilter(roomIds, myObjId, visibleMessagesFilter = null) {
  return {
    ...(visibleMessagesFilter || { chatRoom: { $in: roomIds } }),
    sender: { $ne: myObjId },
    readBy: { $ne: myObjId },
  };
}

async function getUnreadTotal(myId) {
  const myObjId = new mongoose.Types.ObjectId(String(myId));
  const blockedUserIds = await getBlockedUserIdSet(myId);
  const foundRooms = await ChatRoom.find({ participants: myObjId }).select('_id participants hiddenFor').lean();
  const rooms = filterAllowedRooms(foundRooms, myId, blockedUserIds);
  const roomIds = rooms.map(room => room._id);
  if (!roomIds.length) return 0;
  const visibleMessagesFilter = buildVisibleMessagesFilter(rooms, myObjId);
  return Message.countDocuments(buildUnreadTotalFilter(roomIds, myObjId, visibleMessagesFilter));
}

/* ===========================================
 * [1-2] 내가 대화한 상대 ID 목록
 * =========================================== */
async function getMyPartners(myId) {
  const myObjId = new mongoose.Types.ObjectId(String(myId));
  const rooms = await ChatRoom.find({ participants: myObjId }).select('participants').lean();
  const blockedUserIds = await getBlockedUserIdSet(myId);
  return [
    ...new Set(
      (rooms || [])
        .flatMap(r => Array.isArray(r.participants) ? r.participants : [])
        .map(p => String(p))
        .filter(pid => pid !== String(myId) && !blockedUserIds.has(pid))
    )
  ];
}

/* ===========================================
 * [2] 채팅방 상세(메시지 포함)
 * =========================================== */
async function getChatRoomDetail(roomId, myId, req, dependencies = {}) {
  const myObjId = new mongoose.Types.ObjectId(String(myId));
  const ChatRoomModel = dependencies.ChatRoomModel || ChatRoom;
  const MessageModel = dependencies.MessageModel || Message;
  const checkBlocked = dependencies.areUsersBlocked || areUsersBlocked;

  const chatRoom = await ChatRoomModel.findById(roomId)
    .populate('participants', PARTICIPANT_FIELDS)
    .lean();

  const isMember = chatRoom?.participants?.some(p => String(p._id || p) === String(myId));
  if (!chatRoom || !isMember) throw new ChatRoomError(403, '접근 권한 없음');
  const partner = otherParticipant(chatRoom, myId);
  if (!partner || isUnavailableParticipant(partner) || await checkBlocked(myId, participantId(partner), dependencies)) {
    throw new ChatRoomError(403, '차단 관계에서는 채팅방을 이용할 수 없습니다.');
  }

  const normalizedParticipants = Array.isArray(chatRoom.participants)
    ? chatRoom.participants.map(p => normalizeUserPhotos(p, req))
    : chatRoom.participants;

  const hiddenAt = getHiddenAt(chatRoom, myObjId);
  const messageFilter = { chatRoom: roomId };
  if (hiddenAt) messageFilter.createdAt = { $gt: hiddenAt };

  let messages = await MessageModel.find(messageFilter)
    .sort({ createdAt: 1 })
    .populate('sender', 'nickname')
    .lean();

  messages = messages.map(m => ({ ...m, imageUrl: toAbsoluteMediaUrl(m.imageUrl || '', req) }));

  return { myId: String(myObjId), participants: normalizedParticipants, messages };
}

/* ===========================================
 * [3] 채팅방 생성 or 조회 (두 명 DM)
 * =========================================== */
async function createOrGetChatRoom(myId, otherUserId, dependencies = {}) {
  let normalizedMyId; let normalizedOtherId;
  try {
    normalizedMyId = normalizeUserId(myId, '요청자');
    normalizedOtherId = normalizeUserId(otherUserId, '상대방');
  } catch (error) {
    throw new ChatRoomError(error.status || 400, error.message);
  }
  if (normalizedMyId === normalizedOtherId) throw new ChatRoomError(400, '자기 자신과 채팅방을 만들 수 없습니다.');
  const checkBlocked = dependencies.areUsersBlocked || areUsersBlocked;
  if (await checkBlocked(normalizedMyId, normalizedOtherId, dependencies)) {
    throw new ChatRoomError(403, '차단 관계에서는 채팅방을 만들 수 없습니다.');
  }
  const myObjId = new mongoose.Types.ObjectId(normalizedMyId);
  const otherObjId = new mongoose.Types.ObjectId(normalizedOtherId);

  const ChatRoomModel = dependencies.ChatRoomModel || ChatRoom;
  let chatRoom = await ChatRoomModel.findOne({
    participants: { $all: [myObjId, otherObjId], $size: 2 }
  });

  let created = false;
  if (!chatRoom) {
    chatRoom = new ChatRoomModel({ participants: [myObjId, otherObjId], messages: [] });
    await chatRoom.save();
    created = true;
  }
  return { chatRoom, created };
}

/* ===========================================
 * [4] 내 채팅 목록에서 숨김(상대방과 원본 메시지는 유지)
 * =========================================== */
async function deleteChatRoom(roomId, myId, io) {
  const room = await ChatRoom.findById(roomId).select('_id participants');
  if (!room) throw new ChatRoomError(404, '채팅방이 존재하지 않습니다.');
  const isParticipant = (room.participants || []).some(p => String(p) === String(myId));
  if (!isParticipant) throw new ChatRoomError(403, '삭제 권한이 없습니다.');

  const myObjId = new mongoose.Types.ObjectId(String(myId));
  const hiddenAt = new Date();
  await ChatRoom.updateOne(
    { _id: roomId, participants: myObjId },
    {
      $pull: { hiddenFor: { user: myObjId } },
    }
  );
  await ChatRoom.updateOne(
    { _id: roomId, participants: myObjId },
    {
      $push: { hiddenFor: { user: myObjId, hiddenAt } },
    }
  );

  if (io) {
    const ch = `user:${String(myId)}`;
    io.to(ch).emit('chatrooms:badge', { changedRoomId: String(roomId) });
    io.to(ch).emit('chatrooms:updated', { hiddenRoomId: String(roomId) });
  }

  return { hiddenAt };
}

module.exports = {
  ChatRoomError,
  listMyChatRooms,
  getUnreadTotal,
  buildUnreadTotalFilter,
  buildVisibleMessagesFilter,
  getHiddenAt,
  participantId,
  otherParticipant,
  isUnavailableParticipant,
  filterAllowedRooms,
  getMyPartners,
  getChatRoomDetail,
  createOrGetChatRoom,
  deleteChatRoom,
};
