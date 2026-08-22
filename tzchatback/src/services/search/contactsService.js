// src/services/search/contactsService.js
// ────────────────────────────────────────────────────────────
// 연락처 해시 관리 도메인 서비스 (지침 §1). routes/search/contactsRouter.js에서 분리.
// ────────────────────────────────────────────────────────────

const { User } = require('@/models');
const { requireCurrentActiveOptIn } = require('@/services/legal/termsPublicService');

class ContactsError extends Error {
  constructor(status, codeOrMessage, message) {
    super(message || codeOrMessage);
    this.status = status;
    this.code = message ? codeOrMessage : undefined;
  }
}

const MAX_CONTACT_HASHES = 2000;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;
const INVALID_CONTACT_HASHES_CODE = 'INVALID_CONTACT_HASHES';
const INVALID_CONTACT_HASHES_MESSAGE = '연락처 해시 배열이 올바르지 않습니다.';

function invalidContactHashes() {
  return new ContactsError(
    400,
    INVALID_CONTACT_HASHES_CODE,
    INVALID_CONTACT_HASHES_MESSAGE,
  );
}

function validateAndNormalizeContactHashes(hashesRaw) {
  if (!Array.isArray(hashesRaw) || hashesRaw.length > MAX_CONTACT_HASHES) {
    throw invalidContactHashes();
  }

  const hashes = [];
  const seen = new Set();
  for (const value of hashesRaw) {
    if (typeof value !== 'string' || !SHA256_HEX_PATTERN.test(value)) {
      throw invalidContactHashes();
    }
    const normalized = value.toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      hashes.push(normalized);
    }
  }
  return hashes;
}

/*
   body: { hashes: string[] }
   - 앱에서 읽어온 연락처 전화번호를 클라이언트에서 SHA-256 후 전송
   - 서버는 SHA-256 hex 형식 검증, 소문자 정규화, 중복 제거 후 저장
*/
async function saveContactHashes(userId, hashesRaw, dependencies = {}) {
  const hashes = validateAndNormalizeContactHashes(hashesRaw);

  // 빈 배열은 저장이 아니라 기존 해시 삭제이므로 선택 동의 없이도 허용한다.
  if (hashes.length > 0) {
    const requireOptIn = dependencies.requireCurrentActiveOptIn || requireCurrentActiveOptIn;
    await requireOptIn(userId, 'contacts-consent', dependencies);
  }

  const UserModel = dependencies.UserModel || User;
  const updated = await UserModel.findByIdAndUpdate(
    userId,
    { $set: { localContactHashes: hashes } },
    { new: true }
  ).select('_id localContactHashes');

  if (!updated) throw new ContactsError(404, '사용자 없음');

  return { count: updated.localContactHashes?.length || 0 };
}

// 내 연락처 해시 전체 삭제 + search_disconnectLocalContacts를 OFF로(보조)
async function clearContactHashes(userId, dependencies = {}) {
  const UserModel = dependencies.UserModel || User;
  const updated = await UserModel.findByIdAndUpdate(
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

module.exports = {
  ContactsError,
  INVALID_CONTACT_HASHES_CODE,
  INVALID_CONTACT_HASHES_MESSAGE,
  MAX_CONTACT_HASHES,
  clearContactHashes,
  saveContactHashes,
  validateAndNormalizeContactHashes,
};
