// frontend/04210_Page2_target/Filter_year_co.js
// ------------------------------------------------------------
// 출생년도(검색나이) 필터 유틸 - 배열(users) 대상 클라이언트/공용 모듈
// 요구사항:
// 1) 규칙 1~4 (전체/이상/이하/범위)로 "내 검색 범위"에 맞는 유저만 통과
// 2) 동시에, "상대의 검색 범위"에도 내가 들어갈 때에만 통과(상호 노출)
// - '전체', null, '' 모두 미지정으로 간주
// - user.birthyear는 숫자로 변환 후 비교 (숫자 아니면 제외)
// ------------------------------------------------------------

/** '전체'/null/'' → null, 숫자 문자열은 Number로 변환 */
export function normalizeYear(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s || s === '전체') return null;
    const n = Number(s);
    return Number.isNaN(n) ? null : n;
  }
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  return null;
}

/** 경계(from/to)가 null이면 열린 구간으로 간주하여 birthyear 포함 여부 판단 */
export function isInRange(birthyear, fromYear, toYear) {
  if (!Number.isFinite(birthyear)) return false;
  if (fromYear != null && birthyear < fromYear) return false;
  if (toYear   != null && birthyear > toYear)   return false;
  return true;
}

/** 유저 객체에서 검색 범위(from/to) 추출 */
export function getSearchYearRangeOf(user) {
  const from = normalizeYear(user?.search_birthyear1);
  const to   = normalizeYear(user?.search_birthyear2);
  return { from, to };
}

/**
 * 규칙 1~4: 내 검색 범위 → 상대 birthyear 필터
 * - 둘 다 null → 전체 통과
 * - from만 → from 이상
 * - to만   → to 이하
 * - 둘 다  → 구간 포함
 */
export function matchMyRangeToOtherBirth(birthyearOfOther, myFrom, myTo) {
  // 1) 둘 다 전체(=null) → 모든 유저
  if (myFrom == null && myTo == null) return true;
  // 2) from만, 3) to만, 4) 둘 다 → isInRange로 통일
  return isInRange(birthyearOfOther, myFrom, myTo);
}

/**
 * 상호 노출 규칙: 상대의 검색 범위에도 내가 들어가야 한다
 * - 상대 from/to 둘 다 null → 제한 없음(통과)
 * - 내 birthyear가 null이면, 상대가 둘 다 null일 때만 통과
 */
export function matchReciprocal(myBirthyear, otherFrom, otherTo) {
  const otherHasAny = (otherFrom != null) || (otherTo != null);
  if (!otherHasAny) {
    // 상대가 전체(=미지정)면 누구든 허용
    return true;
  }
  // 내 birthyear가 없으면 상대 범위를 만족시킬 수 없음
  if (myBirthyear == null) return false;
  return isInRange(myBirthyear, otherFrom, otherTo);
}

/**
 * 단순 버전: 기존과 동일한 "배열 필터" (상호 노출 없이 규칙 1~4만 적용)
 * @param {Array} users
 * @param {String|Number|null} fromYear
 * @param {String|Number|null} toYear
 * @returns {Array}
 */
export function filterByYearSimple(users, fromYear, toYear) {
  const from = normalizeYear(fromYear);
  const to   = normalizeYear(toYear);

  return (Array.isArray(users) ? users : []).filter(u => {
    const by = Number(u?.birthyear);
    if (!Number.isFinite(by)) return false; // 출생년도 없으면 제외
    return matchMyRangeToOtherBirth(by, from, to);
  });
}

/**
 * 상호 버전: 내 검색 범위 + 상대의 검색 범위 모두 충족해야 리스트에 노출
 * @param {Array} users           - 후보 유저 목록
 * @param {Object} me             - 내 유저객체(최소: birthyear, search_birthyear1/2)
 * @param {Object} [opt]
 * @param {Boolean} [opt.log=false] - 콘솔 로그 온/오프
 * @returns {Array}
 */
export function filterByYearCo(users, me, opt = {}) {
  const log = !!opt.log;

  const myBirth      = normalizeYear(me?.birthyear);
  const { from: myFrom, to: myTo } = getSearchYearRangeOf(me);

  return (Array.isArray(users) ? users : []).filter(other => {
    const otherBirth = Number(other?.birthyear);
    if (!Number.isFinite(otherBirth)) {
      if (log) console.log(`[필터] ❌ ${other?.nickname ?? '-'} → 출생년도 무효:`, other?.birthyear);
      return false;
    }

    // 1) 내 범위(규칙 1~4)에 상대가 들어와야 함
    const passMyRange = matchMyRangeToOtherBirth(otherBirth, myFrom, myTo);
    if (!passMyRange) {
      if (log) console.log(`[필터] ❌ 범위불일치(내검색) → ${other?.nickname} (${otherBirth}) / my:[${myFrom ?? '전체'}~${myTo ?? '전체'}]`);
      return false;
    }

    // 2) 상대의 검색 범위에도 내가 들어와야 함(상호 노출)
    const { from: otherFrom, to: otherTo } = getSearchYearRangeOf(other);
    const passTheirRange = matchReciprocal(myBirth, otherFrom, otherTo);
    if (!passTheirRange) {
      if (log) console.log(`[필터] ❌ 범위불일치(상대검색) → ${other?.nickname} wanted [${otherFrom ?? '전체'}~${otherTo ?? '전체'}], me:${myBirth ?? '미입력'}`);
      return false;
    }

    if (log) console.log(`[필터] ✅ 통과 → ${other?.nickname} (other:${otherBirth}, my:${myBirth})`);
    return true;
  });
}
