// 일반 검색 필터 조합
// ------------------------------------------------------------
// Normal Total Filter (일반 채팅용)
// ------------------------------------------------------------
// AND 체인 구성(앞단 제외 추가):
// 0a. excludeSelf.js                  나 자신 제외
// 0b. excludeExistingRelations.js     기존 신청·친구·차단·채팅 상대 제외
// 1.  mutualAgeFilter.js              출생년도(상호)
// 2.  mutualRegionFilter.js           지역(상호)
// 3.  mutualPreferenceFilter.js       검색 특징
// 4.  mutualMarriageFilter.js         결혼 유무(상호)
// 5.  mutualPhotoFilter.js            사진
// 6.  contactExclusionFilter.js       연락처 배제(상호)
// 7.  receivePreferenceFilter.js      친구 신청 수신 정책
// 8.  receiveLimitFilter.js           받은 신청 수 제한
// ------------------------------------------------------------

import { filterOutSelf } from './excludeSelf'
import { filterByListChat } from './excludeExistingRelations'
import { filterByYearCo } from './mutualAgeFilter'
import { filterByRegionCo } from './mutualRegionFilter'
import { filterByPreferenceCo } from './mutualPreferenceFilter'
import { filterByMarriageCo } from './mutualMarriageFilter'
import { filterByPhotoCo } from './mutualPhotoFilter'
import { filterByContactsCo } from './contactExclusionFilter'
import { filterByReceiveOffCo } from './receivePreferenceFilter'
import { passThroughWithExposureFlag } from './receiveLimitFilter'

/**
 * Normal Total Filter
 * @param {Array<Object>} users  후보 사용자 목록
 * @param {Object} me            내 프로필 객체
 * @param {Object} [opt]
 * @param {boolean} [opt.log=false]
 * @param {number}  [opt.pendingCountOverride]
 * @param {number}  [opt.receiveLimitOverride]
 * @param {Array<string|Object>} [opt.extraExcludeIds]  // ✅ 보낸/받은신청·친구·차단·채팅상대 등 외부에서 모은 추가 제외 ID
 * @returns {Array<Object>} 필터 통과 사용자 목록
 */
export function applyTotalFilterNormal(users, me, opt = {}) {
  const log = import.meta.env.DEV && !!opt.log
  let list = Array.isArray(users) ? [...users] : []

  if (log) console.groupCollapsed('[SearchFilter:Normal] 시작')

  // 0단계: 기본 제외(자기 자신 + 리스트/채팅 상대)
  list = filterOutSelf(list, me, { log })
  list = filterByListChat(list, me, {
    log,
    // ✅ Search/List 화면에서 이미 들고 있는 보낸/받은신청, 친구/차단, 채팅상대 ID를 주입
    //    (없으면 빈 배열)
    extraExcludeIds: Array.isArray(opt.extraExcludeIds) ? opt.extraExcludeIds : []
  })

  // 1~7: 상호 + 단방향 필터 체인
  list = filterByYearCo(list, me, { log })
  list = filterByRegionCo(list, me, { log })
  list = filterByPreferenceCo(list, me, { log })
  list = filterByMarriageCo(list, me, { log })
  list = filterByPhotoCo(list, me, { log })
  list = filterByContactsCo(list, me, { log })
  list = filterByReceiveOffCo(list, me, { log })

  // 8: 받은 신청 수 제한 — 제한 도달 시 내 검색 결과도 0
  const pendingCount = opt.pendingCountOverride ?? me?.pendingCount ?? 0
  const receiveLimit = opt.receiveLimitOverride ?? me?.receiveLimit ?? 19

  const { users: finalList, exposureBlocked } = passThroughWithExposureFlag(
    list,
    pendingCount,
    receiveLimit
  )

  if (exposureBlocked && log) console.log('⛔ 받은신청 제한 도달: 검색/노출 모두 차단됨')

  if (log) console.groupEnd()
  return finalList
}

export default applyTotalFilterNormal
