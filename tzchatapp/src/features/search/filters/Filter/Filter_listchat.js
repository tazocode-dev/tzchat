// ------------------------------------------------------------
// 리스트/채팅 상대 제외 필터 (교정/보강판)
// - 받은신청, 보낸신청, 친구, 차단, 채팅(신규 포함)에 들어있는 사용자를 제외
// - 다양한 백엔드/프론트 구조를 폭넓게 지원하는 ID 추출 유틸 포함
// - ObjectId 안전 처리, friendlist/blocklist 지원, FriendRequest 객체 처리
// - /api/chatrooms/partners 결과나 추가 제외 ID(opt.extraExcludeIds)도 병합
// ------------------------------------------------------------

/** 문자열/숫자/객체(ObjectId/문서/느슨한 객체)에서 안전하게 사용자 ID 추출 */
function normId(v) {
  if (!v) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);

  // Mongo ObjectId 같은 객체 처리: toString()이 있고 [object Object]가 아니며 24hex면 사용
  try {
    if (typeof v.toString === 'function') {
      const s = v.toString();
      if (s && s !== '[object Object]' && /^[0-9a-fA-F]{24}$/.test(s)) return s;
    }
  } catch (_) {}

  // Mongo export 형태 {$oid: "..."} 지원
  if (v && typeof v.$oid === 'string') return v.$oid;

  // 일반 문서/객체의 관용 키들
  const cand =
    v._id || v.id || v.userId || v.user_id || v.ownerId || v.owner ||
    v.accountId || v.account || v.targetId || v.otherId || v.peerId;
  if (cand) return String(cand);

  return '';
}

function toIdList(src) {
  const arr = Array.isArray(src) ? src : [];
  return arr.map(normId).filter(Boolean);
}

/** FriendRequest/Request류 객체 배열에서 "상대방" ID들을 추출 */
function extractOtherIdsFromRequests(list, myId) {
  const arr = Array.isArray(list) ? list : [];
  const out = [];
  for (const r of arr) {
    // 다양한 백엔드 케이스를 포괄:
    // {from,to} | {requester,recipient} | {sender,receiver} | {userId/otherId} 등
    const candidates = [
      r?.from, r?.to,
      r?.requester, r?.recipient,
      r?.sender, r?.receiver,
      r?.userId, r?.otherId, r?.targetId, r?.peerId,
      // 일부 API는 객체로 감싸서 들어올 수 있음
      r?.fromUser, r?.toUser, r?.owner, r?.user
    ];

    const ids = candidates
      .map(normId)
      .filter(Boolean)
      .filter(id => !myId || id !== myId);

    // 첫 번째 유효 후보만 사용 (중복 방지)
    if (ids.length) out.push(ids[0]);
  }
  return out;
}

/** me 객체에서 가능한 모든 관계/채팅 ID들을 긁어모아 Set으로 반환 */
export function collectRelationIdSet(me = {}, opt = {}) {
  const set = new Set();
  const myId = normId(me);

  // --- 친구 ---
  // friends/friendIds + ✅ friendlist (스키마 필드명)
  [
    me.friends,
    me.friendIds,
    me.relations?.friends,
    me._relations?.friends,
    me.friendlist, // ✅
  ].forEach(list => toIdList(list).forEach(id => set.add(id)));

  // --- 차단 ---
  // blocks/blockIds + ✅ blocklist (스키마 필드명)
  [
    me.blocks,
    me.blockIds,
    me.relations?.blocks,
    me._relations?.blocks,
    me.blocklist, // ✅
  ].forEach(list => toIdList(list).forEach(id => set.add(id)));

  // --- 받은/보낸 신청 ---
  // 배열이 "ID 배열"일 수도, "리퀘스트 문서 배열"일 수도 있음 → 둘 다 처리
  const recvRawLists = [
    me.pendingRecv,
    me.pendingReceived,
    me.requests?.received,
    me.friendRequests?.received,
    me._relations?.pendingRecv,
    me.receivedRequests, // 관용
  ];
  const sentRawLists = [
    me.pendingSent,
    me.requests?.sent,
    me.friendRequests?.sent,
    me._relations?.pendingSent,
    me.sentRequests, // 관용
  ];

  // 단순 ID 배열 처리
  recvRawLists.forEach(list => toIdList(list).forEach(id => set.add(id)));
  sentRawLists.forEach(list => toIdList(list).forEach(id => set.add(id)));

  // 리퀘스트 "객체" 배열에서 상대방 ID 추출
  recvRawLists.forEach(list => extractOtherIdsFromRequests(list, myId).forEach(id => set.add(id)));
  sentRawLists.forEach(list => extractOtherIdsFromRequests(list, myId).forEach(id => set.add(id)));

  // --- 채팅 상대(신규 포함) ---
  [
    me.chatUserIds,
    me.recentChatUserIds,
    me._relations?.chatUserIds,
    me.chatPartners,            // 관용
    me._relations?.chatPartners // 관용
  ].forEach(list => toIdList(list).forEach(id => set.add(id)));

  const fromChatList = (Array.isArray(me.chatList) ? me.chatList : [])
    .map(c => c?.userId ?? c?.otherId ?? c?.peerId ?? c?.targetId ?? c?.partnerId)
    .map(normId)
    .filter(Boolean);
  fromChatList.forEach(id => set.add(id));

  const fromChatsParticipants = (Array.isArray(me.chats) ? me.chats : [])
    .flatMap(c => Array.isArray(c?.participants) ? c.participants : [])
    .map(normId)
    .filter(Boolean);
  fromChatsParticipants.forEach(id => set.add(id));

  const fromRecent = (Array.isArray(me.recentChats) ? me.recentChats : [])
    .map(c => c?.userId ?? c?.otherId ?? c?.peerId ?? c?.targetId ?? c?.partnerId)
    .map(normId)
    .filter(Boolean);
  fromRecent.forEach(id => set.add(id));

  // --- 백엔드 제공: /api/chatrooms/partners 의 결과를 프론트에서 me._relations.chatPartners 등에 넣어 줬다면 포함 ---
  if (Array.isArray(me._relations?.partners)) {
    me._relations.partners.map(normId).filter(Boolean).forEach(id => set.add(id));
  }

  // --- 추가 제외 ID(opt.extraExcludeIds) 병합 ---
  if (Array.isArray(opt?.extraExcludeIds)) {
    opt.extraExcludeIds.map(normId).filter(Boolean).forEach(id => set.add(id));
  }

  // --- 자기 자신 제외 ---
  if (myId) set.add(myId);

  return set;
}

/**
 * 리스트/채팅 제외 필터
 * @param {Array} users - 후보 유저 목록
 * @param {Object} me   - 내 유저 객체(여러 관계/채팅 필드를 허용)
 * @param {Object} [opt]
 * @param {boolean} [opt.log=false]
 * @param {Array<string|object>} [opt.extraExcludeIds] - 추가 제외할 ID들
 */
export function filterByListChat(users, me, opt = {}) {
  const log = !!opt.log;
  const set = collectRelationIdSet(me, opt);

  const out = (Array.isArray(users) ? users : []).filter(u => {
    const uid = normId(u);
    const pass = uid && !set.has(uid);
    if (!pass && log) {
      const name = (u && (u.nickname || u.username || u.name)) || uid;
      console.log(`[ListChat] 제외: ${name} (${uid})`);
    }
    return pass;
  });

  if (log) {
    const total = (users || []).length;
    console.log(`[ListChat] 입력:${total} → 출력:${out.length} (제외:${total - out.length})`);
  }
  return out;
}

export default filterByListChat;
