// src/controllers/chat/friendRequestSend.controller.js
// ────────────────────────────────────────────────────────────
// 친구 신청 발송/취소 컨트롤러: 요청 파싱 + 로깅 + 응답 조립.
// 실제 로직은 services/chat/friendRequestSendService.js가 담당한다.
// ────────────────────────────────────────────────────────────

const {
  FriendRequestSendError,
  MATCH_CONFIG,
  sendFriendRequest,
  notifyRequestCreated,
  cancelFriendRequest,
} = require('@/services/chat/friendRequestSendService');

function log(...args) { try { console.log('[friendRequestSendRouter]', ...args); } catch (_) {} }
function logErr(...args) { try { console.error('[friendRequestSendRouter][ERR]', ...args); } catch (_) {} }

function getMyId(req) {
  const jwtId = req?.user?._id;
  const sessId = req?.session?.user?._id;
  return (jwtId && String(jwtId)) || (sessId && String(sessId)) || '';
}

// 공통 요청/응답 로깅
function requestLogger(req, res, next) {
  const started = Date.now();
  console.log('[API][REQ]', {
    path: req.baseUrl + req.path, method: req.method, params: req.params, query: req.query, userId: getMyId(req),
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

function makeSendHandler(matchType) {
  const cfg = MATCH_CONFIG[matchType];
  return async function sendHandler(req, res) {
    const fromId = getMyId(req);
    const { to, message } = req.body || {};
    const toId = String(to || '');
    log('incoming match request', { path: req.baseUrl + req.path, fromId, toId, matchType });

    try {
      if (!fromId) return res.status(401).json({ message: '로그인이 필요합니다.' });

      const { createdReq, fromUserLean } = await sendFriendRequest(fromId, toId, message, matchType);

      const emit = req.app.get('emit');
      await notifyRequestCreated({ emit, createdReq, toId, fromNick: fromUserLean?.nickname });

      log(`✅ ${cfg.label} 신청 완료`, { path: req.baseUrl + req.path, fromId, toId, matchType });
      return res.json(createdReq.toObject());
    } catch (err) {
      if (err instanceof FriendRequestSendError) {
        return res.status(err.status).json({ message: err.message });
      }
      logErr('[API][ERR]', { path: req.baseUrl + req.path, name: err?.name, message: err?.message });
      return res.status(500).json({ message: '서버 오류' });
    }
  };
}

const postFriendRequest = makeSendHandler('general');
const postFriendRequestSpeed = makeSendHandler('speed');

async function deleteFriendRequest(req, res) {
  try {
    const fromId = getMyId(req);
    const { id } = req.params;
    if (!fromId) return res.status(401).json({ message: '로그인이 필요합니다.' });

    const deleted = await cancelFriendRequest(fromId, id);

    const emit = req.app.get('emit');
    if (emit && emit.friendRequestCancelled) emit.friendRequestCancelled(deleted);

    log('🗑️ 친구 신청 취소', { path: req.baseUrl + req.path, fromId, toId: deleted.to?._id, id });
    res.json({ ok: true, deletedId: id });
  } catch (err) {
    if (err instanceof FriendRequestSendError) {
      return res.status(err.status).json({ message: err.message });
    }
    logErr('[API][ERR]', { path: req.baseUrl + req.path, name: err?.name, message: err?.message });
    res.status(500).json({ message: '서버 오류' });
  }
}

module.exports = { requestLogger, postFriendRequest, postFriendRequestSpeed, deleteFriendRequest };
