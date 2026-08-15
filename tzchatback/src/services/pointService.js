// services/pointService.js
// ────────────────────────────────────────────────────────────
// Dating 앱 포인트 서비스 (하트·스타·루비)
// - 규칙은 config/points.js 를 단일 소스로 사용
// - 지급 기준: 매일 11:00 (KST) 하트 자동 지급
// - 소모 우선순위:
//    * 기본(default): 하트 → 스타 → 루비
//    * 스타 전용(starOnly): 스타 → 루비 (하트 대체 불가)
// - 단가: 일반 2, 프리미엄 4 (config.COST)
// - 누적 한도: 라이트 120, 프리미엄 200 (하트 cap)
// - DB 필드(권장): heart, star, ruby, user_level, lastDailyGrantAt
// - [신규] 모든 변동 시 PointLog 원장 기록 (옵션으로 trace/meta/session 전달 가능)
// ────────────────────────────────────────────────────────────

const {
  POINT,
  COST,
  LEVEL_RULES,
  getLevelRules,
  getDailyHeartGrant,
  getHeartCap,
  isHeartAccumulable,
  getNextGrantTimeKST,
  getTenderOrder,
} = require('@/config/points');

const PointLog = require('@/models/User/PointLog');

// ────────────────────────────────────────────────────────────
// 에러
// ────────────────────────────────────────────────────────────
class PointError extends Error {
  constructor(message, code, extra = {}) {
    super(message);
    this.name = 'PointError';
    this.code = code || 'POINTS_ERROR';
    Object.assign(this, extra);
  }
}

// ────────────────────────────────────────────────────────────
// 내부 유틸
// ────────────────────────────────────────────────────────────
function clampNonNegative(n) {
  return Math.max(0, Number.isFinite(n) ? n : 0);
}
function safeAdd(a, b) {
  return clampNonNegative((a || 0) + (b || 0));
}
function safeSub(a, b) {
  return clampNonNegative((a || 0) - (b || 0));
}

/** KST 11시 공제선(직전 지급 경계) 계산 */
function getMostRecentGrantBoundaryUTC(now = new Date()) {
  const utcMs = now.getTime();
  const KST_OFFSET = 9 * 60 * 60 * 1000; // +09:00
  const nowKST = new Date(utcMs + KST_OFFSET);

  const y = nowKST.getUTCFullYear();
  const m = nowKST.getUTCMonth();
  const d = nowKST.getUTCDate();

  // 오늘 11:00(KST)의 UTC
  const todaysBoundaryUTC = Date.UTC(y, m, d, 2, 0, 0, 0); // 11:00 KST = 02:00 UTC
  if (utcMs >= todaysBoundaryUTC) return new Date(todaysBoundaryUTC);

  // 아직 전이면 어제 11:00(KST)
  const yesterdaysBoundaryUTC = Date.UTC(y, m, d - 1, 2, 0, 0, 0);
  return new Date(yesterdaysBoundaryUTC);
}

/** 지급 필요 여부 */
function isDailyGrantDue(user, now = new Date()) {
  const last = user?.lastDailyGrantAt instanceof Date ? user.lastDailyGrantAt : null;
  const boundary = getMostRecentGrantBoundaryUTC(now);

  // ✅ 가입 12시간 유예
  const createdAt = user?.createdAt instanceof Date ? user.createdAt : null;
  if (!createdAt) return false; // 안전 가드
  const TWELVE_HOURS = 12 * 60 * 60 * 1000;
  const gracePassed = now.getTime() >= (createdAt.getTime() + TWELVE_HOURS);
  if (!gracePassed) return false;

  // ✅ 유예가 지난 뒤부터 11시(KST) 경계 기준 지급
  if (!last) {
    // 첫 지급: 유예가 지났고, 현재가 11시 경계 이후일 때만
    return now.getTime() >= boundary.getTime();
  }
  return last.getTime() < boundary.getTime();
}

/** PointLog 기록 헬퍼 */
async function logChange({
  user,
  currency,
  delta,
  type,
  balanceBefore,
  balanceAfter,
  reason = '',
  meta = {},
  trace = {},
  session = undefined,
}) {
  if (!user?._id) return; // 안전 가드
  // delta 0은 기록 생략(무의미)
  if (!Number.isFinite(delta) || delta === 0) return;

  await PointLog.recordChange(
    {
      userId: user._id,
      currency,
      delta,
      type,
      balanceBefore,
      balanceAfter,
      reason,
      meta,
      trace,
    },
    session
  );
}

