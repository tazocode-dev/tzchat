// frontend/04210_Page2_target/Logic/distribution.js

/**
 * murmur32 해시 구현 (32비트) — 내부용으로 사용
 */
function murmur32(str) {
  let h = 0 ^ str.length;
  let i = 0;
  let k;

  while (str.length >= i + 4) {
    k =
      (str.charCodeAt(i) & 0xff) |
      ((str.charCodeAt(i + 1) & 0xff) << 8) |
      ((str.charCodeAt(i + 2) & 0xff) << 16) |
      ((str.charCodeAt(i + 3) & 0xff) << 24);
    k = Math.imul(k, 0x5bd1e995);
    k ^= k >>> 24;
    k = Math.imul(k, 0x5bd1e995);
    h = Math.imul(h, 0x5bd1e995) ^ k;
    i += 4;
  }

  switch (str.length - i) {
    case 3:
      h ^= (str.charCodeAt(i + 2) & 0xff) << 16;
    // falls through
    case 2:
      h ^= (str.charCodeAt(i + 1) & 0xff) << 8;
    // falls through
    case 1:
      h ^= (str.charCodeAt(i) & 0xff);
      h = Math.imul(h, 0x5bd1e995);
  }

  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;

  return h >>> 0;
}

const hash01 = (s) => murmur32(String(s)) / 0xFFFFFFFF;

/** 최근성 감쇠 계산 (가중치) */
function recencyWeight(timeValue, now) {
  if (!timeValue) return 0;
  const ts = new Date(timeValue).getTime();
  if (!Number.isFinite(ts)) return 0;
  const halfLifeMs = 12 * 60 * 60 * 1000; // 12시간
  const lambda = Math.log(2) / halfLifeMs;
  return Math.exp(-lambda * (now - ts));
}

/** 사용자 버킷 판정 */
function whichBucket(u, now) {
  const d = u.last_login || u.lastLogin || u.updatedAt || u.createdAt;
  const ts = d ? new Date(d).getTime() : 0;
  const dt = now - ts;
  const d3 = 3 * 86400e3;
  const d10 = 10 * 86400e3;
  if (dt < d3) return 'B1';
  if (dt < d10) return 'B2';
  return 'B3';
}

/**
 * 내부 점수 키: 점수(있으면) 80% + (최근성/해시) 20%
 * - u.score(0~1)가 숫자면 최우선
 * - 없으면 최근성+해시로만 계산
 */
function scoreKey(u, seed, now, mix = 0.35) {
  const w = recencyWeight(u.last_login || u.lastLogin || u.updatedAt || u.createdAt, now);
  const h = hash01(`${seed}#${u._id}`);
  const fallback = (1 - mix) * w + mix * h; // 0~1 근사
  const base = Number.isFinite(u?.score) ? Math.max(0, Math.min(1, Number(u.score))) : null;
  if (base === null) return fallback;
  return 0.8 * base + 0.2 * fallback;
}

/** 버킷 내 정렬: 점수 우선 + (최근성/해시) 보조 */
function sortBucket(arr, seed, now, mix = 0.35) {
  return [...arr].sort((a, b) => scoreKey(b, seed, now, mix) - scoreKey(a, seed, now, mix));
}

/** 버킷 회전: seed 기반 offset */
function rotateBySeed(arr, seed, tag) {
  if (!Array.isArray(arr) || arr.length === 0) return arr;
  const off = murmur32(`${seed}::${tag}`) % arr.length;
  if (off === 0) return arr;
  return arr.slice(off).concat(arr.slice(0, off));
}

/* =========================
   Sticky Set (하루/리셋 단위 고정 7명)
   - 현재 정책: 외부 상태 변화에 반응 (applyTotalFilter 반영)
   ========================= */
function stickyKey(seed) {
  return `dist:${seed}`;
}
function loadStickyIds(seed) {
  try {
    const raw = localStorage.getItem(stickyKey(seed));
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) return arr.map(String);
  } catch (_) {}
  return [];
}
function saveStickyIds(seed, ids) {
  try {
    localStorage.setItem(stickyKey(seed), JSON.stringify(ids.map(String)));
  } catch (_) {}
}

/* =========================
   노출 히스토리 (탐색 2명 반복 최소화용)
   - viewerId 기준 30일 보관
   ========================= */
