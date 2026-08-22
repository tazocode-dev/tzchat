// 연락처 기반 상호 배제 필터
// ------------------------------------------------------------
// 연락처 기반 상호 배제 필터 (Disconnect Local Contacts)
//
// 최종 규칙:
//
// 1) 내가 스위치 ON:
//    - 내 연락처(localContactHashes)에 있는 사람은 내가 볼 수 없음 (제외하기)
//
// 2) 상대가 스위치 ON:
//    - 상대 연락처(localContactHashes)에 내가 있으면
//      → 나는 그 사람을 볼 수 없음 (제외당하기)
//      → 상대 입장에서도 동일 규칙이 적용되므로 서로 숨김 효과
//
// 구현 메모:
// - 프런트에 개인정보가 오지 않는 경우가 많으므로, 다음 우선순위로 판별:
//   A) 서버가 내려준 플래그 사용: other.isInMyContacts, other.amInTheirContacts
//   B) 해시 비교: my.localContactHashes vs other.phoneHash,
//                 other.localContactHashes vs my.phoneHash
//   C) 정보가 부족하면 가능한 쪽만 적용
// - 'ON'/'OFF'/boolean 모두 처리
// ------------------------------------------------------------

/** 'ON'/'OFF'/boolean → boolean */
export function normalizeOn(v) {
  if (typeof v === 'boolean') return v;
  const s = String(v || '').trim().toUpperCase();
  if (s === 'ON') return true;
  if (s === 'OFF') return false;
  return false;
}

/** 안전한 Set 포함 체크 */
function inSet(value, setLike) {
  if (!value) return false;
  if (!setLike) return false;
  if (Array.isArray(setLike)) return setLike.includes(value);
  try {
    if (typeof setLike.has === 'function') return setLike.has(value);
  } catch (_) {}
  return false;
}

/**
 * 연락처 상호 배제 필터
 * @param {Array} users              - 후보 유저 목록
 * @param {Object} me                - 내 유저 객체
 *   - me.search_disconnectLocalContacts: 'ON'/'OFF' 또는 boolean
 *   - me.localContactHashes?: string[]   (선택) 내가 가진 연락처 해시 목록
 *   - me.phoneHash?: string             (선택) 내 번호 해시
 * @param {Object} [opt]
 *   - opt.log?: boolean                콘솔 로그
 * @returns {Array}
 */
export function filterByContactsCo(users, me, opt = {}) {
  const log = import.meta.env.DEV && !!opt.log;
  const list = Array.isArray(users) ? users : [];

  const myDisconnectOn = normalizeOn(me?.search_disconnectLocalContacts);
  const myHashes = Array.isArray(me?.localContactHashes) ? me.localContactHashes : [];
  const myPhoneHash = me?.phoneHash || null;

  return list.filter((other) => {
    const nickname = other?.nickname ?? '-';

    // 서버 제공 플래그
    // - other.isInMyContacts: 상대가 "내 연락처"에 속하는지 (내가 업로드한 해시 기준)
    // - other.amInTheirContacts: 내가 "상대 연락처"에 있는지
    const flag_isInMyContacts = other?.isInMyContacts;
    const flag_amInTheirContacts = other?.amInTheirContacts;

    // 해시 정보
    const otherPhoneHash = other?.phoneHash || null;
    const otherHashes = Array.isArray(other?.localContactHashes) ? other.localContactHashes : [];

    // 상대 스위치 상태
    const theirDisconnectOn = normalizeOn(other?.search_disconnectLocalContacts);

    // 1) 제외하기 — 내가 ON 이고, 내 연락처에 있는 사람
    let excludedByMe = false;
    if (myDisconnectOn) {
      if (typeof flag_isInMyContacts === 'boolean') {
        excludedByMe = flag_isInMyContacts;
      } else {
        excludedByMe = inSet(otherPhoneHash, myHashes);
      }
      if (excludedByMe && log) {
        console.log(`[연락처필터] ❌ 제외(내 연락처, 내 스위치 ON) → ${nickname}`);
      }
    }

    if (excludedByMe) return false;

    // 2) 제외당하기 — 상대가 ON 이고, 상대 연락처에 내가 있는 경우
    //    (내가 OFF여도 적용됨)
    let excludedByThem = false;
    if (theirDisconnectOn) {
      if (typeof flag_amInTheirContacts === 'boolean') {
        excludedByThem = flag_amInTheirContacts;
      } else {
        excludedByThem = inSet(myPhoneHash, otherHashes);
      }
      if (excludedByThem && log) {
        console.log(`[연락처필터] ❌ 제외(상대 연락처 보유 & 상대 스위치 ON) → ${nickname}`);
      }
    }

    if (excludedByThem) return false;

    // 통과
    if (log) console.log(`[연락처필터] ✅ 통과 → ${nickname}`);
    return true;
  });
}

/*

사용 예시 (target.vue)
import { filterByContactsCo } from '@/features/search/filters/contactExclusionFilter'

// me: 로그인 유저 (search_disconnectLocalContacts, localContactHashes, phoneHash 포함 가능)
const afterContacts = filterByContactsCo(users, me, { log: false })

*/
