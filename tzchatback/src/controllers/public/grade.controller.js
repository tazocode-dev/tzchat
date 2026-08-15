// src/controllers/public/grade.controller.js
// ────────────────────────────────────────────────────────────
// 회원 등급 수동 변경(TEST) 컨트롤러: 요청 파싱 + 응답 조립.
// 실제 로직은 services/public/gradeService.js가 담당한다.
// ────────────────────────────────────────────────────────────

const { GradeError, updateMyGrade } = require('@/services/public/gradeService');

// 공통: 내 사용자 ID 추출 (JWT 우선, 세션 백업)
function getMyId(req) {
  const jwtId = req?.user?._id || req?.user?.sub;
  const sessId = req?.session?.user?._id;
  return (jwtId && String(jwtId)) || (sessId && String(sessId)) || '';
}

async function updateGrade(req, res) {
  try {
    const myId = getMyId(req);
    const data = await updateMyGrade(myId, req.body?.grade);
    return res.json({ success: true, message: '회원 등급이 변경되었습니다.', data });
  } catch (err) {
    if (err instanceof GradeError) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    console.error('[Grade] 변경 오류:', err);
    return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
  }
}

module.exports = { updateGrade };
