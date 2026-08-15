// config/emergency.js
// -------------------------------------------------------------

const { normalizeEmail, isSpeedMatchingTestEmail } = require('./emailAuthPolicy');
// Emergency Matching 공통 설정/유틸
// - 전 라우터/컨트롤러에서 같은 지속시간, 같은 계산 로직을 사용하도록 중앙화
// -------------------------------------------------------------

// 스피드 매칭은 매일 같은 두 시간대에 새 세션을 시작할 수 있다.
// 시간 판정은 서버의 로컬 타임존과 무관하게 Asia/Seoul(UTC+9) 기준으로 계산한다.
const EMERGENCY_DURATION_SECONDS = parseInt(process.env.EMERGENCY_DURATION_SECONDS || '3600', 10);
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const SPEED_MATCHING_WINDOWS = Object.freeze([
  { id: 'day', label: '낮', startMinute: 13 * 60, endMinute: 15 * 60 },
  { id: 'night', label: '밤', startMinute: 21 * 60, endMinute: 23 * 60 },
]);

function kstDateParts(nowMs = Date.now()) {
  const shifted = new Date(nowMs + KST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    minuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

function kstLocalToUtcMs(year, month, day, minuteOfDay) {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return Date.UTC(year, month - 1, day, hour, minute, 0, 0) - KST_OFFSET_MS;
}

function yyyymmdd({ year, month, day }) {
  return `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
}

function getSpeedMatchingAvailability(nowMs = Date.now()) {
  const parts = kstDateParts(nowMs);
  const current = SPEED_MATCHING_WINDOWS.find(
    (window) => parts.minuteOfDay >= window.startMinute && parts.minuteOfDay < window.endMinute
  );

  const todayKey = yyyymmdd(parts);
  const currentWindow = current ? {
    ...current,
    slotKey: `${todayKey}:${current.id}`,
    startsAt: new Date(kstLocalToUtcMs(parts.year, parts.month, parts.day, current.startMinute)),
    closesAt: new Date(kstLocalToUtcMs(parts.year, parts.month, parts.day, current.endMinute)),
  } : null;

  let nextStartMs = null;
  for (const window of SPEED_MATCHING_WINDOWS) {
    if (parts.minuteOfDay < window.startMinute) {
      nextStartMs = kstLocalToUtcMs(parts.year, parts.month, parts.day, window.startMinute);
      break;
    }
  }
  if (nextStartMs === null) {
    nextStartMs = kstLocalToUtcMs(parts.year, parts.month, parts.day + 1, SPEED_MATCHING_WINDOWS[0].startMinute);
  }

  return {
    isOpen: Boolean(currentWindow),
    currentWindow,
    nextStartsAt: new Date(nextStartMs),
    timezone: 'Asia/Seoul',
    scheduleText: '매일 13:00~15:00 · 21:00~23:00',
  };
}

// 테스트 계정만 일반 운영 시간 제한을 우회한다. 세션 지속시간과 숨김/재참여
// 동작은 일반 계정과 동일하게 유지해 실제 흐름을 그대로 점검할 수 있게 한다.
function getSpeedMatchingAvailabilityForEmail(rawEmail, nowMs = Date.now()) {
  const availability = getSpeedMatchingAvailability(nowMs);
  if (!isSpeedMatchingTestEmail(rawEmail)) return availability;

  const email = normalizeEmail(rawEmail);
  return {
    ...availability,
    isOpen: true,
    currentWindow: {
      id: 'test',
      label: '테스트',
      slotKey: `test:${email}`,
      startsAt: null,
      closesAt: null,
    },
    nextStartsAt: null,
    scheduleText: '테스트 계정: 언제나 시작 가능',
    testAccount: true,
  };
}

// ⏱️ 남은 시간 계산기
function computeRemaining(activatedAt, nowMs = Date.now(), durationSec = EMERGENCY_DURATION_SECONDS) {
  if (!activatedAt) return 0;
  const started = new Date(activatedAt).getTime();
  if (Number.isNaN(started)) return 0;
  const elapsedSec = Math.floor((nowMs - started) / 1000);
  return Math.max(0, durationSec - elapsedSec);
}

function computeSessionRemaining(emergency, nowMs = Date.now()) {
  if (!emergency) return 0;
  const explicitExpiry = emergency.expiresAt ? new Date(emergency.expiresAt).getTime() : NaN;
  if (Number.isFinite(explicitExpiry)) {
    return Math.max(0, Math.ceil((explicitExpiry - nowMs) / 1000));
  }
  return computeRemaining(emergency.activatedAt, nowMs);
}

module.exports = {
  EMERGENCY_DURATION_SECONDS,
  SPEED_MATCHING_WINDOWS,
  computeRemaining,
  computeSessionRemaining,
  getSpeedMatchingAvailability,
  getSpeedMatchingAvailabilityForEmail,
};
