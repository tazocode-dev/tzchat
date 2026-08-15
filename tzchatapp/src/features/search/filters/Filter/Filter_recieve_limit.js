// frontend/utils/Filter_receive_Limit.js
// ------------------------------------------------------------
// 받은 친구 신청 수 제한에 따른 "노출 차단" 유틸
// - 정책 전환: 제한 도달(pc >= rl) 시
//   1) 나를 아무에게도 노출하지 않음 (exposureBlocked = true)
//   2) 내가 검색해도 아무도 보이지 않음 (users = [])
// ------------------------------------------------------------

/** limit 도달 여부 */
export function isReceiveLimitReached(pendingCount, receiveLimit) {
  const pc = Number(pendingCount)
  const rl = Number(receiveLimit)
  if (!Number.isFinite(pc) || !Number.isFinite(rl)) return false
  return pc >= rl // 동일/초과 모두 차단
}

/**
 * 제한 도달 시: 빈 배열 반환(내 검색 결과 0) + 노출 차단 플래그
 * 미도달 시: 원본 배열 유지
 * @returns {{ users: Array, exposureBlocked: boolean }}
 */
export function passThroughWithExposureFlag(users, pendingCount, receiveLimit) {
  const reached = isReceiveLimitReached(pendingCount, receiveLimit)
  if (reached) {
    return { users: [], exposureBlocked: true }
  }
  return { users: Array.isArray(users) ? users : [], exposureBlocked: false }
}