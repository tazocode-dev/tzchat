// src/services/membership/membershipService.js
// ────────────────────────────────────────────────────────────
// 멤버십 플랜 조회 도메인 서비스 (지침 §1). routes/membership/membershipRouter.js에서 분리.
// ────────────────────────────────────────────────────────────

const {
  LEVEL,
  PRICE_KRW,
  GENDER,
  getPlansByGender,
  isBetaEnded,
  getCurrentDefaultLevel,
  BETA_END_AT_KST_STR,
} = require('@/config/membership');

function krw(n) {
  // 9,900 → "₩9,900"; 0 → "무료"
  if (typeof n !== 'number' || isNaN(n)) return '';
  if (n === 0) return '무료';
  return `₩${n.toLocaleString('ko-KR')}`;
}

function normalizeGender(input, fallback = GENDER.MALE) {
  const v = String(input || '').trim().toLowerCase();
  if (v === 'female' || v === 'f' || v === '여' || v === '여자') return GENDER.FEMALE;
  if (v === 'male' || v === 'm' || v === '남' || v === '남자') return GENDER.MALE;
  // req.user?.gender 가 '여성'/'남성' 같은 케이스도 처리
  if (v.startsWith('여')) return GENDER.FEMALE;
  if (v.startsWith('남')) return GENDER.MALE;
  return fallback;
}

// GET /api/membership/plans
function getPlans(genderInput) {
  const gender = normalizeGender(genderInput);

  const plans = getPlansByGender(gender).map((p) => ({
    code: p.code,                  // 'BASIC' | 'LIGHT' | 'PREMIUM'
    name: p.name,                  // '일반회원' | '라이트회원' | '프리미엄회원'
    price: p.price,                // number (원)
    priceDisplay: krw(p.price),    // "무료" | "₩9,900" | "₩19,900"
    benefitText: p.benefitText,    // 성별에 따른 임시 혜택 문구
    order: p.order,
  }));

  const betaEnded = isBetaEnded();
  const defaultLevel = getCurrentDefaultLevel();

  return {
    beta: {
      ended: betaEnded,
      endAtKst: BETA_END_AT_KST_STR, // "2026-12-31T23:59:00+09:00"
    },
    defaultLevel, // '베타회원' | '일반회원'
    currency: 'KRW',
    levels: {
      BETA: LEVEL.BETA,
      BASIC: LEVEL.BASIC,
      LIGHT: LEVEL.LIGHT,
      PREMIUM: LEVEL.PREMIUM,
    },
    priceKRW: {
      [LEVEL.BASIC]: PRICE_KRW[LEVEL.BASIC],
      [LEVEL.LIGHT]: PRICE_KRW[LEVEL.LIGHT],
      [LEVEL.PREMIUM]: PRICE_KRW[LEVEL.PREMIUM],
    },
    gender, // 'male' | 'female'
    plans,  // 위에서 구성한 카드 리스트
  };
}

// GET /api/membership/health
function getHealth() {
  return { service: 'membership', ts: Date.now() };
}

module.exports = { getPlans, getHealth };
