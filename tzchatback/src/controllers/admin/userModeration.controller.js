const {
  UserModerationError,
  updateUserSuspension,
} = require('@/services/admin/userModerationService');
const { disconnectUserSockets } = require('@/socket/userConnections');

function disconnectSuspendedUser(req, user) {
  if (user?.suspended !== true) return false;
  return disconnectUserSockets(req.app?.get?.('io'), user._id);
}

async function updateSuspension(req, res) {
  try {
    const user = await updateUserSuspension(req.params.id, req?.user?._id, req.body || {});
    disconnectSuspendedUser(req, user);
    return res.json({ ok: true, user });
  } catch (error) {
    if (error instanceof UserModerationError) {
      return res.status(error.status).json({ ok: false, code: error.code, message: error.message });
    }
    console.error('[admin:users][ERR] updateSuspension', { message: error?.message });
    return res.status(500).json({ ok: false, message: '회원 정지 상태를 변경하지 못했습니다.' });
  }
}

module.exports = { disconnectSuspendedUser, updateSuspension };
