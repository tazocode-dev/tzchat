// 스피드 매칭 상호 참여 필터
// ------------------------------------------------------------
// Emergency 스위치 상호 노출 필터
//
// 규칙:
// - 내가 OFF → 아무도 검색/노출 안 됨 (결과: [])
// - 내가 ON  → ON 인 사람들만 검색, 그리고 ON 인 사람들에게만 노출 (서로 ON)
//
// 판정 로직:
// - user.emergency.isActive === true 이고,
//   (remainingSeconds > 0) 또는 (activatedAt 기준 windowSec 이내)
//   를 "ON"으로 간주
// ------------------------------------------------------------

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 해당 유저의 emergency ON 여부 */
export function isEmergencyOn(user, opt = {}) {
  const em = user?.emergency || {};
  const isActive = em.isActive === true;

  if (!isActive) return false;

  // 1) 남은 시간 수치 우선
  if (typeof em.remainingSeconds === 'number') {
    return em.remainingSeconds > 0;
  }

  // 2) activatedAt 윈도우(기본 1시간)
  const windowSec = toNumber(opt.windowSec) || 3600;
  const ts = em.activatedAt ? Date.parse(em.activatedAt) : 0;
  if (!Number.isFinite(ts) || ts <= 0) return false;

  return (Date.now() - ts) < windowSec * 1000;
}

/**
 * 상호 노출 필터
 * - 내가 OFF면 [] 반환
 * - 내가 ON이면, 상대도 ON 인 유저만 통과
 * @param {Array} users  후보 유저 목록
 * @param {Object} me    내 유저 객체 (emergency 포함)
 * @param {Object} [opt] { windowSec?: number, log?: boolean }
 */
export function filterByEmergencyCo(users, me, opt = {}) {
  const log = import.meta.env.DEV && !!opt.log;
  const onMe = isEmergencyOn(me, opt);

  if (!onMe) {
    if (log) console.log('[SpeedMatchParticipationFilter] 내 상태=OFF → 결과 0');
    return [];
  }

  const list = Array.isArray(users) ? users : [];
  return list.filter(other => {
    const onOther = isEmergencyOn(other, opt);
    if (!onOther) {
      if (log) console.log(`[SpeedMatchParticipationFilter] 제외(상대 OFF): ${other?.nickname ?? '-'}`);
      return false;
    }
    return true;
  });
}
