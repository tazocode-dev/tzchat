// src/controllers/chat/friendRequestManage.controller.js
// ────────────────────────────────────────────────────────────
// 친구 신청 처리/목록 컨트롤러: 요청 파싱 + 로깅 + 응답 조립.
// 실제 로직은 services/chat/friendRequestManageService.js가 담당한다.
// ────────────────────────────────────────────────────────────

const {
  FriendRequestManageError,
  populateRequest,
  acceptRequest,
  rejectRequest,
  blockFromRequest,
  getReceivedRequests,
  getSentRequests,
  getSpeedResults,
} = require('@/services/chat/friendRequestManageService');
const { sendPushToUser } = require('@/services/push/sender');

function log(...args) { try { console.log('[friendRequestManageRouter]', ...args); } catch (_) {} }
function logErr(...args) { try { console.error('[friendRequestManageRouter][ERR]', ...args); } catch (_) {} }

function getMyId(req) {
  const jwtId = req?.user?._id;
  const sessId = req?.session?.user?._id;
  return (jwtId && String(jwtId)) || (sessId && String(sessId)) || '';
}

// 공통 요청/응답 로깅
function requestLogger(req, res, next) {
  const started = Date.now();
  console.log('[API][REQ]', {
    path: req.baseUrl + req.path,
    method: req.method,
    params: req.params,
    query: req.query,
    userId: getMyId(req),
  });
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    const ms = Date.now() - started;
    const status = res.statusCode;
    const size = typeof body === 'string' ? body.length : Buffer.byteLength(JSON.stringify(body || {}));
    console.log('[API][RES]', { path: req.baseUrl + req.path, status, ms, size });
    return originalJson(body);
  };
  next();
}

function handleError(req, res, err) {
  if (err instanceof FriendRequestManageError) {
    return res.status(err.status).json({ message: err.message });
  }
  logErr('[API][ERR]', { path: req.baseUrl + req.path, name: err?.name, message: err?.message });
  return res.status(500).json({ message: '서버 오류' });
}

function getMatchType(req) {
  const value = String(req.query?.matchType || 'general').trim().toLowerCase();
  return ['general', 'speed', 'all'].includes(value) ? value : 'general';
}

async function accept(req, res) {
  try {
    const myId = getMyId(req);
    if (!myId) return res.status(401).json({ message: '로그인이 필요합니다.' });
    const { id } = req.params;

    const { request, fromId, toId, roomId } = await acceptRequest(myId, id);

    const emit = req.app.get('emit');
    if (emit && emit.friendRequestAccepted) {
      try { emit.friendRequestAccepted(await populateRequest(request)); } catch (e) { logErr('emit.friendRequestAccepted failed', e); }
    }
    void sendPushToUser(fromId, {
      type: 'friend_request_accepted',
      title: '매칭 신청 수락',
      body: '보낸 매칭 신청이 수락되었습니다.',
    }).catch((error) => logErr('accept push failed', error));

    log('🤝 친구 수락 & 채팅 시작', { path: req.baseUrl + req.path, fromId, toId, roomId });
    res.json({ ok: true, roomId });
  } catch (err) {
    handleError(req, res, err);
  }
}

async function reject(req, res) {
  try {
    const myId = getMyId(req);
    if (!myId) return res.status(401).json({ message: '로그인이 필요합니다.' });
    const { id } = req.params;

    const request = await rejectRequest(myId, id);

    const populated = await populateRequest(request);
    const emit = req.app.get('emit');
    if (emit && emit.friendRequestRejected) emit.friendRequestRejected(populated);
    void sendPushToUser(String(request.from), {
      type: 'friend_request_result',
      title: '매칭 신청 결과',
      body: '보낸 매칭 신청 상태가 변경되었습니다.',
      deeplink: 'tzchat://friends/sent',
      webLink: '/home/3page?tab=sent',
    }).catch((error) => logErr('reject push failed', error));

    log('❌ 친구 거절', { path: req.baseUrl + req.path, from: String(request.from), to: myId, id });
    res.json({ ok: true });
  } catch (err) {
    handleError(req, res, err);
  }
}

async function blockFrom(req, res) {
  try {
    const myId = getMyId(req);
    if (!myId) return res.status(401).json({ message: '로그인이 필요합니다.' });
    const { id } = req.params;

    const { request, fromId } = await blockFromRequest(myId, id);

    const populated = await populateRequest(request);
    const emit = req.app.get('emit');
    if (emit) {
      if (emit.friendRequestRejected) emit.friendRequestRejected(populated);
      if (emit.blockCreated) emit.blockCreated({ blockerId: myId, blockedId: fromId });
    }

    log('🚫 친구 차단(신청에서)', { path: req.baseUrl + req.path, fromId, toId: myId, id });
    res.json({ ok: true });
  } catch (err) {
    handleError(req, res, err);
  }
}

async function received(req, res) {
  try {
    const myId = getMyId(req);
    if (!myId) return res.status(401).json({ message: '로그인이 필요합니다.' });
    const requests = await getReceivedRequests(myId, getMatchType(req));
    res.json(requests);
  } catch (err) {
    handleError(req, res, err);
  }
}

async function sent(req, res) {
  try {
    const myId = getMyId(req);
    if (!myId) return res.status(401).json({ message: '로그인이 필요합니다.' });
    const requests = await getSentRequests(myId, getMatchType(req));
    res.json(requests);
  } catch (err) {
    handleError(req, res, err);
  }
}

async function speedResults(req, res) {
  try {
    const myId = getMyId(req);
    if (!myId) return res.status(401).json({ message: '로그인이 필요합니다.' });
    const requests = await getSpeedResults(myId);
    return res.json(requests);
  } catch (err) {
    return handleError(req, res, err);
  }
}

module.exports = { requestLogger, accept, reject, blockFrom, received, sent, speedResults };
