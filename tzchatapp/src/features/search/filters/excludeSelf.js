// 자기 자신 제외 필터
// ------------------------------------------------------------
// 자기 자신 제외 필터
// ------------------------------------------------------------
function normId(v) {
  if (!v) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  return String(v._id || v.id || v.userId || v.user_id || '');
}

/**
 * 자기 자신 제외
 * @param {Array} users
 * @param {Object} me
 * @param {Object} [opt]
 * @param {boolean} [opt.log=false]
 */
export function filterOutSelf(users, me, opt = {}) {
  const log = import.meta.env.DEV && !!opt.log;
  const myId = normId(me);
  const out = (Array.isArray(users) ? users : []).filter(u => normId(u) !== myId);
  if (log) {
    const removed = (users?.length || 0) - out.length;
    if (removed > 0) console.log(`[Self] 자기 자신 제외됨: ${removed}건`);
  }
  return out;
}
