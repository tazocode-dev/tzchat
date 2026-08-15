// frontend/04210_Page2_target/Filter_premium_exposure.js
// ------------------------------------------------------------
// 완전 비공개 필터 (프리미엄 여부 무관, 쌍방 적용)
//
// 규칙:
// - search_matchPremiumOnly === 'OFF' → 모두 검색/노출 가능
// - search_matchPremiumOnly === 'ON'  → (1) 나는 아무도 검색하지 않음
//                                     (2) 나도 누구에게도 노출되지 않음
//                                     (3) ON인 다른 유저들도 내 리스트에서 제외
// ------------------------------------------------------------

/** 'ON'/'OFF'/boolean → boolean */
function normalizeOn(v) {
  if (typeof v === 'boolean') return v;
  const s = String(v || '').toUpperCase();
  if (s === 'ON') return true;
  if (s === 'OFF') return false;
  return false;
}

/**
 * 완전 비공개 필터
 * @param {Array} users - 후보 유저 목록
 * @param {Object} me   - 내 유저 객체 (search_matchPremiumOnly 포함)
 * @param {Object} [opt]
 * @param {boolean} [opt.log=false]
 * @returns {Array}
 */
export function filterByPremiumExposure(users, me, opt = {}) {
  const log = !!opt.log;

  // 0) 입력 보정
  const list = Array.isArray(users) ? users : [];

  // 1) 후보에서 "비공개(ON)" 유저들을 제거 → 노출 차단
  const withoutPrivateUsers = list.filter(u => !normalizeOn(u?.search_matchPremiumOnly));
  if (log && list.length !== withoutPrivateUsers.length) {
    console.log(
      `[PrivacyFilter] 후보 ${list.length}명 → 공개 유저 ${withoutPrivateUsers.length}명 (비공개 유저 제외)`
    );
  }

  // 2) 내가 비공개(ON)이면 아예 검색 자체를 하지 않음 → 빈 배열
  const iAmPrivate = normalizeOn(me?.search_matchPremiumOnly);
  if (iAmPrivate) {
    if (log) console.log('[PrivacyFilter] 🔒 내 상태=ON → 검색/노출 완전 차단 (빈 리스트 반환)');
    return [];
  }

  // 3) 내가 공개(OFF)면, 비공개 유저를 제외한 목록만 반환
  return withoutPrivateUsers;
}
