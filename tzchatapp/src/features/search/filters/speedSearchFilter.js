// 스피드 매칭 검색 필터 조합
// ------------------------------------------------------------
// Speed Match Total Filter
// ------------------------------------------------------------
// 구성요소 (모두 AND 연결, 앞단 기본 제외 추가):
// 0a. excludeSelf.js                       나 자신 제외
// 0b. excludeExistingRelations.js          기존 신청·친구·차단·채팅 상대 제외
// 1.  mutualAgeFilter.js                   출생년도(상호)
// 2.  mutualRegionFilter.js                지역(상호)
// 3.  mutualPreferenceFilter.js            검색 특징
// 4.  mutualMarriageFilter.js              결혼 유무(상호)
// 5.  mutualPhotoFilter.js                 사진
// 6.  contactExclusionFilter.js            연락처 배제(상호)
// 7.  receivePreferenceFilter.js           친구 신청 수신 정책
// 8.  speedMatchParticipationFilter.js     스피드 매칭 상호 참여
// 9.  receiveLimitFilter.js                받은 신청 수 제한
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
import { filterByEmergencyCo } from './speedMatchParticipationFilter'
import { passThroughWithExposureFlag } from './receiveLimitFilter'

/**
 * Speed Match Total Filter
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
  const log = import.meta.env.DEV && !!opt.log
  let list = Array.isArray(users) ? [...users] : []

  if (log) console.groupCollapsed('[SearchFilter:Speed] 시작')

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
  list = filterByEmergencyCo(list, me, { log }) // 스피드 매칭 상호 참여 확인

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
