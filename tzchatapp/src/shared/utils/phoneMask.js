// src/utils/phoneMask.js

// +821012345678 → 01012345678 형태로 변환 (한국 전용)
export function normalizePhoneKR(raw = '') {
  if (!raw) return '';
  let s = String(raw).trim();

  // +82, 82로 시작하는 형태 처리
  s = s.replace(/[^\d+]/g, ''); // 숫자/플러스만
  if (s.startsWith('+82')) {
    s = '0' + s.slice(3); // +82 10 1234 5678 → 01012345678
  } else if (s.startsWith('82')) {
    s = '0' + s.slice(2);
  }

  // 하이픈 제거 등
  s = s.replace(/[^\d]/g, '');

  return s;
}

// 화면 표시용: 010 xx00 xx00
export function maskPhoneToXX00(raw = '') {
  const p = normalizePhoneKR(raw); // 01012345678 형태 기대
  if (p.length < 10) {
    // 이상한 번호면 그냥 원본 리턴하거나 빈값
    return raw;
  }

  const head = p.slice(0, 3); // 010
  const mid = 'xx00';
  const tail = 'xx00';

  return `${head} ${mid} ${tail}`;
}
