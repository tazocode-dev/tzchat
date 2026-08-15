/**
 * 멤버십 기본 설정 (임시 구매 페이지/정식 인앱결제 공통 사용)
 * - 등급 코드/표시명
 * - 가격(₩, VAT 포함 가정)
 * - 성별별 혜택 문구 맵핑
 * - 베타 종료 시각(Asia/Seoul 기준 2026-12-31 23:59)
 * - 헬퍼: 성별별 플랜 조회, 베타 종료 여부
 * - planCode: LVBASIC / LVLIGHT / LVPREMIUM (옵션: LVBETA)
 */

const LEVEL = {
  BETA: '베타회원',
  BASIC: '일반회원',
  LIGHT: '라이트회원',
  PREMIUM: '프리미엄회원',
};

// 내부 식별 코드 (planCode)
const PLAN_CODE = {
  BETA: 'LVBETA',
  BASIC: 'LVBASIC',
  LIGHT: 'LVLIGHT',
  PREMIUM: 'LVPREMIUM',
};

// (선택) 코드→표시명 역매핑이 필요할 때 사용
const PLAN_NAME_BY_CODE = {
  [PLAN_CODE.BETA]: LEVEL.BETA,
  [PLAN_CODE.BASIC]: LEVEL.BASIC,
  [PLAN_CODE.LIGHT]: LEVEL.LIGHT,
  [PLAN_CODE.PREMIUM]: LEVEL.PREMIUM,
};

// 가격(원) — 인앱결제 이전 임시 표기/모의결제에만 사용
const PRICE_KRW = {
  [LEVEL.BASIC]: 0,
  [LEVEL.LIGHT]: 9900,
  [LEVEL.PREMIUM]: 19900,
};

// 베타 종료 시각: 2026-12-31 23:59 Asia/Seoul
// 문자열(표시/로그)과 타임스탬프 비교용 Date 둘 다 제공
const BETA_END_AT_KST_STR = '2026-12-31T23:59:00+09:00';
const BETA_END_AT = new Date('2026-12-31T14:59:00Z'); // KST→UTC 변환(= +09:00)

const GENDER = {
  MALE: 'male',
  FEMALE: 'female',
};

// 성별별 혜택 문구(구매 페이지 전용 임시 문서 출력)
// ✅ Key를 planCode(LV...)로 통일해 혼동 방지
const BENEFIT_TEXT = {
  [GENDER.MALE]: {
    [PLAN_CODE.BASIC]: '혜택 01',
    [PLAN_CODE.LIGHT]: '혜택 02',
    [PLAN_CODE.PREMIUM]: '혜택 03',
  },
  [GENDER.FEMALE]: {
    [PLAN_CODE.BASIC]: '혜택 11',
    [PLAN_CODE.LIGHT]: '혜택 12',
    [PLAN_CODE.PREMIUM]: '혜택 03',
  },
};

/**
 * 성별별 플랜 카드 데이터 반환
 * @param {'male'|'female'} gender
 * @returns {Array<{code:string,name:string,price:number,benefitKey:string,benefitText:string,order:number}>}
 */
function getPlansByGender(gender) {
  const g = gender === GENDER.FEMALE ? GENDER.FEMALE : GENDER.MALE;
  const list = [
    {
      code: PLAN_CODE.BASIC, // LVBASIC
      name: LEVEL.BASIC,
      price: PRICE_KRW[LEVEL.BASIC],
      benefitKey: `${g}:${PLAN_CODE.BASIC}`,
      benefitText: BENEFIT_TEXT[g][PLAN_CODE.BASIC],
      order: 1,
    },
    {
      code: PLAN_CODE.LIGHT, // LVLIGHT
      name: LEVEL.LIGHT,
      price: PRICE_KRW[LEVEL.LIGHT],
      benefitKey: `${g}:${PLAN_CODE.LIGHT}`,
      benefitText: BENEFIT_TEXT[g][PLAN_CODE.LIGHT],
      order: 2,
    },
    {
      code: PLAN_CODE.PREMIUM, // LVPREMIUM
      name: LEVEL.PREMIUM,
      price: PRICE_KRW[LEVEL.PREMIUM],
      benefitKey: `${g}:${PLAN_CODE.PREMIUM}`,
      benefitText: BENEFIT_TEXT[g][PLAN_CODE.PREMIUM],
      order: 3,
    },
  ];
  // order 기준 정렬(명시적)
  return list.sort((a, b) => a.order - b.order);
}

/**
 * 베타 종료 여부
 * - 기본 서버 now로 판단(테스트 시 인자 주입 가능)
 * @param {Date} [now=new Date()]
 */
function isBetaEnded(now = new Date()) {
  return now.getTime() >= BETA_END_AT.getTime();
}

/**
 * 현재 기본 등급(베타 종료 전/후에 따라 기본값 달라질 수 있음)
 * - 베타 중: 베타회원
 * - 베타 종료 후: 일반회원
 */
function getCurrentDefaultLevel(now = new Date()) {
  return isBetaEnded(now) ? LEVEL.BASIC : LEVEL.BETA;
}

module.exports = {
  LEVEL,
  PLAN_CODE,
  PLAN_NAME_BY_CODE,
  PRICE_KRW,
  GENDER,
  BENEFIT_TEXT,
  getPlansByGender,
  isBetaEnded,
  getCurrentDefaultLevel,
  // 베타 종료 시각 표시/비교용
  BETA_END_AT,
  BETA_END_AT_KST_STR,
};
