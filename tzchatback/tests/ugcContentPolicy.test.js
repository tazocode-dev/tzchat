require('module-alias/register');
process.env.NODE_ENV = 'test';
process.env.PUBLIC_API_ORIGIN ||= 'https://tzchat.example.com';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TEXT_LIMITS,
  UgcContentPolicyError,
  normalizeForModeration,
  validateUserGeneratedText,
} = require('../src/services/system/ugcContentPolicyService');
const { updateNickname, updateSelfintro } = require('../src/services/userProfileService');
const { sendFriendRequest } = require('../src/services/chat/friendRequestSendService');
const {
  ChatMessageError,
  sendMessage,
  validateChatImagePathForDb,
} = require('../src/services/chat/chatMessageService');
const { validateCreateReportInput } = require('../src/services/system/reportService');

const ME = '64b000000000000000000001';
const OTHER = '64b000000000000000000002';
const ROOM = '64b000000000000000000004';

test('사전 게시 정책은 공백·기호·전각문자 우회와 운영 추가 차단어를 거부한다', () => {
  assert.equal(normalizeForModeration(' 씨. 발 '), '씨발');

  for (const [value, additionalTerms] of [
    ['씨. 발', ''],
    ['Ｆ Ｕ Ｃ Ｋ', ''],
    ['조건 만남', ''],
    ['미성년자 만남', ''],
    ['죽여 버리겠다', ''],
    ['운영정책추가어', '운영 정책 추가어'],
  ]) {
    assert.throws(
      () => validateUserGeneratedText(value, { field: 'chatMessage', additionalTerms }),
      error => error instanceof UgcContentPolicyError
        && error.status === 400
        && error.code === 'UGC_CONTENT_REJECTED'
    );
  }
});

test('필드별 상한과 빈 값을 서버에서 검증하고 정상 텍스트는 trim한다', () => {
  assert.equal(
    validateUserGeneratedText('  안녕하세요  ', { field: 'selfintro' }),
    '안녕하세요'
  );
  assert.equal(
    validateUserGeneratedText(undefined, { field: 'friendRequestMessage', required: false }),
    ''
  );
  assert.throws(
    () => validateUserGeneratedText('x'.repeat(TEXT_LIMITS.nickname + 1), { field: 'nickname' }),
    error => error.code === 'UGC_CONTENT_REJECTED' && error.status === 400
  );
  assert.throws(
    () => validateUserGeneratedText({}, { field: 'chatMessage' }),
    error => error.code === 'UGC_CONTENT_REJECTED' && error.status === 400
  );
});

test('닉네임·소개·친구신청은 DB 저장 전에 정책 위반을 같은 code로 거부한다', async () => {
  for (const operation of [
    () => updateNickname(ME, '씨 발'),
    () => updateSelfintro(ME, '조건 만남'),
    () => sendFriendRequest(ME, OTHER, '아동 성착취'),
  ]) {
    await assert.rejects(
      operation,
      error => error.status === 400 && error.code === 'UGC_CONTENT_REJECTED'
    );
  }
});

test('채팅은 text/image 이외 type과 외부·다른 방 이미지 경로를 DB 조회 전에 거부한다', async () => {
  for (const payload of [
    { content: '안녕', type: 'video' },
    { content: `https://example.com/uploads/chat/${ROOM}/a.jpg`, type: 'image' },
    { content: `/uploads/chat/2026/08/20/${OTHER}/${'a'.repeat(32)}.jpg`, type: 'image' },
    { content: `/uploads/chat/2026/08/20/${ROOM}/../${'a'.repeat(32)}.jpg`, type: 'image' },
  ]) {
    await assert.rejects(
      sendMessage(ROOM, ME, payload, {}, {
        ChatRoomModel: { findById() { throw new Error('DB를 조회하면 안 됨'); } },
      }),
      error => error instanceof ChatMessageError && error.status === 400 && !!error.code
    );
  }
});

test('업로드 API의 현재 방별 상대경로는 허용하고 텍스트 채팅은 trim해 저장한다', async () => {
  const imagePath = `/uploads/chat/2026/08/20/${ROOM}/${'a'.repeat(32)}.webp`;
  assert.equal(validateChatImagePathForDb(imagePath, ROOM), imagePath);

  let createdInput;
  const room = {
    _id: ROOM,
    participants: [ME, OTHER],
    messages: [],
    async save() {},
  };
  const MessageModel = {
    async create(input) {
      createdInput = input;
      return { _id: '64b000000000000000000099', ...input, createdAt: new Date() };
    },
    findById() {
      return {
        populate() { return this; },
        async lean() { return { ...createdInput, _id: '64b000000000000000000099' }; },
      };
    },
  };

  await sendMessage(ROOM, ME, { content: '  안녕하세요  ', type: 'text' }, {}, {
    ChatRoomModel: { async findById() { return room; } },
    MessageModel,
    areUsersBlocked: async () => false,
  });
  assert.equal(createdInput.content, '안녕하세요');
  assert.equal(createdInput.type, 'text');
});

test('신고 상세는 위반 표현 증거 접수를 위해 UGC 필터 대상에서 제외한다', () => {
  const result = validateCreateReportInput(ME, {
    reportedUserId: OTHER,
    reason: 'harassment',
    details: '상대가 “씨발”이라고 보냈습니다.',
    contextType: 'profile',
  });
  assert.equal(result.details, '상대가 “씨발”이라고 보냈습니다.');
});
