require('module-alias/register');
process.env.NODE_ENV = 'test';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isBidirectionallyBlocked,
  getBlockedUserIdSet,
  buildDiscoverableUserFilter,
} = require('../src/services/chat/blockPolicyService');
const { ChatRoomError, createOrGetChatRoom, getChatRoomDetail } = require('../src/services/chat/chatRoomService');
const { ChatMessageError, sendMessage } = require('../src/services/chat/chatMessageService');
const { FriendRequestManageError, acceptRequest } = require('../src/services/chat/friendRequestManageService');

const ME = '64b000000000000000000001';
const OTHER = '64b000000000000000000002';
const THIRD = '64b000000000000000000003';
const ROOM = '64b000000000000000000004';
const REQUEST = '64b000000000000000000005';

function chainedResult(value) {
  return {
    select() { return this; },
    populate() { return this; },
    sort() { return this; },
    async lean() { return value; },
  };
}

test('양방향 차단은 어느 한쪽 blocklist만 포함해도 성립하고 자기 자신은 허용한다', () => {
  assert.equal(isBidirectionallyBlocked({ _id: ME, blocklist: [OTHER] }, { _id: OTHER, blocklist: [] }), true);
  assert.equal(isBidirectionallyBlocked({ _id: ME, blocklist: [] }, { _id: OTHER, blocklist: [ME] }), true);
  assert.equal(isBidirectionallyBlocked({ _id: ME, blocklist: [ME] }, { _id: ME, blocklist: [ME] }), false);
});

test('차단 상대 집합은 내가 차단한 사용자와 나를 차단한 사용자를 합친다', async () => {
  const UserModel = {
    findById() { return chainedResult({ _id: ME, blocklist: [OTHER] }); },
    find() { return chainedResult([{ _id: THIRD }]); },
  };
  const ids = await getBlockedUserIdSet(ME, { UserModel });
  assert.deepEqual([...ids].sort(), [OTHER, THIRD].sort());
});

test('검색 노출 필터는 자기 자신·양방향 차단·정지·탈퇴·삭제 사용자를 제외한다', () => {
  const query = buildDiscoverableUserFilter(ME, new Set([OTHER, THIRD]));
  assert.deepEqual(query.suspended, { $ne: true });
  assert.deepEqual(query.status, { $nin: ['pendingDeletion', 'deleted'] });
  assert.deepEqual(query.isDeleted, { $ne: true });
  assert.deepEqual(query._id.$nin.map(String).sort(), [ME, OTHER, THIRD].sort());
});

test('차단 관계에서는 신규 채팅방을 DB 조회 전에 거부한다', async () => {
  let queried = false;
  const ChatRoomModel = { findOne() { queried = true; } };
  await assert.rejects(
    createOrGetChatRoom(ME, OTHER, { ChatRoomModel, areUsersBlocked: async () => true }),
    error => error instanceof ChatRoomError && error.status === 403
  );
  assert.equal(queried, false);
});

test('차단 관계에서는 기존 채팅방 상세와 메시지 전송을 403으로 거부한다', async () => {
  const roomDocument = { _id: ROOM, participants: [ME, OTHER], messages: [], async save() {} };
  const detailRoomModel = { findById() { return chainedResult(roomDocument); } };
  await assert.rejects(
    getChatRoomDetail(ROOM, ME, {}, {
      ChatRoomModel: detailRoomModel,
      MessageModel: { find() { throw new Error('메시지를 조회하면 안 됨'); } },
      areUsersBlocked: async () => true,
    }),
    error => error instanceof ChatRoomError && error.status === 403
  );

  let messageCreated = false;
  await assert.rejects(
    sendMessage(ROOM, ME, { content: '안녕하세요', type: 'text' }, {}, {
      ChatRoomModel: { async findById() { return roomDocument; } },
      MessageModel: { async create() { messageCreated = true; } },
      areUsersBlocked: async () => true,
    }),
    error => error instanceof ChatMessageError && error.status === 403
  );
  assert.equal(messageCreated, false);
});

test('친구 신청 수락은 차단을 먼저 확인하고 pending 요청을 변경하지 않는다', async () => {
  let updateCalled = false;
  const FriendRequestModel = {
    async findOne() { return { _id: REQUEST, from: OTHER, to: ME, status: 'pending' }; },
    async findOneAndUpdate() { updateCalled = true; },
  };
  await assert.rejects(
    acceptRequest(ME, REQUEST, { FriendRequestModel, areUsersBlocked: async () => true }),
    error => error instanceof FriendRequestManageError && error.status === 403
  );
  assert.equal(updateCalled, false);
});

test('채팅 이미지 업로드는 multer 파일 저장 전에 차단 preflight를 실행한다', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '../src/routes/chat/chatMessageRouter.js'),
    'utf8'
  );
  const preflightIndex = source.indexOf('controller.preflightUpload');
  const multerIndex = source.indexOf('controller.uploadSingleImage');
  assert.ok(preflightIndex >= 0);
  assert.ok(multerIndex > preflightIndex);
});
