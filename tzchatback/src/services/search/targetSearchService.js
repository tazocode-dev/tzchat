// src/services/search/targetSearchService.js
// ────────────────────────────────────────────────────────────
// 검색/추천 질의 도메인 서비스 (지침 §1). routes/search/targetRouter.js에서 분리.
// ────────────────────────────────────────────────────────────

const mongoose = require('mongoose');
const { User } = require('@/models');
const { getBlockedUserIdSet, buildDiscoverableUserFilter } = require('@/services/chat/blockPolicyService');

class TargetSearchError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const s = (v) => (typeof v === 'string' ? v.trim() : v ?? '');
const parseCommaIds = (sval) =>
  String(sval ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

const USER_FIELDS =
  'username nickname birthyear gender marriage search_marriage region1 region2 ' +
  'preference search_preference selfintro ' +
  'last_login updatedAt createdAt ' +
  'profileMain profileImages profileImage avatar photo ' +
  'search_onlyWithPhoto search_allowFriendRequests search_matchPremiumOnly';

function shapeUsers(list) {
  const toOnOff = (v) => (String(v ?? 'OFF').toUpperCase() === 'ON' ? 'ON' : 'OFF');
  return list.map((u) => ({
    ...u,
    selfintro: u.selfintro ?? u.selfIntro ?? '',
    search_allowFriendRequests: toOnOff(u.search_allowFriendRequests),
    search_onlyWithPhoto: toOnOff(u.search_onlyWithPhoto),
    search_matchPremiumOnly: toOnOff(u.search_matchPremiumOnly),
    preference: u.preference ?? '',
    search_preference: u.search_preference ?? '',
    marriage: u.marriage ?? '',
    search_marriage: u.search_marriage ?? '전체',
  }));
}

/* =========================
   1) 사용자 검색 (간단 필터)
   payload: { regions: [{region1, region2}, ...] }  // 선택적
========================= */
async function searchUsers(myId, body) {
  // 나의 phoneHash / localContactHashes / 스위치 상태
  const me = await User.findById(myId)
    .select('phoneHash localContactHashes search_disconnectLocalContacts')
    .lean();

  const myPhoneHash = me?.phoneHash || null;
  const myDisconnectOn = String(me?.search_disconnectLocalContacts || '').toUpperCase() === 'ON';
  const myContactHashes = Array.isArray(me?.localContactHashes) ? me.localContactHashes : [];

  const raw = Array.isArray(body?.regions) ? body.regions : [];
  const regions = raw
    .filter((r) => r && (r.region1 || r.region2))
    .map((r) => ({ region1: s(r.region1), region2: s(r.region2) }));

  const isAll =
    regions.length === 0 ||
    regions.some((r) => r.region1 === '전체') ||
    regions.some((r) => r.region2 === '전체');

  const blockedUserIds = await getBlockedUserIdSet(myId);
  const andFilters = [buildDiscoverableUserFilter(myId, blockedUserIds)];

  // 0) 동일 전화번호 유저 제외 (기본 보호)
  if (myPhoneHash) {
    andFilters.push({ phoneHash: { $ne: myPhoneHash } });
  }

  // 1) "제외하기" — 내가 ON 이고, 내 연락처 해시 목록에 있는 사람들 숨기기
  if (myDisconnectOn && myContactHashes.length) {
    andFilters.push({ phoneHash: { $nin: myContactHashes } });
  }

  // 2) "제외당하기" — 상대가 ON 이고, 상대 localContactHashes 에 내 phoneHash 가 있으면 서로 숨김
  if (myPhoneHash) {
    andFilters.push({
      $or: [
        { search_disconnectLocalContacts: { $ne: 'ON' } },
        { localContactHashes: { $nin: [myPhoneHash] } },
      ],
    });
  }

  // 3) 지역 필터
  if (!isAll) {
    const orConditions = regions.map(({ region1, region2 }) =>
      !region2 || region2 === '전체' ? { region1 } : { region1, region2 }
    );
    andFilters.push({ $or: orConditions });
  }

  const finalQuery = andFilters.length ? { $and: andFilters } : {};
  const users = await User.find(finalQuery).select(USER_FIELDS).lean();

  return shapeUsers(users);
}

/* =========================
   2) 추천 후보(원천 리스트)
   GET /api/search/targets?limit=50&exclude=comma,ids&seedDay=YYYY-MM-DD
========================= */
async function getRecommendedTargets(viewerId, { limit: limitRaw, exclude, seedDay }) {
  const limit = Math.min(Number(limitRaw || 50), 200);
  const blockedUserIds = await getBlockedUserIdSet(viewerId);
  const excludeSet = new Set([...parseCommaIds(exclude), ...blockedUserIds]);

  const dayjs = require('dayjs');
  const tz = require('dayjs/plugin/timezone');
  const utc = require('dayjs/plugin/utc');
  dayjs.extend(utc); dayjs.extend(tz);

  const ymd = s(seedDay) || dayjs().tz('Asia/Seoul').format('YYYY-MM-DD');

  // 모델은 글로벌로 등록되어 있어야 함(models/index.js)
  const UserDailyScore = mongoose.model('UserDailyScore');

  // 1단계: 점수 기반 후보 ID 수집
  const scoreDocs = await UserDailyScore.find({ ymd })
    .sort({ exposureScore: -1, updatedAt: -1 })
    .limit(limit * 3)
    .lean();

  const candidateIds = [];
  for (const d of scoreDocs) {
    const uid = String(d.user);
    if (uid === viewerId) continue;
    if (excludeSet.has(uid)) continue;
    candidateIds.push(d.user);
    if (candidateIds.length >= limit * 2) break;
  }

  // 2단계: 내 연락처/스위치 정보 로딩
  const me = await User.findById(viewerId)
    .select('phoneHash localContactHashes search_disconnectLocalContacts')
    .lean();

  const myPhoneHash = me?.phoneHash || null;
  const myDisconnectOn = String(me?.search_disconnectLocalContacts || '').toUpperCase() === 'ON';
  const myContactHashes = Array.isArray(me?.localContactHashes) ? me.localContactHashes : [];

  // 3단계: 추천 대상 쿼리 구성
  const andFilters = [
    { _id: { $in: candidateIds } },
    buildDiscoverableUserFilter(viewerId, blockedUserIds),
    { isPrivate: { $ne: true } },
  ];

  // 3-0) 동일 전화번호 유저 기본 보호
  if (myPhoneHash) {
    andFilters.push({ phoneHash: { $ne: myPhoneHash } });
  }

  // 3-1) "제외하기" — 내가 ON 이고, 내 연락처에 있는 사람 숨기기
  if (myDisconnectOn && myContactHashes.length) {
    andFilters.push({ phoneHash: { $nin: myContactHashes } });
  }

  // 3-2) "제외당하기" — 상대가 ON 이고, 상대 연락처에 내가 있으면 서로 숨김
  if (myPhoneHash) {
    andFilters.push({
      $or: [
        { search_disconnectLocalContacts: { $ne: 'ON' } },
        { localContactHashes: { $nin: [myPhoneHash] } },
      ],
    });
  }

  const finalQuery = { $and: andFilters };

  const users = await User.find(finalQuery)
    .select(
      '_id username nickname birthyear gender level region1 region2 ' +
      'profileMain profileImages profileImage avatar photo ' +
      'createdAt updatedAt'
    )
    .lean();

  return { ymd, users };
}

module.exports = { TargetSearchError, searchUsers, getRecommendedTargets };
