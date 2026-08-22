require('module-alias/register');
process.env.NODE_ENV = 'test';

const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isSafeChildPath,
  uploadUrlToSafePath,
  deleteUserUploadFiles,
  reconcileChatRooms,
  purgeExpiredUser,
} = require('../src/services/system/accountPurgeService');

const USER_ID = '64b000000000000000000001';
const OTHER_ID = '64b000000000000000000002';
const MESSAGE_ID = '64b000000000000000000003';
const ROOM_ID = '64b000000000000000000004';

function leanResult(value) {
  return {
    select() { return this; },
    sort() { return this; },
    async lean() { return value; },
  };
}

test('업로드 경로 밖 파일은 절대 삭제 대상으로 변환하지 않는다', () => {
  const root = path.resolve('/safe/uploads');
  assert.equal(isSafeChildPath(root, path.join(root, 'profile', USER_ID)), true);
  assert.equal(isSafeChildPath(root, path.resolve(root, '../outside.txt')), false);
  assert.equal(uploadUrlToSafePath('/uploads/chat/2026/image.jpg', root, 'chat'), path.join(root, 'chat/2026/image.jpg'));
  assert.equal(uploadUrlToSafePath('/uploads/../outside.txt', root, 'chat'), null);
  assert.equal(uploadUrlToSafePath('https://example.com/uploads/profile/other.jpg', root, 'chat'), null);
});

test('프로필 디렉터리와 본인이 보낸 안전한 채팅 이미지만 삭제하고 없는 파일은 허용한다', async () => {
  const removedDirectories = [];
  const removedFiles = [];
  const root = path.resolve('/safe/uploads');
  const fsApi = {
    async rm(target, options) { removedDirectories.push({ target, options }); },
    async unlink(target) {
      removedFiles.push(target);
      if (target.endsWith('missing.jpg')) {
        const error = new Error('missing'); error.code = 'ENOENT'; throw error;
      }
    },
  };
  const result = await deleteUserUploadFiles({
    userId: USER_ID,
    uploadRoot: root,
    fsApi,
    sentMessages: [
      { type: 'image', imageUrl: '/uploads/chat/2026/08/safe.jpg' },
      { type: 'image', imageUrl: '/uploads/chat/2026/08/missing.jpg' },
      { type: 'image', imageUrl: '/uploads/../../outside.jpg' },
    ],
  });
  assert.equal(removedDirectories[0].target, path.join(root, 'profile', USER_ID));
  assert.deepEqual(removedDirectories[0].options, { recursive: true, force: true });
  assert.deepEqual(removedFiles.sort(), [
    path.join(root, 'chat/2026/08/missing.jpg'),
    path.join(root, 'chat/2026/08/safe.jpg'),
  ].sort());
  assert.equal(result.chatImageCount, 2);
});

test('빈 채팅방은 잔여 이미지 파일을 먼저 안전 삭제한 뒤 메시지와 방을 정리한다', async () => {
  const operations = [];
  let roomFindCount = 0;
  const root = path.resolve('/safe/uploads');
  const Models = {
    ChatRoom: {
      find() {
        roomFindCount += 1;
        return leanResult(roomFindCount === 1 ? [{ _id: ROOM_ID }] : []);
      },
      findById() { return leanResult({ _id: ROOM_ID, participants: [] }); },
      async updateMany() { operations.push(['ChatRoom.updateMany']); },
      async deleteOne() { operations.push(['ChatRoom.deleteOne']); },
      async deleteMany() { operations.push(['ChatRoom.deleteMany']); },
    },
    Message: {
      find() {
        return leanResult([
          { type: 'image', imageUrl: '/uploads/chat/orphan.jpg' },
          { type: 'image', imageUrl: '/uploads/../../outside.jpg' },
        ]);
      },
      async updateMany() { operations.push(['Message.updateMany']); },
      async deleteMany(query) { operations.push(['Message.deleteMany', query]); },
    },
    Report: { async updateMany() { operations.push(['Report.updateMany']); } },
    PointLog: { async updateMany() { operations.push(['PointLog.updateMany']); } },
  };
  await reconcileChatRooms({
    userId: USER_ID,
    sentMessages: [],
    Models,
    uploadRoot: root,
    fsApi: { async unlink(target) { operations.push(['fs.unlink', target]); } },
  });

  assert.deepEqual(
    operations.filter(([name]) => name === 'fs.unlink'),
    [['fs.unlink', path.join(root, 'chat/orphan.jpg')]]
  );
  assert.ok(
    operations.findIndex(([name]) => name === 'fs.unlink')
      < operations.findIndex(([name, query]) => name === 'Message.deleteMany' && query.chatRoom === ROOM_ID)
  );
});

