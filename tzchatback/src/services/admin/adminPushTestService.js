const { ChatRoom } = require('@/models');
const { sendPushToUser } = require('@/services/push/sender');

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const ALLOWED_TYPES = new Set([
  'chat',
  'friend_request',
  'speed_match_request',
  'friend_request_accepted',
  'friend_request_result',
]);
const ALLOWED_FIELDS = new Set(['targetUserId', 'type', 'roomId']);

class AdminPushTestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function isObjectId(value) {
  return OBJECT_ID_PATTERN.test(String(value || ''));
}

function validateTestPushInput(body = {}, masterUserId) {
  const unknownFields = Object.keys(body).filter(key => !ALLOWED_FIELDS.has(key));
  if (unknownFields.length) throw new AdminPushTestError(400, '허용되지 않은 요청 필드가 있습니다.');

  const targetUserId = String(body.targetUserId || masterUserId || '');
  const type = String(body.type || '');
  const roomId = String(body.roomId || '');
  if (!isObjectId(targetUserId)) throw new AdminPushTestError(400, '유효한 대상 사용자 ID가 필요합니다.');
  if (!ALLOWED_TYPES.has(type)) throw new AdminPushTestError(400, '허용되지 않은 알림 종류입니다.');
  if (type === 'chat' && !isObjectId(roomId)) throw new AdminPushTestError(400, '채팅 알림에는 유효한 채팅방 ID가 필요합니다.');
  if (type !== 'chat' && roomId) throw new AdminPushTestError(400, '이 알림 종류에는 채팅방 ID를 사용할 수 없습니다.');
  return { targetUserId, type, roomId };
}

async function sendAdminTestPush(body, masterUserId, dependencies = {}) {
  const input = validateTestPushInput(body, masterUserId);
  const ChatRoomModel = dependencies.ChatRoomModel || ChatRoom;
  const sender = dependencies.sender || sendPushToUser;
  if (input.type === 'chat') {
    const room = await ChatRoomModel.findOne({
      _id: input.roomId,
      participants: input.targetUserId,
    }).select('_id').lean();
    if (!room) throw new AdminPushTestError(400, '대상 사용자가 참여한 채팅방이 아닙니다.');
  }
  return sender(input.targetUserId, {
    type: input.type,
    roomId: input.roomId,
  });
}

module.exports = {
  ALLOWED_TYPES,
  AdminPushTestError,
  validateTestPushInput,
  sendAdminTestPush,
};
