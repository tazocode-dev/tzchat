// src/services/system/ugcContentPolicyService.js
// -----------------------------------------------------------------------------
// 사용자 공개 텍스트의 최소 사전 게시 정책입니다.
// 신고 상세는 증거 보존 대상이므로 이 모듈을 적용하지 않습니다.
// -----------------------------------------------------------------------------

const UGC_CONTENT_REJECTED = 'UGC_CONTENT_REJECTED';

const TEXT_LIMITS = Object.freeze({
  nickname: 20,
  selfintro: 500,
  chatMessage: 2000,
  friendRequestMessage: 300,
});

const FIELD_LABELS = Object.freeze({
  nickname: '닉네임',
  selfintro: '소개',
  chatMessage: '메시지',
  friendRequestMessage: '친구 신청 메시지',
});

// 운영자가 환경변수로 보완할 수 있는 최소 기본 목록입니다. 목록 자체를 사용자에게
// 반환하지 않아 필터 우회에 필요한 정보를 노출하지 않습니다.
const DEFAULT_BLOCKED_TERMS = Object.freeze([
  // 명백한 욕설·모욕
  '씨발', '시발', 'ㅅㅂ', '개새끼', '병신', '좆', 'fuck', 'fucking', 'bitch',
  // 성적 거래·착취
  '조건만남', '조건녀', '조건남', '성매매', '원조교제', '매춘', 'paidsex',
  // 미성년자 대상 성적 접근·착취
  '미성년자만남', '미성년성관계', '아동성착취', '아동포르노', 'childporn', 'teenescort',
  // 구체적인 폭력 위협·혐오 선동
  '죽여버린다', '죽여버리겠다', '살해협박', '인종청소', '가스실로', 'nigger', 'chink',
]);

class UgcContentPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UgcContentPolicyError';
    this.status = 400;
    this.code = UGC_CONTENT_REJECTED;
  }
}

function normalizeForModeration(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[\p{White_Space}\p{P}\p{S}\p{Cf}]+/gu, '');
}

function parseAdditionalBlockedTerms(value = process.env.UGC_BLOCKED_TERMS) {
  return String(value || '')
    .split(/[,\n\r]+/)
    .map(term => term.trim())
    .filter(term => term && term.length <= 100)
    .slice(0, 200);
}

function getBlockedTerms(additionalTerms) {
  const configured = Array.isArray(additionalTerms)
    ? additionalTerms
    : parseAdditionalBlockedTerms(additionalTerms);
  return [...new Set([...DEFAULT_BLOCKED_TERMS, ...configured])]
    .map(normalizeForModeration)
    .filter(Boolean);
}

function validateUserGeneratedText(value, {
  field,
  required = true,
  maxLength = TEXT_LIMITS[field],
  additionalTerms = process.env.UGC_BLOCKED_TERMS,
} = {}) {
  const label = FIELD_LABELS[field] || '내용';
  if (typeof value !== 'string') {
    if (!required && (value == null)) return '';
    throw new UgcContentPolicyError(`${label} 형식이 올바르지 않습니다.`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    if (!required) return '';
    throw new UgcContentPolicyError(`${label}을(를) 입력해 주세요.`);
  }
  if (!Number.isInteger(maxLength) || maxLength <= 0) {
    throw new TypeError(`지원하지 않는 콘텐츠 필드입니다: ${String(field || '')}`);
  }
  if (trimmed.length > maxLength) {
    throw new UgcContentPolicyError(`${label}은(는) ${maxLength}자 이내로 입력해 주세요.`);
  }

  const normalized = normalizeForModeration(trimmed);
  if (getBlockedTerms(additionalTerms).some(term => normalized.includes(term))) {
    throw new UgcContentPolicyError('커뮤니티 안전 정책에 맞지 않는 표현이 포함되어 있습니다.');
  }
  return trimmed;
}

module.exports = {
  UGC_CONTENT_REJECTED,
  TEXT_LIMITS,
  DEFAULT_BLOCKED_TERMS,
  UgcContentPolicyError,
  normalizeForModeration,
  parseAdditionalBlockedTerms,
  validateUserGeneratedText,
};
