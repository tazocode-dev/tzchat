// 대표 사진 보유 필터
// ------------------------------------------------------------
// 사진 필터 (단방향) — ON이면 "대표사진 있는 사용자"만 노출
// ------------------------------------------------------------
// 핵심 요구사항
// - 내 스위치(search_onlyWithPhoto)가 OFF → 필터 미적용(그대로 반환)
// - 내 스위치가 ON  → 상대의 "대표사진(= main 계열 필드)"이 설정되어 있어야만 통과
//
// 대표사진 판정 규칙
// 1) profileMain / profileMainUrl / profileMainURL / (레거시) profileImage / avatar / photo
//    중 **하나라도 응답에 존재**하고 값이 비어있지 않으면 대표사진 "있음"으로 판정
//    - 값이 URL이면 기본 아바타(man.jpg / woman.jpg)는 제외
//    - 값이 URL이 아닌 임의의 ID 문자열(e.g. 'e0ecf99d...')이면 존재 자체로 인정
// 2) 위 "main 계열 필드"가 **응답에 아예 누락**된 경우(프로젝션/최적화 등),
//    백엔드가 필드를 내려주지 않아 모두 걸러지는 현상을 방지하기 위한 **보호용 보조 판정**을 제공:
//    - profileImages 길이 > 0, 또는 imagesCount/photoCount > 0 이면 true
//    - 이 보조 판정은 opt.failClose=true 로 끌 수 있음(엄격 모드)
// ------------------------------------------------------------

function str(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** 'ON'/'OFF'/boolean → boolean */
function normalizeOn(v) {
  if (typeof v === 'boolean') return v;
  const s = str(v).toUpperCase();
  if (s === 'ON') return true;
  if (s === 'OFF') return false;
  return false;
}

/** 기본 아바타 식별 (필요 시 확장 가능) */
function isDefaultAvatar(url) {
  if (!url) return false;
  const u = String(url).toLowerCase();
  return u.includes('man.jpg') || u.includes('woman.jpg');
}

/** 객체에 해당 key가 '존재'하는지 (값이 빈 문자열이어도 존재로 간주) */
function hasKey(obj, key) {
  return obj != null && Object.prototype.hasOwnProperty.call(obj, key);
}

/** main 계열 필드 중 응답에 '무엇이 있었는지'와 최종 main 문자열을 얻는다 */
function pickMain(user) {
  const present =
    hasKey(user, 'profileMain') ||
    hasKey(user, 'profileMainUrl') ||
    hasKey(user, 'profileMainURL') ||
    hasKey(user, 'profileImage') ||
    hasKey(user, 'avatar') ||
    hasKey(user, 'photo');

  const main =
    str(user?.profileMain) ||
    str(user?.profileMainUrl) ||
    str(user?.profileMainURL) ||
    str(user?.profileImage) || // legacy
    str(user?.avatar) ||
    str(user?.photo);

  return { present, main };
}

/**
 * 대표사진 존재 여부 판정
 * @param {Object} user
 * @param {Object} opt
 *   - failClose?: boolean  // true면 보조 판정 사용 안 함(엄격)
 * @returns {boolean}
 */
export function hasRepresentativePhoto(user, opt = {}) {
  const { present, main } = pickMain(user);

  if (present) {
    if (!main) return false; // 필드가 '있는데' 값이 비었으면 없음
    const looksLikeUrl =
      /^(https?:)?\/\//i.test(main) || main.includes('/') || /\.(png|jpe?g|webp|gif)$/i.test(main);

    // URL이면 기본 아바타 제외
    if (looksLikeUrl) return !isDefaultAvatar(main);

    // URL이 아니면(예: 이미지 ID) 존재 자체로 인정
    return true;
  }

  // ── 여기까지 왔다면 main 계열 필드가 '아예 응답에 없음' (API 프로젝션 누락 방지용 보조 판정)
  if (opt.failClose) return false; // 엄격 모드: 보조 판정 끄기

  const imgsLen = Array.isArray(user?.profileImages) ? user.profileImages.length : 0;
  const ic = Number.isFinite(user?.imagesCount) ? (user.imagesCount | 0) : 0;
  const pc = Number.isFinite(user?.photoCount) ? (user.photoCount | 0) : 0;
  return imgsLen > 0 || ic > 0 || pc > 0;
}

/**
 * 단방향 필터
 * - me.search_onlyWithPhoto 가 ON이면 대표사진 있는 유저만 반환
 * - OFF면 그대로 반환
 */
export function filterByPhotoSimple(users, me, opt = {}) {
  const list = Array.isArray(users) ? users : [];
  const only = normalizeOn(me?.search_onlyWithPhoto);
  if (!only) return list.slice();
  return list.filter(u => hasRepresentativePhoto(u, opt));
}

/** 레거시 호환(기존 체인이 filterByPhotoCo를 호출하는 경우 대비) */
export const filterByPhotoCo = filterByPhotoSimple;

/** 레거시 호환(규칙 함수) */
export function passMyPhotoRule(me, other, opt = {}) {
  const only = normalizeOn(me?.search_onlyWithPhoto);
  return !only || hasRepresentativePhoto(other, opt);
}