// ────────────────────────────────────────────────────────────
// 지급
// ────────────────────────────────────────────────────────────
/** 하트 일일지급 처리 */
async function grantDailyIfNeeded(
  user,
  { save = true, now = new Date(), log = true, session, trace, meta } = {}
) {
  if (!user) throw new PointError('유저가 없습니다.', 'NO_USER');

  if (!isDailyGrantDue(user, now)) {
    const nextGrantAt = getNextGrantTimeKST(now);
    return { granted: 0, heart: clampNonNegative(user.heart), capped: false, nextGrantAt };
  }

  const level = user.user_level || '일반회원';
  const daily = getDailyHeartGrant(level);
  const cap = getHeartCap(level);
  const accumulable = isHeartAccumulable(level);

  const before = clampNonNegative(user.heart);
  let newHeart = before;
  let granted = 0;
  let capped = false;

  if (!accumulable || cap === 0) {
    // 누적 불가: 매일치로 덮어쓰기
    newHeart = clampNonNegative(daily);
    granted = daily; // 의미상 오늘치
  } else {
    const after = safeAdd(newHeart, daily);
    if (after > cap) {
      newHeart = cap;
      capped = true;
      granted = Math.max(0, cap - before);
    } else {
      newHeart = after;
      granted = daily;
    }
  }

  user.heart = newHeart;
  user.lastDailyGrantAt = getMostRecentGrantBoundaryUTC(now);

  if (save && typeof user.save === 'function') {
    await user.save({ session });
  }

  // 로그: delta = new - before (덮어쓰기인 경우 감소가 될 수도 있음)
  if (log) {
    await logChange({
      user,
      currency: 'heart',
      delta: newHeart - before,
      type: 'daily_grant',
      balanceBefore: before,
      balanceAfter: newHeart,
      reason: 'Daily heart grant',
      meta: { daily, level, capped, ...(meta || {}) },
      trace,
      session,
    });
  }

  const nextGrantAt = getNextGrantTimeKST(now);
  return { granted, heart: newHeart, capped, nextGrantAt };
}

// ────────────────────────────────────────────────────────────
// 차감
// ────────────────────────────────────────────────────────────
/** 사용 가능 여부 */
function canAfford(user, cost, { policy = 'default' } = {}) {
  const order = getTenderOrder(policy);
  const balance = order.reduce((sum, p) => {
    if (p === POINT.HEART) return sum + clampNonNegative(user.heart);
    if (p === POINT.STAR) return sum + clampNonNegative(user.star);
    if (p === POINT.RUBY) return sum + clampNonNegative(user.ruby);
    return sum;
  }, 0);
  return balance >= cost;
}

/** 차감(소모) 처리 */
async function consumeForAction(
  user,
  cost,
  {
    policy = 'default',
    save = true,
    log = true,
    session,
    type = 'friend_request_spend', // 기본 용도: 친구신청
    reason = '',
    meta,
    trace,
  } = {}
) {
  if (!user) throw new PointError('유저가 없습니다.', 'NO_USER');
  const useCost = clampNonNegative(cost);

  if (!canAfford(user, useCost, { policy })) {
    throw new PointError('포인트가 부족합니다.', 'POINTS_NOT_ENOUGH', { required: useCost, policy });
  }

  const order = getTenderOrder(policy);
  const used = { heart: 0, star: 0, ruby: 0 };

  const before = {
    heart: clampNonNegative(user.heart),
    star: clampNonNegative(user.star),
    ruby: clampNonNegative(user.ruby),
  };

  for (const p of order) {
    const remaining = useCost - (used.heart + used.star + used.ruby);
    if (remaining <= 0) break;

    if (p === POINT.HEART) {
      const take = Math.min(before.heart - used.heart, remaining);
      if (take > 0) {
        user.heart = safeSub(user.heart, take);
        used.heart += take;
      }
    } else if (p === POINT.STAR) {
      const take = Math.min(before.star - used.star, remaining);
      if (take > 0) {
        user.star = safeSub(user.star, take);
        used.star += take;
      }
    } else if (p === POINT.RUBY) {
      const take = Math.min(before.ruby - used.ruby, remaining);
      if (take > 0) {
        user.ruby = safeSub(user.ruby, take);
        used.ruby += take;
      }
    }
  }

  if (save && typeof user.save === 'function') {
    await user.save({ session });
  }

  const after = {
    heart: clampNonNegative(user.heart),
    star: clampNonNegative(user.star),
    ruby: clampNonNegative(user.ruby),
  };

  // 로그(통화별로 개별 라인 기록)
  if (log) {
    const baseMeta = { policy, cost: useCost, ...(meta || {}) };
    if (used.heart > 0) {
      await logChange({
        user,
        currency: 'heart',
        delta: -used.heart,
        type,
        balanceBefore: before.heart,
        balanceAfter: after.heart,
        reason,
        meta: baseMeta,
        trace,
        session,
      });
    }
    if (used.star > 0) {
      await logChange({
        user,
        currency: 'star',
        delta: -used.star,
        type,
        balanceBefore: before.star,
        balanceAfter: after.star,
        reason,
        meta: baseMeta,
        trace,
        session,
      });
    }
    if (used.ruby > 0) {
      await logChange({
        user,
        currency: 'ruby',
        delta: -used.ruby,
        type,
        balanceBefore: before.ruby,
        balanceAfter: after.ruby,
        reason,
        meta: baseMeta,
        trace,
        session,
      });
    }
  }

  return {
    used,
    remain: after,
  };
}

