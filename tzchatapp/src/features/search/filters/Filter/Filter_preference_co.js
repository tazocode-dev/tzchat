// frontend/04210_Page2_target/Filter_preference_co.js
// ------------------------------------------------------------
// 검색특징(Preference) 필터 (개정)
// 기본 동작: "내 규칙"만 적용(단방향).  ← reciprocal=false (기본값)
//   - 내가 '이성친구 - 전체'  → 상대.preference 가 '이성친구'로 시작 && 성별 나와 다름
//   - 내가 '이성친구 - 내 성향' → 상대.preference === 내 preference && 성별 나와 다름
//   - 내가 '동성친구 - 전체'  → 상대.preference 가 '동성친구'로 시작 && 성별 나와 같음
//   - 내가 '동성친구 - 내 성향' → 상대.preference === 내 preference && 성별 나와 같음
//   - 그 외: 기존 정책 유지( search_preference 일치 )
//
// 옵션 reciprocal=true 로 주면 상호 노출(상대 규칙도 내가 통과)까지 적용.
// 문자열 변형(공백/하이픈 변형 등)과 레거시 필드까지 폭넓게 대응.
// ------------------------------------------------------------

/** 안전 문자열화 */
function str(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** 'man' | 'woman' 외 값/빈값 → '' */
function normGender(v) {
  const s = str(v).toLowerCase();
  if (s === 'man' || s === 'male') return 'man';
  if (s === 'woman' || s === 'female') return 'woman';
  return ''; // 불명
}

/** 공백/하이픈 변형 정규화: '이성친구-전체' '이성친구  -   전체' 등도 동일인식 */
function normalizeLabel(s) {
  const t = str(s)
    .replace(/\s*-\s*/g, ' - ') // 하이픈 좌우 공백 규격화
    .replace(/\s+/g, ' ')       // 다중 공백 축소
    .trim();
  return t;
}

/** 접두어 타입 추출: '이성친구' | '동성친구' | '' (문자 주변 공백/하이픈 변형 무시) */
function headType(s) {
  const t = normalizeLabel(s);
  if (/^이성친구/i.test(t)) return '이성친구';
  if (/^동성친구/i.test(t)) return '동성친구';
  return '';
}

/** 내 search_preference 를 4가지 케이스로 분류 */
function classifyMySearchPref(s) {
  const t = normalizeLabel(s);
  if (/^이성친구\s*-\s*전체$/i.test(t)) return 'FO_ALL';
  if (/^이성친구\s*-\s*내\s*성향$/i.test(t)) return 'FO_OWN';
  if (/^동성친구\s*-\s*전체$/i.test(t)) return 'SO_ALL';
  if (/^동성친구\s*-\s*내\s*성향$/i.test(t)) return 'SO_OWN';
  return 'LEGACY';
}

/** other의 "자기 성향" 값(우선순위: preference → search_preference) */
function otherOwnPref(other) {
  const a = str(other?.preference);
  const b = str(other?.search_preference);
  return a || b || '';
}

/** 내 규칙으로 상대(other)가 통과하는지 */
export function passMyPreferenceRule(me, other) {
  const mySearchPref = normalizeLabel(me?.search_preference);
  const myOwnPref    = normalizeLabel(me?.preference);
  const myGender     = normGender(me?.gender);

  const otherOwn     = normalizeLabel(otherOwnPref(other)); // 상대의 "자기 성향"
  const otherGender  = normGender(other?.gender);

  const myClass = classifyMySearchPref(mySearchPref);
  const otherHead = headType(otherOwn);

  const genderDiff = () => !!myGender && !!otherGender && myGender !== otherGender;
  const genderSame = () => !!myGender && !!otherGender && myGender === otherGender;

  // 1) 이성친구 - 전체
  if (myClass === 'FO_ALL') {
    if (!myGender || !otherGender) return false;
    return otherHead === '이성친구' && genderDiff();
  }

  // 2) 이성친구 - 내 성향
  if (myClass === 'FO_OWN') {
    if (!myGender || !otherGender) return false;
    if (!myOwnPref) return false; // 내 성향 비어 있으면 비교 불가
    return otherOwn === myOwnPref && genderDiff();
  }

  // 3) 동성친구 - 전체
  if (myClass === 'SO_ALL') {
    if (!myGender || !otherGender) return false;
    return otherHead === '동성친구' && genderSame();
  }

  // 4) 동성친구 - 내 성향
  if (myClass === 'SO_OWN') {
    if (!myGender || !otherGender) return false;
    if (!myOwnPref) return false;
    return otherOwn === myOwnPref && genderSame();
  }

  // ⓘ 그 외(이전 정책 유지): 동일한 search_preference 만 허용
  return mySearchPref !== '' && mySearchPref === normalizeLabel(other?.search_preference);
}

/** 상대의 규칙으로 "나"가 통과하는지 (상호 노출 판정용) */
export function passTheirPreferenceRule(me, other) {
  // their rule applied to me
  return passMyPreferenceRule(other, me);
}

/**
 * 필터
 * @param {Array} users - 후보 유저 목록
 * @param {Object} me   - 내 유저 객체({ gender, search_preference, preference } 포함)
 * @param {Object} [opt]
 *   - {boolean} reciprocal=false  상호 노출 여부(기본 단방향)
 *   - {boolean} log=false         로그
 * @returns {Array}
 */
export function filterByPreferenceCo(users, me, opt = {}) {
  const { reciprocal = false, log = false } = opt;
  const list = Array.isArray(users) ? users : [];

  return list.filter((other) => {
    const a = passMyPreferenceRule(me, other);
    if (!a) {
      if (log) console.log(`[특징필터] ❌ 내규칙 불일치 → ${other?.nickname ?? '-'}`);
      return false;
    }
    if (reciprocal) {
      const b = passTheirPreferenceRule(me, other);
      if (!b) {
        if (log) console.log(`[특징필터] ❌ 상대규칙 불일치 → ${other?.nickname ?? '-'}`);
        return false;
      }
    }
    if (log) console.log(`[특징필터] ✅ 통과 → ${other?.nickname ?? '-'}`);
    return true;
  });
}

/**
 * 단방향(별칭): 상호 노출 없이 "내 규칙만" 체크
 */
export function filterByPreferenceSimple(users, me, opt = {}) {
  return filterByPreferenceCo(users, me, { ...opt, reciprocal: false });
}

/*
사용 예시
import { filterByPreferenceCo, filterByPreferenceSimple } from '@/utils/Filter_preference_co'

// 기본(권장): 단방향 — 상대가 내 조건만 만족하면 노출
users = filterByPreferenceCo(users, me, { reciprocal: false, log: false })
// 혹은
users = filterByPreferenceSimple(users, me, { log: false })

// 상호 노출을 원하면:
users = filterByPreferenceCo(users, me, { reciprocal: true })
*/