function makeDependencies(operations, overrides = {}) {
  const deletionDueAt = new Date('2026-08-16T00:00:00.000Z');
  const generic = (name) => ({
    async deleteMany(query) { operations.push([`${name}.deleteMany`, query]); return { deletedCount: 1 }; },
    async updateMany(query, update) { operations.push([`${name}.updateMany`, query, update]); return { modifiedCount: 1 }; },
  });
  let roomFindCount = 0;
  return {
    fsApi: {
      async rm(target) { operations.push(['fs.rm', target]); },
      async unlink(target) { operations.push(['fs.unlink', target]); },
    },
    UserModel: {
      findOne() {
        return leanResult({
          _id: USER_ID,
          email: 'user@example.com',
          phone: '+821011112222',
          loginPhone: '+821011112222',
          deletionDueAt,
        });
      },
      async updateMany(query, update) { operations.push(['User.updateMany', query, update]); },
      async deleteOne(query) { operations.push(['User.deleteOne', query]); return { deletedCount: 1 }; },
    },
    MessageModel: {
      find() {
        return leanResult([{ _id: MESSAGE_ID, chatRoom: ROOM_ID, type: 'image', imageUrl: '/uploads/chat/a.jpg' }]);
      },
      findOne() {
        return leanResult({ content: '남은 메시지', imageUrl: '', sender: OTHER_ID, createdAt: new Date() });
      },
      async updateMany(query, update) { operations.push(['Message.updateMany', query, update]); },
      async deleteMany(query) { operations.push(['Message.deleteMany', query]); },
    },
    ChatRoomModel: {
      find(query) {
        roomFindCount += 1;
        return leanResult(roomFindCount === 1 ? [{ _id: ROOM_ID }] : []);
      },
      findById() { return leanResult({ _id: ROOM_ID, participants: [OTHER_ID] }); },
      async updateMany(query, update) { operations.push(['ChatRoom.updateMany', query, update]); },
      async updateOne(query, update) { operations.push(['ChatRoom.updateOne', query, update]); },
      async deleteOne(query) { operations.push(['ChatRoom.deleteOne', query]); },
      async deleteMany(query) { operations.push(['ChatRoom.deleteMany', query]); },
    },
    DeviceTokenModel: generic('DeviceToken'),
    UserAgreementModel: generic('UserAgreement'),
    FriendRequestModel: generic('FriendRequest'),
    AccountVerificationModel: generic('AccountVerification'),
    PhoneVerificationModel: generic('PhoneVerification'),
    EmailVerificationModel: generic('EmailVerification'),
    PointLogModel: generic('PointLog'),
    UserDailyAggModel: generic('UserDailyAgg'),
    UserDailyScoreModel: generic('UserDailyScore'),
    MembershipOrderModel: generic('MembershipOrder'),
    PaymentModel: generic('Payment'),
    ReportModel: generic('Report'),
    NoticeModel: generic('Notice'),
    ...overrides,
  };
}

test('종속 데이터와 참조를 정리하고 보존 데이터는 삭제하지 않은 채 User를 마지막에 삭제한다', async () => {
  const operations = [];
  const dependencies = makeDependencies(operations);
  const result = await purgeExpiredUser(
    USER_ID,
    { now: new Date('2026-08-17T00:00:00.000Z'), uploadRoot: path.resolve('/safe/uploads') },
    dependencies
  );

  assert.equal(result.purged, true);
  assert.equal(operations.at(-1)[0], 'User.deleteOne');
  assert.ok(operations.some(([name, query]) => name === 'Message.deleteMany' && query.sender === USER_ID));
  assert.ok(operations.some(([name, , update]) => name === 'Message.updateMany' && update?.$pull?.readBy === USER_ID));
  assert.ok(operations.some(([name, , update]) => name === 'ChatRoom.updateMany' && update?.$pull?.participants === USER_ID));
  assert.ok(operations.some(([name, , update]) => name === 'ChatRoom.updateOne' && update?.$set?.lastMessage?.content === '남은 메시지'));
  assert.ok(operations.some(([name, query]) =>
    name === 'MembershipOrder.deleteMany' && query.status.$in.includes('mock_paid') && !query.status.$in.includes('paid')
  ));
  assert.ok(!operations.some(([name]) => name === 'Payment.deleteMany'));
  assert.ok(!operations.some(([name]) => name === 'Report.deleteMany'));
  assert.deepEqual(result.preserved, [
    'paid_membership_orders',
    'payments',
    'reports',
    'admin_logs',
  ]);
  assert.ok(operations.some(([name, query, update]) =>
    name === 'Payment.updateMany' && query.userId === USER_ID && update.$set.userId === null
  ));
  assert.ok(operations.some(([name, query, update]) =>
    name === 'User.updateMany' && query.suspendedBy === USER_ID && update.$set.suspendedBy === null
  ));
});

test('중간 정리가 실패하면 User를 삭제하지 않아 다음 worker 실행에서 재시도할 수 있다', async () => {
  const operations = [];
  const dependencies = makeDependencies(operations, {
    DeviceTokenModel: {
      async deleteMany() { operations.push(['DeviceToken.deleteMany']); throw new Error('temporary failure'); },
    },
  });
  await assert.rejects(
    purgeExpiredUser(
      USER_ID,
      { now: new Date('2026-08-17T00:00:00.000Z'), uploadRoot: path.resolve('/safe/uploads') },
      dependencies
    ),
    /temporary failure/
  );
  assert.ok(!operations.some(([name]) => name === 'User.deleteOne'));
});
