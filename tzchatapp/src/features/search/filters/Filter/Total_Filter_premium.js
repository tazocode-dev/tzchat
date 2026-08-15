// frontend/04210_Page2_target/Filter/Total_Filter_premium.js
// ------------------------------------------------------------
// Premium Total Filter
// ------------------------------------------------------------
// 구성요소 (모두 AND 연결, 앞단 기본 제외 추가):
// 0a. Filter_self.js            나 자신 제외
// 0b. Filter_listchat.js        리스트/채팅 상대(받은/보낸 신청, 친구, 차단, 채팅상대 포함) 제외
// 1.  Filter_year_co.js         출생년도 범위 (상호 노출)
// 2.  Filter_region_co.js       지역 (상호 노출)
// 3.  Filter_preference_co.js   검색특징 (이성/동성 등)
// 4.  Filter_marriage_co.js     결혼 유무
// 5.  Filter_photo_co.js        사진 (ON일 때만 노출)
// 6.  Filter_contacts_co.js     연락처 연결 끊기
// 7.  Filter_recieve_co.js      친구신청 받지 않기
// 8.  Filter_emergency_co.js    긴급모드(Emergency) — Premium 핵심
// 9.  Filter_recieve_limit.js   받은신청 제한 (노출 제한 전용)
// ------------------------------------------------------------

import { filterOutSelf } from './Filter_self'
import { filterByListChat } from './Filter_listchat'
import { filterByYearCo } from './Filter_year_co'
import { filterByRegionCo } from './Filter_region_co'
import { filterByPreferenceCo } from './Filter_preference_co'
import { filterByMarriageCo } from './Filter_marriage_co'
import { filterByPhotoCo } from './Filter_photo_co'
import { filterByContactsCo } from './Filter_contacts_co'
import { filterByReceiveOffCo } from './Filter_recieve_co'
import { filterByEmergencyCo } from './Filter_emergency_co'
import { passThroughWithExposureFlag } from './Filter_recieve_limit'

/**
 * Premium Total Filter
 * @param {Array<Object>} users  후보 유저 목록
 * @param {Object} me            내 유저 객체
 * @param {Object} [opt]
 * @param {boolean} [opt.log=false]               콘솔 로그
 * @param {number}  [opt.pendingCountOverride]    받은신청 수(강제)
 * @param {number}  [opt.receiveLimitOverride]    받은신청 제한치(강제)
 * @param {Array<string|Object>} [opt.extraExcludeIds]  // ✅ 보낸/받은신청·친구·차단·채팅상대 등 외부에서 모은 추가 제외 ID
 * @returns {Array<Object>} 최종 필터 결과
 */
export function applyTotalFilterPremium(users, me, opt = {}) {
  const log = !!opt.log
  let list = Array.isArray(users) ? [...users] : []

  if (log) console.groupCollapsed('[TotalFilter:Premium] 시작')

  // 0단계: 기본 제외(자기 자신 + 리스트/채팅 상대)
  list = filterOutSelf(list, me, { log })
  list = filterByListChat(list, me, {
    log,
    // ✅ Search/List 화면에서 이미 들고 있는 보낸/받은신청, 친구/차단, 채팅상대 ID를 주입
    extraExcludeIds: Array.isArray(opt.extraExcludeIds) ? opt.extraExcludeIds : []
  })

  // 1~8: 상호/단방향 조건 + 긴급모드
  list = filterByYearCo(list, me, { log })
  list = filterByRegionCo(list, me, { log })
  list = filterByPreferenceCo(list, me, { log })
  list = filterByMarriageCo(list, me, { log })
  list = filterByPhotoCo(list, me, { log })
  list = filterByContactsCo(list, me, { log })
  list = filterByReceiveOffCo(list, me, { log })
  list = filterByEmergencyCo(list, me, { log }) // 🔥 Premium 핵심

  // 9: 받은신청 제한 — 검색은 유지, 노출만 차단
  const pendingCount = opt.pendingCountOverride ?? me?.pendingCount ?? 0
  const receiveLimit = opt.receiveLimitOverride ?? me?.receiveLimit ?? 19

  const { users: finalList, exposureBlocked } = passThroughWithExposureFlag(
    list,
    pendingCount,
    receiveLimit
  )

  if (exposureBlocked && log) console.log('⚠️ 받은신청 제한으로 노출 차단됨')

  if (log) console.groupEnd()
  return finalList
}

export default applyTotalFilterPremium
