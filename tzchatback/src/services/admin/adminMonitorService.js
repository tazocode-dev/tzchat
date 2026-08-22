// src/services/admin/adminMonitorService.js
// ────────────────────────────────────────────────────────────
// 관리자 서버/시스템 모니터링 도메인 서비스 (지침 §1). routes/admin/adminRouter.js에서 분리.
// ────────────────────────────────────────────────────────────

const mongoose = require('mongoose');
const { AdminLog, User } = require('@/models');

function getHeartbeat() {
  const now = new Date();
  const uptimeSec = process.uptime();
  const mem = process.memoryUsage();

  return {
    serverTime: now.toISOString(),
    version: process.version,
    platform: process.platform,
    uptimeSec,
    memory: { rss: mem.rss, heapUsed: mem.heapUsed },
  };
}

async function pingDb() {
  return mongoose.connection.db.admin().ping();
}

function getOnlineStatus(app) {
  const io = app.get('io');
  const onlineUsers = app.get('onlineUsers');
  const roomMembers = app.get('roomMembers');

  const rooms = [];
  if (roomMembers && typeof roomMembers.entries === 'function') {
    for (const [roomId, set] of roomMembers.entries()) {
      rooms.push({ roomId, count: set.size });
    }
  }

  return {
    sockets: io?.engine?.clientsCount || 0,
    onlineUsers: Array.isArray(onlineUsers) ? onlineUsers : Array.from(onlineUsers || []),
    rooms,
  };
}

async function getRecentLogs() {
  return AdminLog.find({}).sort({ createdAt: -1 }).limit(200).lean();
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function getAdminUsers({ page: pageInput, limit: limitInput, search: searchInput }) {
  const page = Math.max(1, parseInt(pageInput, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(limitInput, 10) || 30));
  const search = String(searchInput || '').trim().slice(0, 80);
  const query = search
    ? {
        $or: [
          { username: { $regex: escapeRegExp(search), $options: 'i' } },
          { email: { $regex: escapeRegExp(search), $options: 'i' } },
          { nickname: { $regex: escapeRegExp(search), $options: 'i' } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    User.find(query)
      .select('_id username email nickname birthyear gender region1 region2 preference role user_level suspended suspendedReason suspendedAt createdAt')
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(query),
  ]);

  return { users, page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) };
}

module.exports = { getHeartbeat, pingDb, getOnlineStatus, getRecentLogs, getAdminUsers };
