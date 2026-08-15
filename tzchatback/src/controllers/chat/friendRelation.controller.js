// src/controllers/chat/friendRelation.controller.js
// ────────────────────────────────────────────────────────────
// 친구/차단 관계 컨트롤러: 요청 파싱 + 로깅 + 응답 조립.
// 실제 로직은 services/chat/friendRelationService.js가 담당한다.
// ────────────────────────────────────────────────────────────

const {
  FriendRelationError,
  getFriendList,
  removeFriend,
  getBlockList,
  createBlock,
  removeBlock,
  getUserProfileWithRelation,
  getNotificationStatus,
  markNotificationRead,
} = require('@/services/chat/friendRelationService');

function log(...args) { try { console.log('[friendRelationRouter]', ...args); } catch (_) {} }
function logErr(...args) { try { console.error('[friendRelationRouter][ERR]', ...args); } catch (_) {} }

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
  if (err instanceof FriendRelationError) {
    return res.status(err.status).json({ message: err.message });
  }
  logErr('[API][ERR]', { path: req.baseUrl + req.path, name: err?.name, message: err?.message });
  return res.status(500).json({ message: '서버 오류' });
}

async function listFriends(req, res) {
  try {
    const me = getMyId(req);
    if (!me) return res.status(401).json({ message: '로그인이 필요합니다.' });
    const friends = await getFriendList(me);
    res.json(friends);
  } catch (err) {
    handleError(req, res, err);
  }
}

async function deleteFriend(req, res) {
  try {
    const myId = getMyId(req);
    if (!myId) return res.status(401).json({ message: '로그인이 필요합니다.' });
    const targetId = String(req.params.id);

    const result = await removeFriend(myId, targetId);
    const emit = req.app.get('emit');
    if (emit?.notificationsChanged) emit.notificationsChanged([myId, targetId], ['friends']);
    log('🗑️ 친구 삭제', { path: req.baseUrl + req.path, myId, targetId, ...result });
    return res.json({ ok: true, ...result });
  } catch (err) {
    handleError(req, res, err);
  }
}

async function listBlocks(req, res) {
  try {
    const me = getMyId(req);
    if (!me) return res.status(401).json({ message: '로그인이 필요합니다.' });
    const blocks = await getBlockList(me);
    res.json(blocks);
  } catch (err) {
    handleError(req, res, err);
  }
}

async function putBlock(req, res) {
  try {
    const myId = getMyId(req);
    if (!myId) return res.status(401).json({ message: '로그인이 필요합니다.' });
    const targetId = String(req.params.id);

    log('incoming block', { path: req.baseUrl + req.path, myId, targetId });

    const result = await createBlock(myId, targetId);

    const emit = req.app.get('emit');
    if (emit && emit.blockCreated) {
      try { emit.blockCreated({ blockerId: myId, blockedId: targetId }); } catch (e) { logErr('emit.blockCreated failed', e); }
    }
    if (emit?.notificationsChanged) emit.notificationsChanged([myId, targetId], ['blocks', 'friends']);

    log('🚫 일반 차단 완료', { path: req.baseUrl + req.path, myId, targetId, ...result });
    return res.json({ ok: true, ...result });
  } catch (err) {
    handleError(req, res, err);
  }
}

async function deleteBlock(req, res) {
  try {
    const myId = getMyId(req);
    if (!myId) return res.status(401).json({ message: '로그인이 필요합니다.' });
    const targetId = String(req.params.id);

    const result = await removeBlock(myId, targetId);
    const emit = req.app.get('emit');
    if (emit?.notificationsChanged) emit.notificationsChanged([myId], ['blocks']);
    log('✅ 차단 해제', { path: req.baseUrl + req.path, myId, targetId, ...result });
    res.json({ ok: true, ...result });
  } catch (err) {
    handleError(req, res, err);
  }
}

async function notificationStatus(req, res) {
  try {
    const myId = getMyId(req);
    if (!myId) return res.status(401).json({ message: '로그인이 필요합니다.' });
    return res.json(await getNotificationStatus(myId));
  } catch (err) {
    return handleError(req, res, err);
  }
}

async function readNotification(req, res) {
  try {
    const myId = getMyId(req);
    if (!myId) return res.status(401).json({ message: '로그인이 필요합니다.' });
    return res.json(await markNotificationRead(myId, req.params.category));
  } catch (err) {
    return handleError(req, res, err);
  }
}

async function getUserProfile(req, res) {
  try {
    const myId = getMyId(req);
    if (!myId) return res.status(401).json({ message: '로그인이 필요합니다.' });
    const targetId = String(req.params.id);

    const profile = await getUserProfileWithRelation(myId, targetId);
    res.json(profile);
  } catch (err) {
    handleError(req, res, err);
  }
}

module.exports = {
  requestLogger,
  listFriends,
  deleteFriend,
  listBlocks,
  putBlock,
  deleteBlock,
  getUserProfile,
  notificationStatus,
  readNotification,
};
