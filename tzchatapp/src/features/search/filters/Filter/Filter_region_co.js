// frontend/utils/Filter_region_co.js
// ------------------------------------------------------------
// 지역(검색지역) 필터 유틸 - 배열(users) 대상 클라이언트/공용 모듈
// 요구사항:
// 1) 규칙(단일 검색값):
//    - search_region1 === '전체' → 전체 통과
//    - search_region1 !== '전체' && search_region2 === '전체' → region1만 일치하면 통과
//    - 둘 다 '전체' 아님 → region1 & region2 모두 일치해야 통과
// 2) 상호 노출:
//    - 내 검색 조건에 "상대 지역"이 맞아야 하고
//    - 동시에 "상대의 검색 조건"에도 "내 지역"이 맞아야 함
// 3) 호환:
//    - '전체', null, '' → 미지정으로 간주
//    - 유저는 단일 필드(region1/region2) 외에 배열 search_regions([ {region1,region2} ])도 가질 수 있음
//      → OR 조건으로 취급 (하나라도 맞으면 통과)
// ------------------------------------------------------------

/** 문자열 정규화: null/undefined/숫자 등 → 깨끗한 소문자 문자열 (비어있으면 '') */
export function normalizeStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** '전체' 판단 (null/''/'전체' 모두 전체로 간주) */
export function isAll(v) {
  const s = normalizeStr(v);
  return s === '' || s === '전체';
}

/** 유저의 "대표 지역" (region1, region2) 추출 */
export function getUserRegion(user) {
  const r1 = normalizeStr(user?.region1);
  const r2 = normalizeStr(user?.region2);
  return { r1, r2 };
}

/**
 * 유저의 검색 지역 규칙들을 배열로 추출
 * - 우선순위: 배열(search_regions | searchRegions) → 단일(search_region1/2) → 전체
 * - 각 규칙은 { r1, r2 } 형태
 */
export function getSearchRegionRules(user) {
  // 1) 배열 우선
  const arr = Array.isArray(user?.search_regions)
    ? user.search_regions
    : (Array.isArray(user?.searchRegions) ? user.searchRegions : []);

  const list = arr
    .map(it => ({ r1: normalizeStr(it?.region1), r2: normalizeStr(it?.region2) }))
    .filter(it => it.r1 !== '' || it.r2 !== '');

  if (list.length) return list;

  // 2) 단일 필드
  const r1 = normalizeStr(user?.search_region1);
  const r2 = normalizeStr(user?.search_region2);
  if (r1 !== '' || r2 !== '') return [{ r1, r2 }];

  // 3) 비어있다면 '전체'
  return [{ r1: '', r2: '' }]; // 전체
}

/** 단일 규칙 {r1, r2} 에 상대 지역 {otherR1, otherR2}가 맞는지 검사 (요구한 3가지 로직) */
export function matchOneRule(otherR1, otherR2, ruleR1, ruleR2) {
  const R1All = isAll(ruleR1);
  const R2All = isAll(ruleR2);

  // search_region1 === '전체' → 모두 통과
  if (R1All) return true;

  // search_region1 != '전체' && search_region2 === '전체' → region1만 일치
  if (!R1All && R2All) {
    return normalizeStr(otherR1) === normalizeStr(ruleR1);
  }

  // 둘 다 '전체' 아님 → region1 & region2 모두 일치
  return (
    normalizeStr(otherR1) === normalizeStr(ruleR1) &&
    normalizeStr(otherR2) === normalizeStr(ruleR2)
  );
}

/** 다중 규칙 OR: rules 배열 중 하나라도 matchOneRule을 만족하면 통과 */
export function matchRulesOR(otherR1, otherR2, rules) {
  return rules.some(rule => matchOneRule(otherR1, otherR2, rule.r1, rule.r2));
}

/**
 * 단방향(심플) 필터:
 * - 내 검색 조건(r1, r2 또는 rules)에 상대 지역(other.region1/2)이 부합하는지로만 필터
 */
export function filterByRegionSimple(users, myRegion1, myRegion2) {
  const rules = [{ r1: normalizeStr(myRegion1), r2: normalizeStr(myRegion2) }];
  return (Array.isArray(users) ? users : []).filter(other => {
    const { r1: o1, r2: o2 } = getUserRegion(other);
    return matchRulesOR(o1, o2, rules);
  });
}

/**
 * 상호 필터(협동 버전):
 * - 1) "내 검색 규칙들" 중 하나에 상대 지역이 맞아야 하고
 * - 2) "상대의 검색 규칙들" 중 하나에 내 지역이 맞아야 한다
 * @param {Array} users  후보 유저 목록
 * @param {Object} me    내 유저 객체 (region1/2, search_region*, search_regions*)
 * @param {Object} [opt] { log?: boolean }
 */
export function filterByRegionCo(users, me, opt = {}) {
  const log = !!opt.log;

  // 내 지역
  const { r1: myR1, r2: myR2 } = getUserRegion(me);
  // 내 검색 규칙들(OR)
  const myRules = getSearchRegionRules(me);

  return (Array.isArray(users) ? users : []).filter(other => {
    const { r1: oR1, r2: oR2 } = getUserRegion(other);
    const theirRules = getSearchRegionRules(other);

    // (1) 내 규칙 → 상대 지역 매칭
    const passMy = matchRulesOR(oR1, oR2, myRules);
    if (!passMy) {
      if (log) {
        console.log(
          `[지역필터] ❌ 내규칙불일치 → other:${other?.nickname ?? '-'} ` +
          `otherRegion=[${oR1 || '전체'} ${oR2 || '전체'}], myRules=${JSON.stringify(myRules)}`
        );
      }
      return false;
    }

    // (2) 상대 규칙 → 내 지역 매칭 (상호 노출)
    const passTheir = matchRulesOR(myR1, myR2, theirRules);
    if (!passTheir) {
      if (log) {
        console.log(
          `[지역필터] ❌ 상대규칙불일치 → other:${other?.nickname ?? '-'} ` +
          `myRegion=[${myR1 || '전체'} ${myR2 || '전체'}], theirRules=${JSON.stringify(theirRules)}`
        );
      }
      return false;
    }

    if (log) {
      console.log(
        `[지역필터] ✅ 통과 → other:${other?.nickname ?? '-'} ` +
        `otherRegion=[${oR1 || '전체'} ${oR2 || '전체'}], myRegion=[${myR1 || '전체'} ${myR2 || '전체'}]`
      );
    }
    return true;
  });
}

/*
기존처럼 단방향만 필요하면:
import { filterByRegionSimple } from '@/utils/Filter_region_co'
const result = filterByRegionSimple(users, my.search_region1, my.search_region2)


상호 노출까지 보장하려면:
import { filterByRegionCo } from '@/utils/Filter_region_co'
const result = filterByRegionCo(users, me, { log: true })
*/