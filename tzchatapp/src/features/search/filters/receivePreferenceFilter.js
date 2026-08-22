// 친구 신청 수신 선호 필터
// ------------------------------------------------------------
// ------------------------------------------------------------
// "친구 신청 받지 않기" 상호 배제 필터 (co-filter)
// ------------------------------------------------------------
// 규칙(정의):
// - 내 상태가 ON  → 아무도 보지 않음(검색 결과 0) + 나도 누구에게도 노출되지 않음
// - 내 상태가 OFF → 이 규칙 기준으로는 제한 없음(통과)
// - 상대가 ON     → 해당 상대는 누구에게도 노출되지 않아야 하므로 결과에서 제외
//
// 데이터 호환:
// - DB 필드: user.search_allowFriendRequests ('ON' | 'OFF')
//   * 'ON'  → 받지 않기(거부) 상태        → receiveOff = true
//   * 'OFF' → 받기 허용(수신 허용) 상태   → receiveOff = false
// - 불리언이 내려오면 true=허용, false=거부 로 간주(하위 호환)
//   * boolean true  → 허용 → receiveOff = false
//   * boolean false → 거부 → receiveOff = true
// ------------------------------------------------------------

function normalizeStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim().toUpperCase();
}

/** user가 "친구 신청 받지 않기(거부=비노출)" 상태인지 판정 */
export function isReceiveOff(user) {
  const v = user?.search_allowFriendRequests;

  // 문자열 'ON'/'OFF'
  const s = normalizeStr(v);
  if (s === 'ON')  return true;   // 받지 않기(거부/비노출)
  if (s === 'OFF') return false;  // 허용

  // 불리언 하위 호환: true=허용, false=거부
  if (typeof v === 'boolean') {
    return !v; // 허용(true)  → off=false,  거부(false) → off=true
  }

  // 정보 없으면 기본 허용(=off 아님)
  return false;
}

/**
 * 상호 배제 필터
 * @param {Array} users - 후보 유저 목록
 * @param {Object} me   - 내 유저 객체( search_allowFriendRequests 포함 )
 * @param {Object} [opt]
 * @param {boolean} [opt.log=false]
 * @returns {Array}
 */
export function filterByReceiveOffCo(users, me, opt = {}) {
  const log = import.meta.env.DEV && !!opt.log;

  // 내가 ON(받지 않기)면: 아무도 보지 않음 + 아무에게도 노출되지 않음
  if (isReceiveOff(me)) {
    if (log) console.log('[받지않기필터] 내 상태=ON → 결과 0 & 비노출');
    return [];
  }

  // 내가 OFF면: 상대가 ON인 사용자만 제외
  const arr = Array.isArray(users) ? users : [];
  const out = arr.filter(other => {
    const off = isReceiveOff(other);
    if (off) {
      if (log) console.log(`[받지않기필터] 제외(상대 ON/비노출): ${other?.nickname ?? '-'}`);
      return false;
    }
    return true;
  });

  if (log) console.log(`[받지않기필터] 결과 ${out.length}/${arr.length}`);
  return out;
}



/*
사용 예시 (target.vue)
import { filterByReceiveOffCo } from '@/features/search/filters/receivePreferenceFilter'

// me: 로그인 유저 객체 (search_allowFriendRequests 포함)
let filtered = filterByReceiveOffCo(users, me, { log: false })


이 모듈은 다른 co-필터들과 AND 체인으로 연결하세요. 예:

users = filterByYearCo(users, me)
users = filterByRegionCo(users, me)
users = filterByContactsCo(users, me)
users = filterByReceiveOffCo(users, me) // ← 마지막에 전체 차단 적용

*/
