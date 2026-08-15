// src/services/public/gradeService.js
// ────────────────────────────────────────────────────────────
// 회원 등급 수동 변경(TEST) 도메인 서비스 (지침 §1). routes/public/gradeRouter.js에서 분리.
// ────────────────────────────────────────────────────────────

const { User } = require('@/models');

class GradeError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const ALLOWED = ['일반회원', '라이트회원', '프리미엄회원', '베타회원'];

async function updateMyGrade(myId, gradeInput) {
  const grade = (gradeInput || '').trim();

  if (!myId) {
    throw new GradeError(401, '로그인이 필요합니다.');
  }
  if (!ALLOWED.includes(grade)) {
    throw new GradeError(400, '유효하지 않은 등급입니다. (일반회원/라이트회원/프리미엄회원)');
  }

  const result = await User.updateOne(
    { _id: myId },
    { $set: { user_level: grade } },
    { strict: false } // DB는 그대로, 존재하는 필드만 갱신
  );

  try {
    console.log(`[Grade] ${myId} -> ${grade}`, {
      matched: result?.matchedCount ?? result?.n,
      modified: result?.modifiedCount ?? result?.nModified,
    });
  } catch (_) {}

  return { user_level: grade };
}

module.exports = { GradeError, updateMyGrade };
