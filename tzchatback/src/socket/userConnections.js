function userRoom(userId) {
  const normalized = String(userId || '').trim();
  return normalized ? `user:${normalized}` : '';
}

function disconnectUserSockets(io, userId) {
  const room = userRoom(userId);
  if (!room || typeof io?.in !== 'function') return false;

  try {
    const operator = io.in(room);
    if (typeof operator?.disconnectSockets !== 'function') return false;
    operator.disconnectSockets(true);
    return true;
  } catch {
    return false;
  }
}

module.exports = { disconnectUserSockets, userRoom };
