// src/controllers/account.controller.js
// ────────────────────────────────────────────────────────────
// 내 계정 컨트롤러: 요청 파싱 + 응답 조립.
// 실제 로직은 services/accountService.js가 담당한다.
// ────────────────────────────────────────────────────────────

const { AccountError, getMyProfile, getMyFriendIds, changePassword } = require('@/services/accountService');

async function me(req, res) {
  console.time('[API][TIMING] GET /api/me');
  const userId = req.auth.userId;

  try {
    const { user, durationSeconds } = await getMyProfile(userId);
    console.timeEnd('[API][TIMING] GET /api/me');
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ ok: true, user, durationSeconds });
  } catch (err) {
    console.timeEnd('[API][TIMING] GET /api/me');
    res.setHeader('Cache-Control', 'no-store');
    if (err instanceof AccountError) {
      console.log('[AUTH][ERR]', { step: 'me', message: err.message });
      return res.status(err.status).json({ ok: false, message: err.message });
    }
    console.log('[AUTH][ERR]', { step: 'me', message: err?.message });
    return res.status(500).json({ ok: false, message: '서버 오류' });
  }
}

async function myFriends(req, res) {
  try {
    const myId = req.auth.userId;
    const friendIds = await getMyFriendIds(myId);
    console.log('[API][RES] /my-friends', { userId: myId, count: friendIds?.length || 0 });
    return res.json({ ok: true, friendIds });
  } catch (err) {
    if (err instanceof AccountError) {
      return res.status(err.status).json({ ok: false, message: err.message });
    }
    console.log('[AUTH][ERR]', { step: 'myFriends', message: err?.message });
    return res.status(500).json({ ok: false, message: '서버 오류' });
  }
}

async function updatePassword(req, res) {
  const userId = req.auth.userId;
  const { current, next } = req.body || {};

  try {
    console.log('[AUTH][REQ] update-password', { userId });
    await changePassword(userId, current, next);
    console.log('[AUTH][RES] update-password OK', { userId });
    return res.json({ ok: true, message: '비밀번호가 변경되었습니다.' });
  } catch (err) {
    if (err instanceof AccountError) {
      return res.status(err.status).json({ ok: false, message: err.message });
    }
    console.log('[AUTH][ERR]', { step: 'updatePassword', message: err?.message });
    return res.status(500).json({ ok: false, message: '서버 오류로 비밀번호 변경에 실패했습니다.' });
  }
}

module.exports = { me, myFriends, updatePassword };
