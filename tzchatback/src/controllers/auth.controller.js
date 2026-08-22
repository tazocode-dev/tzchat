// src/controllers/auth.controller.js
// ────────────────────────────────────────────────────────────
// 인증된 사용자의 유저 목록 컨트롤러: 요청 파싱 + 응답 조립.
// 실제 로직은 services/authService.js가 담당한다.
// ────────────────────────────────────────────────────────────

const { listPublicUsers } = require('@/services/authService');

async function listUsers(req, res) {
  try {
    const data = await listPublicUsers({
      page: req.query.page,
      limit: req.query.limit,
      requesterId: req?.user?._id || req?.session?.user?._id,
    });
    return res.json({ ok: true, ...data });
  } catch (err) {
    console.log('[AUTH][ERR]', { step: 'listUsers', message: err?.message });
    return res.status(500).json({ ok: false, message: '유저 조회 실패' });
  }
}

module.exports = { listUsers };
