// src/controllers/chat/chatRoom.controller.js
// ────────────────────────────────────────────────────────────
// 채팅방 컨트롤러: 요청 파싱 + 응답 조립.
// 실제 로직은 services/chat/chatRoomService.js가 담당한다.
// ────────────────────────────────────────────────────────────

const {
  ChatRoomError,
  listMyChatRooms,
  getUnreadTotal,
  getMyPartners,
  getChatRoomDetail,
  createOrGetChatRoom,
  deleteChatRoom,
} = require('@/services/chat/chatRoomService');

const log = (...args) => console.log('[chatRoomsRouter]', ...args);
const getIO = (req) => { try { return req.app.get('io'); } catch { return null; } };
function getMyId(req) { return req?.user?._id || req?.session?.user?._id || null; }

async function listRooms(req, res) {
  console.time('[GET]/chatrooms');
  try {
    const myId = getMyId(req);
    if (!myId) { console.timeEnd('[GET]/chatrooms'); return res.status(401).json([]); }

    const result = await listMyChatRooms(myId, req);
    console.timeEnd('[GET]/chatrooms');
    return res.json(result);
  } catch (err) {
    console.error('[chatRoomsRouter][ERR]/chatrooms', err?.message);
    console.timeEnd('[GET]/chatrooms');
    return res.status(500).json({ message: '채팅방 불러오기 실패' });
  }
}

async function unreadTotal(req, res) {
  try {
    const myId = getMyId(req);
    if (!myId) return res.status(200).json({ total: 0 });
    const total = await getUnreadTotal(myId);
    return res.json({ total });
  } catch (err) {
    console.error('[chatRoomsRouter][ERR]/unread-total', err?.message);
    return res.status(500).json({ total: 0 });
  }
}

async function partners(req, res) {
  try {
    const myId = getMyId(req);
    if (!myId) return res.status(401).json({ message: '로그인이 필요합니다.' });
    const ids = await getMyPartners(myId);
    return res.json({ ids });
  } catch (err) {
    console.error('[chatRoomsRouter][ERR]/partners', err?.message);
    return res.status(500).json({ message: '채팅 상대 조회 실패' });
  }
}

async function roomDetail(req, res) {
  try {
    const myId = getMyId(req);
    if (!myId) return res.status(401).json({ message: '로그인이 필요합니다.' });
    const { id } = req.params;

    const result = await getChatRoomDetail(id, myId, req);
    return res.json(result);
  } catch (err) {
    if (err instanceof ChatRoomError) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error('[chatRoomsRouter][ERR]/:id', err?.message);
    return res.status(500).json({ message: '서버 오류' });
  }
}

async function createRoom(req, res) {
  try {
    const myId = getMyId(req);
    if (!myId) return res.status(401).json({ message: '로그인이 필요합니다.' });
    const { userId } = req.body;

    const { chatRoom, created } = await createOrGetChatRoom(myId, userId);
    log(created ? `✅ created room=${chatRoom._id}` : `found room=${chatRoom._id}`);
    return res.json(chatRoom);
  } catch (err) {
    console.error('[chatRoomsRouter][ERR]/create', err?.message);
    return res.status(500).json({ message: '서버 오류' });
  }
}

async function removeRoom(req, res) {
  try {
    const myId = getMyId(req);
    if (!myId) return res.status(401).json({ message: '로그인이 필요합니다.' });
    const { id: roomId } = req.params;

    await deleteChatRoom(roomId, myId, getIO(req));
    return res.json({ message: '내 채팅 목록에서 삭제 완료', roomId });
  } catch (err) {
    if (err instanceof ChatRoomError) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error('[chatRoomsRouter][ERR]/delete', err?.message);
    return res.status(500).json({ message: '채팅방 삭제 실패' });
  }
}

module.exports = { listRooms, unreadTotal, partners, roomDetail, createRoom, removeRoom };
