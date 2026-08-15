// 등급/성별별 편집 규칙 & 헬퍼 (프론트 전용)
// -----------------------------------------------------------------------------
// 목적
//  - 화면에서 "이 필드는 현재 사용자 등급/성별에서 편집 가능한가?" 를 일관되게 판정
//  - 등급/성별별로 다른 제한(예: 일반/라이트는 '이성친구'만 허용)을 명확히 표현
//  - 운영 중 정책 변경 시 이 파일만 수정하면 전체 화면 로직이 자동 반영
//
// 표기 규칙
//  - 등급(한글 표시명): '일반회원' | '라이트회원' | '프리미엄회원' | '베타회원'(옵션)
//  - 성별 값: 'male' | 'female'
//  - RULES의 값 의미:
//      true  : 편집 가능
//      false : 편집 불가
//      { restrict: 'hetero-only' } : 특정 제약 (본 예시: '이성친구' 계열만 허용)
//  - 요청하신 대로 성별 공통 키('*')를 쓰지 않고, 등급/성별을 모두 "풀어서" 선언합니다.
//
// 사용 예
//  - canEditField('preference', user.user_level, user.gender)
//  - isRestricted('preference', user.user_level, user.gender, 'hetero-only')
// -----------------------------------------------------------------------------

// 등급 상수(표시명)
export const LEVELS = {
  BASIC: '일반회원',
  LIGHT: '라이트회원',
  PREMIUM: '프리미엄회원',
  BETA: '베타회원', // 선택 사용
};

// 성별 상수
export const GENDER = {
  MALE: 'male',
  FEMALE: 'female',
};

