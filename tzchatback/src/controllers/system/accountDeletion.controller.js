// src/controllers/system/accountDeletion.controller.js
// ────────────────────────────────────────────────────────────
// 회원 탈퇴 컨트롤러: 요청 파싱 + 응답 조립.
// 실제 로직은 services/system/accountDeletionService.js가 담당한다.
// ────────────────────────────────────────────────────────────

const {
  AccountDeletionError,
  getStatus,
  requestDeletion,
  cancelDeletion,
} = require('@/services/system/accountDeletionService');

async function status(req, res) {
  try {
    const result = await getStatus(req);
    return res.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof AccountDeletionError) {
      return res.status(e.status).json({ ok: false, ...e.payload });
    }
    console.error('[accountDeletionRouter] status error', e);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

async function deleteRequest(req, res) {
  try {
    const result = await requestDeletion(req);
    return res.json({ ok: true, message: result.message, status: result.status, deletionDueAt: result.deletionDueAt });
  } catch (e) {
    if (e instanceof AccountDeletionError) {
      return res.status(e.status).json({ ok: false, ...e.payload });
    }
    console.error('[accountDeletionRouter] delete-request error', e);
    return res.status(500).json({ ok: false, message: 'Server error' });
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
    console.error('[accountDeletionRouter] cancel-delete error', e);
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

module.exports = { status, deleteRequest, cancelDelete };
