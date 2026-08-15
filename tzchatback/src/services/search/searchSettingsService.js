// src/services/search/searchSettingsService.js
// ────────────────────────────────────────────────────────────
// 검색 설정 도메인 서비스 (지침 §1). routes/search/searchingRouter.js에서 분리.
// ────────────────────────────────────────────────────────────

const { User } = require('@/models');

class SearchSettingsError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const s = (v) => (typeof v === 'string' ? v.trim() : v ?? '');
const toNullOrInt = (v) => {
  const str = String(v ?? '').trim();
  if (str === '' || str === '전체') return null;
  const n = parseInt(str, 10);
  return Number.isFinite(n) ? n : null;
};
const isOnOff = (v) => typeof v === 'string' && ['ON', 'OFF'].includes(String(v).toUpperCase());
const normOnOff = (v, fallback = 'OFF') => {
  const up = String(v || '').toUpperCase();
  if (up === 'ON' || up === 'OFF') return up;
  return fallback;
};

async function updateSearchYear(userId, { year1, year2 }) {
  const parsedYear1 = toNullOrInt(year1);
  const parsedYear2 = toNullOrInt(year2);

  const updated = await User.findByIdAndUpdate(
    userId,
    { $set: { search_birthyear1: parsedYear1, search_birthyear2: parsedYear2 } },
    { new: true }
  ).select('search_birthyear1 search_birthyear2');

  if (!updated) throw new SearchSettingsError(404, '사용자 없음');
  return updated;
}

/*
   payload:
     { regions: [{region1, region2}, ...] }
   - 대표 1개는 search_region1/2 에도 세팅
   - snake/camel 둘 다 유지: search_regions, searchRegions
*/
function normalizeRegions(body) {
  if (Array.isArray(body?.regions)) {
    const arr = body.regions
      .filter((r) => r && typeof r === 'object')
      .map((r) => ({ region1: s(r.region1) || '', region2: s(r.region2) || '' }))
      .filter((r) => r.region1 !== '' && r.region2 !== '');
    if (arr.some((r) => r.region1 === '전체' && r.region2 === '전체')) {
      return [{ region1: '전체', region2: '전체' }];
    }
    return arr;
  }
  if (body && typeof body === 'object' && (body.region1 || body.region2)) {
    const r1 = s(body.region1) || '';
    const r2 = s(body.region2) || '';
    if (r1 && r2) return [{ region1: r1, region2: r2 }];
  }
  return [];
}

async function updateSearchRegions(userId, body) {
  const normalized = normalizeRegions(body || {});
  const first = normalized[0] || { region1: '', region2: '' };

  const updated = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        search_regions: normalized,
        searchRegions: normalized,
        search_region1: first.region1,
        search_region2: first.region2,
      }
    },
    { new: true }
  ).select('search_regions search_region1 search_region2');

  if (!updated) throw new SearchSettingsError(404, '사용자 없음');
  return { count: normalized.length, user: updated };
}

async function updateSearchPreference(userId, preferenceRaw) {
  const value = s(preferenceRaw) || '';
  const updated = await User.findByIdAndUpdate(
    userId,
    { $set: { search_preference: value } },
    { new: true }
  ).select('search_preference');

  if (!updated) throw new SearchSettingsError(404, '사용자 없음');
  return updated;
}

/*
   payload: {
     disconnectLocalContacts, allowFriendRequests, allowNotifications,
     onlyWithPhoto, matchPremiumOnly,  // 각각 'ON'|'OFF'
   }
*/
async function updateSearchToggles(userId, body) {
  const {
    disconnectLocalContacts,
    allowFriendRequests,
    allowNotifications,
    onlyWithPhoto,
    matchPremiumOnly,
  } = body || {};

  const update = {};
  if (disconnectLocalContacts !== undefined) {
    if (!isOnOff(disconnectLocalContacts)) throw new SearchSettingsError(400, 'disconnectLocalContacts must be ON/OFF');
    update.search_disconnectLocalContacts = normOnOff(disconnectLocalContacts);
  }
  if (allowFriendRequests !== undefined) {
    if (!isOnOff(allowFriendRequests)) throw new SearchSettingsError(400, 'allowFriendRequests must be ON/OFF');
    update.search_allowFriendRequests = normOnOff(allowFriendRequests);
  }
  if (allowNotifications !== undefined) {
    if (!isOnOff(allowNotifications)) throw new SearchSettingsError(400, 'allowNotifications must be ON/OFF');
    update.search_allowNotifications = normOnOff(allowNotifications);
  }
  if (onlyWithPhoto !== undefined) {
    if (!isOnOff(onlyWithPhoto)) throw new SearchSettingsError(400, 'onlyWithPhoto must be ON/OFF');
    update.search_onlyWithPhoto = normOnOff(onlyWithPhoto);
  }
  if (matchPremiumOnly !== undefined) {
    if (!isOnOff(matchPremiumOnly)) throw new SearchSettingsError(400, 'matchPremiumOnly must be ON/OFF');
    update.search_matchPremiumOnly = normOnOff(matchPremiumOnly);
  }

  const updated = await User.findByIdAndUpdate(userId, { $set: update }, { new: true })
    .select('search_disconnectLocalContacts search_allowFriendRequests search_allowNotifications search_onlyWithPhoto search_matchPremiumOnly')
    .lean();

  if (!updated) throw new SearchSettingsError(404, '사용자 없음');
  return updated;
}

async function updateSearchMarriage(userId, marriageRaw) {
  const raw = s(marriageRaw);
  const ALLOWED = ['전체', '미혼', '기혼', '돌싱'];
  if (!ALLOWED.includes(raw)) {
    throw new SearchSettingsError(400, 'marriage must be one of 전체/미혼/기혼/돌싱');
  }

  const updated = await User.findByIdAndUpdate(
    userId,
    { $set: { search_marriage: raw } },
    { new: true }
  ).select('search_marriage updatedAt').lean();

  if (!updated) throw new SearchSettingsError(404, '사용자 없음');
  return updated;
}

module.exports = {
  SearchSettingsError,
  updateSearchYear,
  updateSearchRegions,
  updateSearchPreference,
  updateSearchToggles,
  updateSearchMarriage,
};