/** 편의 함수: 일반/프리미엄 친구신청 차감 */
async function consumeForNormalRequest(user, opts = {}) {
  return consumeForAction(user, COST.NORMAL_REQUEST, { policy: 'default', ...opts });
}
async function consumeForPremiumRequest(user, opts = {}) {
  return consumeForAction(user, COST.PREMIUM_REQUEST, { policy: 'default', ...opts });
}

/** 스타 전용 액션(하트 대체 불가) */
async function consumeStarOnly(user, amount, opts = {}) {
  return consumeForAction(user, amount, { policy: 'starOnly', ...opts });
}

// ────────────────────────────────────────────────────────────
// 지급(수동/보상/구매 등)
// ────────────────────────────────────────────────────────────
async function grantHeart(
  user,
  amount,
  {
    respectCap = true,
    save = true,
    log = true,
    session,
    type = 'admin_grant',
    reason = '',
    meta,
    trace,
  } = {}
) {
  const add = clampNonNegative(amount);
  const level = user.user_level || '일반회원';
  const cap = getHeartCap(level);
  const accumulable = isHeartAccumulable(level);

  const before = clampNonNegative(user.heart);
  let newHeart;

  if (!accumulable || cap === 0) {
    // 누적 불가 등급: 운영정책에 따라 덮어쓰기 가능. 기본은 더하기 유지.
    newHeart = safeAdd(before, add);
  } else if (respectCap) {
    newHeart = Math.min(safeAdd(before, add), cap);
  } else {
    newHeart = safeAdd(before, add);
  }

  user.heart = newHeart;
  if (save && typeof user.save === 'function') await user.save({ session });

  if (log) {
    await logChange({
      user,
      currency: 'heart',
      delta: newHeart - before,
      type,
      balanceBefore: before,
      balanceAfter: newHeart,
      reason,
      meta: { respectCap, cap, level, ...(meta || {}) },
      trace,
      session,
    });
  }

  return { heart: user.heart };
}

async function grantStar(
  user,
  amount,
  {
    save = true,
    log = true,
    session,
    type = 'admin_grant',
    reason = '',
    meta,
    trace,
  } = {}
) {
  const before = clampNonNegative(user.star);
  user.star = safeAdd(user.star, amount);
  if (save && typeof user.save === 'function') await user.save({ session });

  if (log) {
    await logChange({
      user,
      currency: 'star',
      delta: user.star - before,
      type,
      balanceBefore: before,
      balanceAfter: user.star,
      reason,
      meta,
      trace,
      session,
    });
  }
  return { star: user.star };
}

async function grantRuby(
  user,
  amount,
  {
    save = true,
    log = true,
    session,
    type = 'purchase', // 기본적으로 구매성 지급
    reason = '',
    meta,
    trace,
  } = {}
) {
  const before = clampNonNegative(user.ruby);
  user.ruby = safeAdd(user.ruby, amount);
  if (save && typeof user.save === 'function') await user.save({ session });

  if (log) {
    await logChange({
      user,
      currency: 'ruby',
      delta: user.ruby - before,
      type,
      balanceBefore: before,
      balanceAfter: user.ruby,
      reason,
      meta,
      trace,
      session,
    });
  }
  return { ruby: user.ruby };
}

// ────────────────────────────────────────────────────────────
// 편의
// ────────────────────────────────────────────────────────────
function getNextGrantSeconds(now = new Date()) {
  const next = getNextGrantTimeKST(now);
  const diffMs = next.getTime() - now.getTime();
  return Math.max(0, Math.floor(diffMs / 1000));
}

function getWalletSummary(user, now = new Date()) {
  return {
    heart: clampNonNegative(user?.heart),
    star: clampNonNegative(user?.star),
    ruby: clampNonNegative(user?.ruby),
    user_level: user?.user_level || '일반회원',
    nextGrantAt: getNextGrantTimeKST(now),
    nextGrantSeconds: getNextGrantSeconds(now),
  };
}

module.exports = {
  // 에러
  PointError,

  // 지급 관련
  isDailyGrantDue,
  grantDailyIfNeeded,
  grantHeart,
  grantStar,
  grantRuby,

  // 차감 관련
  canAfford,
  consumeForAction,
  consumeForNormalRequest,
  consumeForPremiumRequest,
  consumeStarOnly,

  // 편의
  getMostRecentGrantBoundaryUTC,
  getNextGrantSeconds,
  getWalletSummary,
};
