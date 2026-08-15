// src/services/search/contactsService.js
// ────────────────────────────────────────────────────────────
// 연락처 해시 관리 도메인 서비스 (지침 §1). routes/search/contactsRouter.js에서 분리.
// ────────────────────────────────────────────────────────────

const { User } = require('@/models');

class ContactsError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const s = (v) => (typeof v === 'string' ? v.trim() : v ?? '');

/*
   body: { hashes: string[] }
   - 앱에서 읽어온 연락처 전화번호를 클라이언트에서 SHA-256 후 전송
   - 서버에서는 그대로 저장(중복 제거만)
*/
async function saveContactHashes(userId, hashesRaw) {
  const list = Array.isArray(hashesRaw) ? hashesRaw : [];
  if (!list.length) {
    throw new ContactsError(400, 'hashes 배열이 비어 있습니다.');
  }

  // 문자열로 변환 + 공백 제거 + 간단 필터링
  let hashes = list.map((h) => s(h)).filter((h) => h.length > 0);

  // 중복 제거
  hashes = Array.from(new Set(hashes));

  if (!hashes.length) {
    throw new ContactsError(400, '유효한 해시가 없습니다.');
  }

  const updated = await User.findByIdAndUpdate(
    userId,
    { $set: { localContactHashes: hashes } },
    { new: true }
  ).select('_id localContactHashes');

  if (!updated) throw new ContactsError(404, '사용자 없음');

  return { count: updated.localContactHashes?.length || 0 };
}

// 내 연락처 해시 전체 삭제 + search_disconnectLocalContacts를 OFF로(보조)
async function clearContactHashes(userId) {
  const updated = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        localContactHashes: [],
        search_disconnectLocalContacts: 'OFF',
      }
    },
    { new: true }
  ).select('_id localContactHashes search_disconnectLocalContacts');

  if (!updated) throw new ContactsError(404, '사용자 없음');

  return {
    count: updated.localContactHashes?.length || 0,
    disconnectLocalContacts: updated.search_disconnectLocalContacts,
  };
}

module.exports = { ContactsError, saveContactHashes, clearContactHashes };
