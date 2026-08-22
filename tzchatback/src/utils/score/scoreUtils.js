// lib/score/scoreUtils.js
// tzchat 프로젝트 - 점수 산식 유틸
// - 프론트 distributedSelection.js의 '반감기 12h'와 정합되는 recency 함수 제공
// - 활동치 정규화 + 가중합 + 노출 점수 산출

const HALF_LIFE_HOURS = 12;

function clamp01(v) {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

// 반감기 기반 가중 (최근일수록 1에 가깝게)
function recencyWeightFrom(dateOrTs, nowTs = Date.now()) {
  const ts = (dateOrTs instanceof Date) ? dateOrTs.getTime() : Number(dateOrTs);
  const dtHours = Math.max(0, (nowTs - ts) / (1000 * 60 * 60));
  const k = Math.pow(0.5, dtHours / HALF_LIFE_HOURS);
  return clamp01(k);
}

// 간단 정규화: count → 0~1 (튜닝 포인트: cap)
function normalizeCount(count, cap) {
  if (cap <= 0) return 0;
  return clamp01(count / cap);
}

// 활동 스코어(가중합)
// caps는 일일 기대 상한(대략값). 서비스에 맞춰 조정하세요.
function calcActivityScore(agg, weights, caps = {}) {
  const {
    messagesSent = 0,
    friendReqSent = 0,
    friendReqRecv = 0,
    friendReqAccepted = 0,
    blocksDone = 0,
  } = agg || {};

  const w = { // 기본 가중(필드가 없으면 0)
    messagesSent: 0.25,
    friendReqSent: 0.20,
    friendReqRecv: 0.20,
    friendReqAccepted: 0.30,
    blocksDone: -0.20,
    ...(weights || {}),
  };

  const c = {
    messagesSent: normalizeCount(messagesSent, caps.messagesSent ?? 40),
    friendReqSent: normalizeCount(friendReqSent, caps.friendReqSent ?? 20),
    friendReqRecv: normalizeCount(friendReqRecv, caps.friendReqRecv ?? 20),
    friendReqAccepted: normalizeCount(friendReqAccepted, caps.friendReqAccepted ?? 10),
    blocksDone: normalizeCount(blocksDone, caps.blocksDone ?? 10),
  };

  // blocksDone은 벌점 → 음수 가중
  const raw =
    c.messagesSent * w.messagesSent +
    c.friendReqSent * w.friendReqSent +
    c.friendReqRecv * w.friendReqRecv +
    c.friendReqAccepted * w.friendReqAccepted +
    c.blocksDone * w.blocksDone;

  return clamp01(raw);
}

// 최종 노출 점수: activity ⊗ recency
function composeExposureScore(activityScore, recencyScore) {
  return clamp01(activityScore * recencyScore);
}

module.exports = {
  HALF_LIFE_HOURS,
  clamp01,
  recencyWeightFrom,
  normalizeCount,
  calcActivityScore,
  composeExposureScore,
};