// -----------------------------------------------------------------------------
// 등급/성별별 규칙 테이블 (모든 조합을 명시적으로 풀어 작성)
// -----------------------------------------------------------------------------
export const RULES = {
  // ───────── 내 프로필 영역 ─────────

  // --------------- 모두 가능 ------------------------------------------
  // ─ 가입 시 고정(편집 불가) ─
  birthyear: {
    [LEVELS.BASIC]:   { [GENDER.MALE]: false, [GENDER.FEMALE]: false },
    [LEVELS.LIGHT]:   { [GENDER.MALE]: false, [GENDER.FEMALE]: false },
    [LEVELS.PREMIUM]: { [GENDER.MALE]: false, [GENDER.FEMALE]: false },
    [LEVELS.BETA]:    { [GENDER.MALE]: false, [GENDER.FEMALE]: false },
  },
  gender: {
    [LEVELS.BASIC]:   { [GENDER.MALE]: false, [GENDER.FEMALE]: false },
    [LEVELS.LIGHT]:   { [GENDER.MALE]: false, [GENDER.FEMALE]: false },
    [LEVELS.PREMIUM]: { [GENDER.MALE]: false, [GENDER.FEMALE]: false },
    [LEVELS.BETA]:    { [GENDER.MALE]: false, [GENDER.FEMALE]: false },
  },
  phone: {
    [LEVELS.BASIC]:   { [GENDER.MALE]: false, [GENDER.FEMALE]: false },
    [LEVELS.LIGHT]:   { [GENDER.MALE]: false, [GENDER.FEMALE]: false },
    [LEVELS.PREMIUM]: { [GENDER.MALE]: false, [GENDER.FEMALE]: false },
    [LEVELS.BETA]:    { [GENDER.MALE]: false, [GENDER.FEMALE]: false },
  },

  // 닉네임: 전 등급/성별 편집 가능
  nickname: {
    [LEVELS.BASIC]:   { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
    [LEVELS.LIGHT]:   { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
    [LEVELS.PREMIUM]: { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
    [LEVELS.BETA]:    { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
  },

  // 지역: 전 등급/성별 편집 가능
  region: {
    [LEVELS.BASIC]:   { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
    [LEVELS.LIGHT]:   { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
    [LEVELS.PREMIUM]: { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
    [LEVELS.BETA]:    { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
  },

  // 결혼: 전 등급/성별 편집 가능
  marriage: {
    [LEVELS.BASIC]:   { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
    [LEVELS.LIGHT]:   { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
    [LEVELS.PREMIUM]: { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
    [LEVELS.BETA]:    { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
  },

  // 소개: 전 등급/성별 편집 가능
  selfintro: {
    [LEVELS.BASIC]:   { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
    [LEVELS.LIGHT]:   { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
    [LEVELS.PREMIUM]: { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
    [LEVELS.BETA]:    { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
  },

  // ───────── 검색(친구 찾기/프리미엄) ─────────
  // 검색나이/검색지역: 전 등급/성별 편집 가능
  search_year: {
    [LEVELS.BASIC]:   { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
    [LEVELS.LIGHT]:   { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
    [LEVELS.PREMIUM]: { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
    [LEVELS.BETA]:    { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
  },
  search_regions: {
    [LEVELS.BASIC]:   { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
    [LEVELS.LIGHT]:   { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
    [LEVELS.PREMIUM]: { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
    [LEVELS.BETA]:    { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
  },

    // ───────── 기타 ─────────
    // 친구 신청/알림 제한/연락처 연결 끊기: 전 등급/성별 편집 가능
    //친구 신청
    allowFriendRequests: {
        [LEVELS.BASIC]:   { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
        [LEVELS.LIGHT]:   { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
        [LEVELS.PREMIUM]: { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
        [LEVELS.BETA]:    { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
    },
    //알림
    allowNotifications: {
        [LEVELS.BASIC]:   { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
        [LEVELS.LIGHT]:   { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
        [LEVELS.PREMIUM]: { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
        [LEVELS.BETA]:    { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
    },
    //연결 끊기
    disconnectLocalContacts: {
        [LEVELS.BASIC]:   { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
        [LEVELS.LIGHT]:   { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
        [LEVELS.PREMIUM]: { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
        [LEVELS.BETA]:    { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
    },
   
    // --------------- 모두 가능 ------------------------------------------
     
    // --------------- 부분 가능 ------------------------------------------

  // 특징: 일반/라이트는 '이성친구' 계열만 허용, 프리미엄은 자유
  //  - restrict: 'hetero-only' 신호를 화면에서 해석해 선택지를 제한/가이드
  preference: {
    [LEVELS.BASIC]:   { [GENDER.MALE]: { restrict: 'hetero-only' }, [GENDER.FEMALE]: { restrict: 'hetero-only' } },
    [LEVELS.LIGHT]:   { [GENDER.MALE]: { restrict: 'hetero-only' }, [GENDER.FEMALE]: { restrict: 'hetero-only' } },
    [LEVELS.PREMIUM]: { [GENDER.MALE]: true,                        [GENDER.FEMALE]: true },
    [LEVELS.BETA]:    { [GENDER.MALE]: true,                        [GENDER.FEMALE]: true }, // 필요시 조정
  },

  // 검색특징/검색결혼:
  //  - 일반/라이트: 성별과 무관하게 고정(false) → "전체"만 허용(화면에서 안내/대체)
  //  - 프리미엄: 편집 가능(true)
  search_preference: {
    [LEVELS.BASIC]:   { [GENDER.MALE]: false, [GENDER.FEMALE]: false },
    [LEVELS.LIGHT]:   { [GENDER.MALE]: true, [GENDER.FEMALE]: true },
    [LEVELS.PREMIUM]: { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
    [LEVELS.BETA]:    { [GENDER.MALE]: true, [GENDER.FEMALE]: true },
  },
  search_marriage: {
    [LEVELS.BASIC]:   { [GENDER.MALE]: false, [GENDER.FEMALE]: false },
    [LEVELS.LIGHT]:   { [GENDER.MALE]: true, [GENDER.FEMALE]: true },
    [LEVELS.PREMIUM]: { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
    [LEVELS.BETA]:    { [GENDER.MALE]: true, [GENDER.FEMALE]: true },
  },

  // 프리미엄 전용 토글 2종
  // 사진 보유한 유저만
  onlyWithPhoto: {
    [LEVELS.BASIC]:   { [GENDER.MALE]: false, [GENDER.FEMALE]: false },
    [LEVELS.LIGHT]:   { [GENDER.MALE]: false, [GENDER.FEMALE]: true },
    [LEVELS.PREMIUM]: { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
    [LEVELS.BETA]:    { [GENDER.MALE]: true, [GENDER.FEMALE]: true },
  },
  // 프리미엄만
  matchPremiumOnly: {
    [LEVELS.BASIC]:   { [GENDER.MALE]: false, [GENDER.FEMALE]: false },
    [LEVELS.LIGHT]:   { [GENDER.MALE]: false, [GENDER.FEMALE]: true },
    [LEVELS.PREMIUM]: { [GENDER.MALE]: true,  [GENDER.FEMALE]: true },
    [LEVELS.BETA]:    { [GENDER.MALE]: true, [GENDER.FEMALE]: true },
  },

  // --------------- 부분 가능 ------------------------------------------

};
// -----------------------------------------------------------------------------
// 헬퍼 함수
// -----------------------------------------------------------------------------

/**
 * 등급 정규화
 * - null/undefined/빈값 → '일반회원'로 통일
 * - 인자로 임의 문자열이 들어온 경우(오타 등) 대비하여 정의되지 않은 값은 '일반회원'
 */
export function normalizeLevel(level) {
  const v = String(level || '').trim();
  switch (v) {
    case LEVELS.BASIC:
    case LEVELS.LIGHT:
    case LEVELS.PREMIUM:
    case LEVELS.BETA:
      return v;
    default:
      return LEVELS.BASIC;
  }
}

/**
 * 성별 정규화
 * - 'female'이 아니면 모두 'male' 처리(백엔드/클라이언트 혼용 오타 방지)
 */
export function normalizeGender(gender) {
  return gender === GENDER.FEMALE ? GENDER.FEMALE : GENDER.MALE;
}

/** 프리미엄 등급 여부 */
export function isPremium(level) {
  return normalizeLevel(level) === LEVELS.PREMIUM;
}

/**
 * 내부 룰 조회
 * @param {string} field   - RULES의 필드 키 (예: 'preference')
 * @param {string} level   - 사용자 등급 표시명
 * @param {string} gender  - 'male' | 'female'
 * @returns {true|false|object} - 규칙 값 (true/false 또는 {restrict:...})
 *
 * 동작:
 *  - 명시된 조합이 존재하면 그 값을 반환
 *  - 누락된 조합은 기본 허용(true)로 처리하여 화면이 최소 기능을 제공하도록 함
 *  - 운영 중 정책 확장 시 RULES만 손보면 됨
 */
function pickRuleValue(field, level, gender) {
  const lv = normalizeLevel(level);
  const g  = normalizeGender(gender);

  const tableForField = RULES[field];
  if (!tableForField) return true; // 해당 필드에 규칙 정의가 없으면 허용

  const byLevel = tableForField[lv];
  if (!byLevel) return true;       // 등급 레벨이 비어있으면 허용

  if (Object.prototype.hasOwnProperty.call(byLevel, g)) {
    return byLevel[g];
  }

  // 성별 키가 누락된 경우: 안전하게 허용(true)
  return true;
}

/** 단일 필드 규칙 조회 */
export function ruleFor(field, level, gender) {
  return pickRuleValue(field, level, gender);
}

/** 편집 가능 여부 (false만 편집 불가로 간주, true/객체는 편집 가능) */
export function canEditField(field, level, gender) {
  const v = ruleFor(field, level, gender);
  return v !== false;
}

/**
 * 특정 제약 여부 확인
 * @example isRestricted('preference', '일반회원', 'male', 'hetero-only') → true
 */
export function isRestricted(field, level, gender, kind) {
  const v = ruleFor(field, level, gender);
  return typeof v === 'object' && v?.restrict === kind;
}