const SEEN_KEEP_DAYS = 30;
const SEEN_MAX_ENTRIES = 800; // localStorage 안전 한도

function seenKey(viewerId) {
  return `distSeen:${viewerId || 'anon'}`;
}

function loadSeen(viewerId, now) {
  try {
    const raw = localStorage.getItem(seenKey(viewerId));
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    const cutoff = now - SEEN_KEEP_DAYS * 86400e3;
    // {id, t}만 유지
    const cleaned = arr
      .filter((it) => it && it.id && Number.isFinite(it.t))
      .filter((it) => it.t >= cutoff);
    if (cleaned.length !== arr.length) {
      localStorage.setItem(seenKey(viewerId), JSON.stringify(cleaned));
    }
    return cleaned;
  } catch (_) {
    return [];
  }
}

function saveSeen(viewerId, items, now) {
  try {
    if (!Array.isArray(items) || !items.length) return;
    const prev = loadSeen(viewerId, now);
    const merged = [...prev, ...items].slice(-SEEN_MAX_ENTRIES);
    localStorage.setItem(seenKey(viewerId), JSON.stringify(merged));
  } catch (_) {}
}

function toSeenSet(list) {
  const s = new Set();
  for (const it of list) s.add(String(it.id));
  return s;
}

/* =========================
   "하루" 경계: 매일 오전 11시(Asia/Seoul)
   - KST(UTC+9) 기준으로 11:00 이전이면 전날로 간주
   - 11:00 이후면 오늘 날짜 사용
   - 반환 형식: 'YYYYMMDD'
   ========================= */
