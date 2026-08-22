require('module-alias/register');
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  INVALID_NOTICE_INPUT,
  NOTICE_LIMITS,
  NoticeError,
  getManagedNotice,
  getPublishedNotice,
  validateNoticeBody,
} = require('../src/services/system/noticeService');
const { Notice } = require('../src/models');

test('공지 생성 입력은 문자열을 정리하고 불리언·유효한 날짜를 보존한다', () => {
  const result = validateNoticeBody({
    title: '  서비스 안내  ',
    content: '  <p>본문</p>  ',
    category: '  점검  ',
    isPublished: false,
    publishedAt: '2026-08-20T12:30:00.000Z',
  });

  assert.equal(result.title, '서비스 안내');
  assert.equal(result.content, '<p>본문</p>');
  assert.equal(result.category, '점검');
  assert.equal(result.isPublished, false);
  assert.equal(result.publishedAt.toISOString(), '2026-08-20T12:30:00.000Z');
});

test('공지 제목·본문·분류 길이와 게시 일시·공개 상태 형식을 400 code로 거부한다', () => {
  const invalidInputs = [
    { title: '', content: '본문' },
    { title: '제목', content: '' },
    { title: 'x'.repeat(NOTICE_LIMITS.title + 1), content: '본문' },
    { title: '제목', content: 'x'.repeat(NOTICE_LIMITS.content + 1) },
    { title: '제목', content: '본문', category: 'x'.repeat(NOTICE_LIMITS.category + 1) },
    { title: '제목', content: '본문', isPublished: 'false' },
    { title: '제목', content: '본문', publishedAt: 'not-a-date' },
  ];

  for (const input of invalidInputs) {
    assert.throws(
      () => validateNoticeBody(input),
      error => error instanceof NoticeError
        && error.status === 400
        && error.code === INVALID_NOTICE_INPUT
    );
  }
});

test('공지 수정은 전달된 필드만 검증하고 빈 patch를 거부한다', () => {
  assert.deepEqual(validateNoticeBody({ isPublished: false }, { partial: true }), { isPublished: false });
  assert.throws(
    () => validateNoticeBody({}, { partial: true }),
    error => error.code === INVALID_NOTICE_INPUT
  );
  assert.throws(
    () => validateNoticeBody({ title: '   ' }, { partial: true }),
    error => error.code === INVALID_NOTICE_INPUT
  );
});

test('공개 공지 상세는 요청 역할과 무관하게 게시 상태를 조회 조건에 고정한다', async () => {
  const originalFindOne = Notice.findOne;
  const observed = [];
  Notice.findOne = filter => ({
    lean: async () => {
      observed.push(filter);
      return { _id: 'notice-1', isPublished: true };
    },
  });

  try {
    const notice = await getPublishedNotice('notice-1');
    assert.equal(notice.isPublished, true);
    assert.deepEqual(observed, [{ _id: 'notice-1', isPublished: true }]);
  } finally {
    Notice.findOne = originalFindOne;
  }
});

test('관리자 공지 상세만 비공개 문서를 아이디로 조회한다', async () => {
  const originalFindById = Notice.findById;
  Notice.findById = id => ({
    lean: async () => ({ _id: id, isPublished: false }),
  });

  try {
    const notice = await getManagedNotice('draft-1');
    assert.equal(notice.isPublished, false);
  } finally {
    Notice.findById = originalFindById;
  }
});
