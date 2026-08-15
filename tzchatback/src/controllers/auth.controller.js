// src/controllers/auth.controller.js
// ────────────────────────────────────────────────────────────
// 회원가입 + 공개 유저 목록 컨트롤러: 요청 파싱 + 응답 조립.
// 실제 로직은 services/authService.js가 담당한다.
// ────────────────────────────────────────────────────────────

const { signupUser, SignupError, listPublicUsers } = require('@/services/authService');

// 민감정보 마스킹
function maskPassword(obj) {
  const copy = { ...(obj || {}) };
  if (copy.password) copy.password = '(hidden)';
  if (copy.current) copy.current = '(hidden)';
  if (copy.next) copy.next = '(hidden)';
  return copy;
}

async function signup(req, res) {
  console.log('[API][REQ] /signup', { body: maskPassword(req.body || {}) });
  try {
    const result = await signupUser(req.body || {});
    console.log('[API][RES] /signup 201', {
      userId: String(result.userId),
      username: result.username,
      phoneStored: result.phoneStored,
    });
    return res.status(201).json({ ok: true, message: '회원가입 성공', phoneStored: result.phoneStored });
  } catch (err) {
    if (err instanceof SignupError) {
      console.log('[AUTH][ERR]', { step: 'signup', code: err.code, message: err.message });
      return res.status(err.status).json({ ok: false, code: err.code, message: err.message });
    }
    console.log('[AUTH][ERR]', { step: 'signup', message: err?.message, name: err?.name });
    return res.status(500).json({ ok: false, message: '서버 오류' });
  }
}

async function listUsers(req, res) {
  try {
    const data = await listPublicUsers({ page: req.query.page, limit: req.query.limit });
    return res.json({ ok: true, ...data });
  } catch (err) {
    console.log('[AUTH][ERR]', { step: 'listUsers', message: err?.message });
    return res.status(500).json({ ok: false, message: '유저 조회 실패' });
  }
}

module.exports = { signup, listUsers };