function getSeedDayAt11KST() {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000; // UTC+9 (한국은 DST 없음)
  const nowUtcMs = Date.now();
  const kstMs = nowUtcMs + KST_OFFSET_MS;
  const kstDate = new Date(kstMs);

  const hourKST = kstDate.getUTCHours(); // kstMs에 대해 UTC getter 사용 → 실질적 KST 시각
  const baseMs = hourKST < 11 ? kstMs - 24 * 60 * 60 * 1000 : kstMs;
  const base = new Date(baseMs);

  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, '0');
  const d = String(base.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * 전체 분산 선정 로직:
 *  - "하루" 정의를 매일 오전 11시(KST) 경계로 계산 (seedDay 기본값)
 *  - 하루/리셋(seed) 단위로 최초 7명을 고정 (ID기준, Sticky)
 *  - 비공개/필터 불일치로 제외된 인원은 제거
 *  - 결원이 생기면 현재 랭킹에서만 보충 (새 유입은 결원시에만)
 *  - +탐색 2명(낮은 점수/저활성)을 추가하여 총 9명 반환
 *  - 탐색 2명은 최근 30일에 본 적 있으면 가급적 제외(부족 시 완화), Sticky 미저장
 *
 * @param {Array} rawList - 서버에서 받은 사용자 리스트
 * @param {Object} me - 현재 사용자 정보
 * @param {Object} options - 옵션 객체
 *   options.seedDay {string}         // 기본: getSeedDayAt11KST()
 *   options.viewerId {string}
 *   options.resetIndex {number}
 *   options.excludeIdsSet {Set<string>}
 *   options.applyTotalFilter {function}
 *   options.exploreCount {number}    // 기본 2
 *   options.coreCount {number}       // 기본 7
 *   options.exploreAvoidDays {number}// 기본 30 (최근 본 사람 회피 일수)
 * @returns {Array} - 선택된 사용자 리스트 (최대 core+explore = 9명)
 */
export function applyDistributedSelection(
  rawList,
  me,
  {
    seedDay,
    viewerId,
    resetIndex = 0,
    excludeIdsSet = new Set(),
    applyTotalFilter,
    exploreCount = 2,
    coreCount = 7,
    exploreAvoidDays = SEEN_KEEP_DAYS,
  }
) {
  const now = Date.now();

  // ✅ 매일 11:00(KST) 경계를 기준으로 day 계산
  const day = seedDay || getSeedDayAt11KST();
  const seed = `${day}#${viewerId || 'anon'}#${resetIndex}`;

  // 1) excludeIds 제거
  const filtered1 = Array.isArray(rawList)
    ? rawList.filter((u) => u && u._id && !excludeIdsSet.has(String(u._id)))
    : [];

  // 2) 전체 필터 적용 (비공개/차단 등 — 외부 변화 반영)
  const filtered2 = typeof applyTotalFilter === 'function'
    ? applyTotalFilter(filtered1, me)
    : filtered1;

  // 3) 버킷 분류
  const B1 = [], B2 = [], B3 = [];
  filtered2.forEach((u) => {
    const b = whichBucket(u, now);
    if (b === 'B1') B1.push(u);
    else if (b === 'B2') B2.push(u);
    else B3.push(u);
  });

  // 4) 각 버킷 정렬 + 회전 → 현재 "랭킹 보드"
  const sB1 = rotateBySeed(sortBucket(B1, seed, now), seed, 'B1');
  const sB2 = rotateBySeed(sortBucket(B2, seed, now), seed, 'B2');
  const sB3 = rotateBySeed(sortBucket(B3, seed, now), seed, 'B3');

  // "추천 순서" (백필 시 사용)
  const ranked = [...sB1, ...sB2, ...sB3];

  // 5) Sticky 유지: seed 기준으로 고정된 coreCount명 불러와서 교차(available만 유지)
  const stickyIds = loadStickyIds(seed);
  const byId = new Map(filtered2.map((u) => [String(u._id), u]));
  const kept = [];
  for (const id of stickyIds) {
    const u = byId.get(id);
    if (u) kept.push(u); // 여전히 조건 부합하면 유지 (외부 변화 반영 정책)
  }

  // 6) 결원 보충: 현재 ranked에서 kept에 없는 사람들로 채움
  const keptIdSet = new Set(kept.map((u) => String(u._id)));
  for (const u of ranked) {
    if (kept.length >= coreCount) break;
    const id = String(u._id);
    if (!keptIdSet.has(id)) {
      kept.push(u);
      keptIdSet.add(id);
    }
  }

  // 7) 최종 coreCount명 확정 + 저장 (Sticky는 핵심만)
  const core = kept.slice(0, coreCount);
  saveStickyIds(seed, core.map((u) => u._id));

  // 8) 탐색 2명(저점수/저활성) 추가 — 최근 30일 본 사람 회피 + Sticky 미저장
  let explore = [];
  if (exploreCount > 0 && filtered2.length > core.length) {
    const coreIdSet = new Set(core.map((u) => String(u._id)));

    // 핵심 제외한 전체 후보
    const rest = filtered2.filter((u) => !coreIdSet.has(String(u._id)));

    // 점수/최근성 기반 "낮은 지표" 순 정렬 (asc)
    const ascByLowScore = [...rest].sort(
      (a, b) => scoreKey(a, seed, now) - scoreKey(b, seed, now)
    );

    // 하위 20% 또는 최대 10명 풀(풀 부족 시 자동 축소)
    const poolSize = Math.min(
      Math.max(2, Math.ceil(ascByLowScore.length * 0.2)),
      10,
      ascByLowScore.length
    );
    let explorePool = ascByLowScore.slice(0, poolSize);

    // 최근 본 사람(기본 30일) 회피
    const seenList = loadSeen(viewerId, now);
    const seenSet = toSeenSet(seenList);
    const avoidDays = Math.max(1, Number(exploreAvoidDays) || SEEN_KEEP_DAYS);
    // seenList 자체가 과거 기록을 30일로 이미 정리됨. (avoidDays <= 30 가정)
    let filteredPool = explorePool.filter((u) => !seenSet.has(String(u._id)));

    // 부족하면 완화: (1) 회피 해제 → 원 풀 사용
    if (filteredPool.length < exploreCount) {
      filteredPool = explorePool.slice();
    }

    // seed 기반 회전으로 반복 편향 완화
    const rotated = rotateBySeed(filteredPool, seed, 'EXPLORE');

    // 앞에서 exploreCount명 추출
    explore = rotated.slice(0, Math.min(exploreCount, rotated.length));

    // 노출 히스토리 기록 (탐색만 기록)
    if (explore.length) {
      const items = explore.map((u) => ({ id: String(u._id), t: now }));
      saveSeen(viewerId, items, now);
    }
  }

  // 9) 반환: 핵심 core + 탐색 explore 합치고, 최종 노출 순서는 seed 기반 완전 섞기
  const combined = [...core, ...explore];
  const mixed = rotateBySeed(combined, seed, 'MIX');
  return mixed;
}
