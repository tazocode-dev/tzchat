// src/controllers/account.controller.js
// ────────────────────────────────────────────────────────────
// 내 계정 컨트롤러: 인증 가드 + 요청 파싱 + 응답 조립.
// 실제 로직은 services/accountService.js가 담당한다.
// ────────────────────────────────────────────────────────────

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('@/config/secrets');
const { AccountError, getMyProfile, getMyFriendIds, changePassword } = require('@/services/accountService');

const COOKIE_NAME = process.env.JWT_COOKIE_NAME || 'tzchat.jwt';

// ===== 유틸: JWT 추출 & 인증 미들웨어 =====
function extractToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);

  const cookieHeader = req.headers.cookie || '';
  if (cookieHeader.includes(`${COOKIE_NAME}=`)) {
    try {
      const target = cookieHeader
        .split(';')
        .map(v => v.trim())
        .find(v => v.startsWith(`${COOKIE_NAME}=`));
      if (target) return decodeURIComponent(target.split('=')[1]);
    } catch (e) {
      console.log('[AUTH][DBG] 쿠키 파싱 실패:', e?.message);
    }
  }
  return null;
}
async function authFromJwtOrSession(req, res, next) {
  try {
    if (req.session?.user?._id) {
      req.auth = { userId: String(req.session.user._id), via: 'session' };
      console.log('[AUTH][OK] 세션 인증', { userId: req.auth.userId });
      return next();
    }

    const token = extractToken(req);
    if (!token) {
      console.log('[AUTH][ERR]', { step: 'extract', message: '토큰 없음' });
      return res.status(401).json({ ok: false, message: '로그인이 필요합니다.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      console.log('[AUTH][ERR]', { step: 'verify', message: e?.message });
      return res.status(401).json({ ok: false, message: '토큰이 유효하지 않습니다.' });
    }

    if (!decoded?.sub) {
      console.log('[AUTH][ERR]', { step: 'decode', message: 'sub 누락' });
      return res.status(401).json({ ok: false, message: '토큰이 유효하지 않습니다.' });
    }

    req.auth = { userId: String(decoded.sub), via: 'jwt', token };
    console.log('[AUTH][OK] JWT 인증', { userId: req.auth.userId });
    return next();
  } catch (err) {
    console.log('[AUTH][ERR]', { step: 'unknown', message: err?.message });
    return res.status(401).json({ ok: false, message: '인증 실패' });
  }
}

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

module.exports = { authFromJwtOrSession, me, myFriends, updatePassword };
