require('module-alias/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const { ChatRoom } = require('../src/models');
const { buildMarkAsReadFilter } = require('../src/services/chat/chatMessageService');
const {
  buildUnreadTotalFilter,
  buildVisibleMessagesFilter,
  getHiddenAt,
} = require('../src/services/chat/chatRoomService');
const { buildNotificationCategories } = require('../src/services/chat/friendRelationService');

test('읽음 처리는 요청한 사용자 자신의 상대 메시지만 대상으로 한다', () => {
  const readerId = new mongoose.Types.ObjectId();
  const roomId = new mongoose.Types.ObjectId();
  const filter = buildMarkAsReadFilter(roomId, readerId);

  assert.equal(filter.chatRoom, roomId);
  assert.equal(filter.sender.$ne, readerId);
  assert.equal(filter.readBy.$ne, readerId);
});

test('총 미읽음 필터는 사용자별 sender와 readBy 조건을 같은 ID로 계산한다', () => {
  const receiverId = new mongoose.Types.ObjectId();
  const roomIds = [new mongoose.Types.ObjectId()];
  const filter = buildUnreadTotalFilter(roomIds, receiverId);

  assert.deepEqual(filter.chatRoom.$in, roomIds);
  assert.equal(filter.sender.$ne, receiverId);
  assert.equal(filter.readBy.$ne, receiverId);
});

test('채팅 삭제 기준은 요청한 사용자의 숨김 시각만 적용한다', () => {
  const me = new mongoose.Types.ObjectId();
  const other = new mongoose.Types.ObjectId();
  const roomId = new mongoose.Types.ObjectId();
  const hiddenAt = new Date('2026-08-12T01:00:00.000Z');
  const room = {
    _id: roomId,
    hiddenFor: [{ user: me, hiddenAt }],
  };

  assert.equal(getHiddenAt(room, me).toISOString(), hiddenAt.toISOString());
  assert.equal(getHiddenAt(room, other), null);
  assert.deepEqual(buildVisibleMessagesFilter([room], me), {
    chatRoom: roomId,
    createdAt: { $gt: hiddenAt },
  });
  assert.deepEqual(buildVisibleMessagesFilter([room], other), { chatRoom: roomId });
});

test('숨김 이후 미읽음 계산은 새 메시지만 대상으로 한다', () => {
  const me = new mongoose.Types.ObjectId();
  const roomId = new mongoose.Types.ObjectId();
  const hiddenAt = new Date('2026-08-12T01:00:00.000Z');
  const visibleFilter = { chatRoom: roomId, createdAt: { $gt: hiddenAt } };
  const filter = buildUnreadTotalFilter([roomId], me, visibleFilter);

  assert.equal(filter.chatRoom, roomId);
  assert.deepEqual(filter.createdAt, { $gt: hiddenAt });
  assert.equal(filter.sender.$ne, me);
  assert.equal(filter.readBy.$ne, me);
});

test('상대방은 채팅방 API 응답에서 사용자별 숨김 상태를 알 수 없다', () => {
  const me = new mongoose.Types.ObjectId();
  const other = new mongoose.Types.ObjectId();
  const room = new ChatRoom({
    participants: [me, other],
    hiddenFor: [{ user: me, hiddenAt: new Date('2026-08-12T01:00:00.000Z') }],
  });

  assert.equal(Object.hasOwn(room.toJSON(), 'hiddenFor'), false);
});

test('친구 알림은 종류별 변경 시각과 해당 사용자의 확인 시각을 독립 비교한다', () => {
  const categories = buildNotificationCategories(
    {
      friendRequestsAt: new Date('2026-08-10T01:00:00.000Z'),
      speedResultsAt: new Date('2026-08-10T02:00:00.000Z'),
      friendsAt: new Date('2026-08-10T03:00:00.000Z'),
      blocksAt: null,
    },
    {
      friendRequestsAt: new Date('2026-08-10T01:01:00.000Z'),
      speedResultsAt: new Date('2026-08-10T01:59:00.000Z'),
      friendsAt: null,
      blocksAt: null,
    }
  );

  assert.deepEqual(categories, {
    friendRequests: false,
    speedResults: true,
    friends: true,
    blocks: false,
  });
});
