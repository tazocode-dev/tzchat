// frontend/04210_Page2_target/Filter_marriage_co.js
// ------------------------------------------------------------
// 상대 결혼 유무(검색 조건) 상호 노출 필터
//
// 규칙(내 기준):
// - 내 search_marriage === '전체' → 누구나 통과
// - 그 외(예: '미혼','기혼','이혼' 등) → 상대의 marriage 가 내 search_marriage 와 동일해야 통과
//
// 상호 노출(Reciprocal):
// - 상대의 search_marriage 규칙으로도 "내 marriage"가 통과해야 최종 노출
//
// 호환:
// - null/'' → '전체'와 동일하게 취급
// - 문자열 비교는 공백 트림 후 원문 비교(케이스는 그대로 사용)
// ------------------------------------------------------------

/** 안전 문자열화 */
function s(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** '전체' 판단: null/''/'전체' → 전체로 간주 */
function isAll(v) {
  const x = s(v);
  return x === '' || x === '전체';
}

/** 내 규칙으로 상대가 통과하는지 */
export function passMyMarriageRule(me, other) {
  const mySearch = s(me?.search_marriage); // 내가 원하는 상대의 결혼유무
  const theirMar = s(other?.marriage);     // 상대의 실제 결혼유무

  // 내 검색이 '전체'면 모두 허용
  if (isAll(mySearch)) return true;

  // 동일한 선택만 허용
  if (!theirMar) return false;
  return mySearch === theirMar;
}

/** 상대 규칙으로 내가 통과하는지 (상호 노출) */
export function passTheirMarriageRule(me, other) {
  const theirSearch = s(other?.search_marriage);
  const myMar       = s(me?.marriage);

  if (isAll(theirSearch)) return true;
  if (!myMar) return false;
  return theirSearch === myMar;
}

/**
 * 상호 노출 필터
 * @param {Array} users - 후보 유저 목록
 * @param {Object} me   - 내 유저 객체({ marriage, search_marriage } 포함)
 * @param {Object} [opt]
 * @param {boolean} [opt.log=false]
 * @returns {Array}
 */
export function filterByMarriageCo(users, me, opt = {}) {
  const log = !!opt.log;
  const list = Array.isArray(users) ? users : [];

  return list.filter(other => {
    const a = passMyMarriageRule(me, other);
    if (!a) {
      if (log) console.log(`[결혼필터] ❌ 내규칙 불일치 → ${other?.nickname ?? '-'}`);
      return false;
    }
    const b = passTheirMarriageRule(me, other);
    if (!b) {
      if (log) console.log(`[결혼필터] ❌ 상대규칙 불일치 → ${other?.nickname ?? '-'}`);
      return false;
    }
    if (log) console.log(`[결혼필터] ✅ 통과 → ${other?.nickname ?? '-'}`);
    return true;
  });
}

/**
 * 단방향(참고용): 상호 노출 없이 "내 규칙만" 적용
 */
export function filterByMarriageSimple(users, me) {
  const list = Array.isArray(users) ? users : [];
  return list.filter(other => passMyMarriageRule(me, other));
}



/*
사용 예시 (체인에 추가)
import { filterByMarriageCo } from '@/utils/Filter_marriage_co'

// users = ...서버에서 받은 배열
// me = 로그인 유저 객체 (marriage, search_marriage 포함)
users = filterByMarriageCo(users, me, { log: false })


이 모듈은 기존 co-필터들과 AND 체인으로 연결하세요:

users = filterByYearCo(users, me)
users = filterByRegionCo(users, me)
users = filterByPreferenceCo(users, me)
users = filterByMarriageCo(users, me)   // ← 여기
users = filterByContactsCo(users, me)
users = filterByReceiveOffCo(users, me)
*/