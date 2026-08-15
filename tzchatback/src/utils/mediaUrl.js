// src/utils/mediaUrl.js
// ────────────────────────────────────────────────────────────
// 채팅 관련 라우터(chatRoomRouter.js, chatMessageRouter.js)가 각자 동일하게
// 복사해 갖고 있던 미디어 URL 절대경로 정규화 유틸을 공통 모듈로 통합했다
// (지침: 공통 로직 중복 금지).
// ────────────────────────────────────────────────────────────

function getPublicBaseUrl() {
  const origin = String(process.env.PUBLIC_API_ORIGIN || '').trim();
  if (!origin) throw new Error('PUBLIC_API_ORIGIN이 설정되지 않았습니다.');
  return origin.replace(/\/+$/, '');
}
function toAbsoluteMediaUrl(u, req) {
  if (!u) return u;
  const base = getPublicBaseUrl(req);

  if (/^https?:\/\//i.test(u)) {
    try {
      const url = new URL(u);
      if (url.pathname.startsWith('/uploads/')) {
        return new URL(`${url.pathname}${url.search}${url.hash}`, `${base}/`).toString();
      }
      return u;
    } catch { /* fallthrough */ }
  }

  const rel = u.startsWith('/') ? u : `/${u}`;
  return `${base}${rel}`;
}
function normalizeUserPhotos(user, req) {
  if (!user || typeof user !== 'object') return user;
  const out = { ...user };
  if (out.profile && typeof out.profile === 'object') {
    if (out.profile.mainUrl) out.profile.mainUrl = toAbsoluteMediaUrl(out.profile.mainUrl, req);
  }
  if (out.profilePhotoUrl) out.profilePhotoUrl = toAbsoluteMediaUrl(out.profilePhotoUrl, req);
  if (out.photoUrl) out.photoUrl = toAbsoluteMediaUrl(out.photoUrl, req);
  if (Array.isArray(out.photos)) {
    out.photos = out.photos.map(p => {
      if (!p || typeof p !== 'object') return p;
      const np = { ...p };
      if (np.url) np.url = toAbsoluteMediaUrl(np.url, req);
      if (np.src) np.src = toAbsoluteMediaUrl(np.src, req);
      return np;
    });
  }
  return out;
}

module.exports = {
  getPublicBaseUrl,
  toAbsoluteMediaUrl,
  normalizeUserPhotos,
};
