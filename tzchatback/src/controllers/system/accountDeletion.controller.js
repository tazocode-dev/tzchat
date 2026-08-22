// src/controllers/system/accountDeletion.controller.js
// ────────────────────────────────────────────────────────────
// 회원 탈퇴 컨트롤러: 요청 파싱 + 응답 조립.
// 실제 로직은 services/system/accountDeletionService.js가 담당한다.
// ────────────────────────────────────────────────────────────

const {
  ACCOUNT_DELETION_CODES,
  AccountDeletionError,
  getStatus,
  requestDeletion,
  cancelDeletion,
} = require('@/services/system/accountDeletionService');
const { disconnectUserSockets } = require('@/socket/userConnections');

const INTERNAL_ERROR_MESSAGE = '회원 탈퇴 처리 중 오류가 발생했습니다.';

function respondInternalError(res) {
  return res.status(500).json({
    ok: false,
    code: ACCOUNT_DELETION_CODES.INTERNAL_ERROR,
    message: INTERNAL_ERROR_MESSAGE,
    error: INTERNAL_ERROR_MESSAGE,
  });
}

function disconnectDeletingUser(req) {
  const userId = req._uid || req.user?._id || req.auth?.userId || req.session?.user?._id;
  return disconnectUserSockets(req.app?.get?.('io'), userId);
}

async function status(req, res) {
  try {
    const result = await getStatus(req);
    return res.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof AccountDeletionError) {
      return res.status(e.status).json({ ok: false, ...e.payload });
    }
    console.error('[accountDeletionRouter] status error');
    return respondInternalError(res);
  }
}

async function deleteRequest(req, res) {
  try {
    const result = await requestDeletion(req);
    disconnectDeletingUser(req);
    return res.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof AccountDeletionError) {
      return res.status(e.status).json({ ok: false, ...e.payload });
    }
    console.error('[accountDeletionRouter] delete-request error');
    return respondInternalError(res);
  }
}

async function cancelDelete(req, res) {
  try {
    const result = await cancelDeletion(req);
    return res.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof AccountDeletionError) {
      return res.status(e.status).json({ ok: false, ...e.payload });
    }
    console.error('[accountDeletionRouter] cancel-delete error');
    return respondInternalError(res);
  }
}

module.exports = {
  INTERNAL_ERROR_MESSAGE,
  cancelDelete,
  deleteRequest,
  disconnectDeletingUser,
  respondInternalError,
  status,
};
