// src/services/public/imageReadService.js
// ────────────────────────────────────────────────────────────
// 프로필 이미지 조회·대표지정 도메인 서비스 (지침 §1). routes/public/imageReadRouter.js에서 분리.
// ────────────────────────────────────────────────────────────

const { User } = require('@/models');
const { getPublicBaseUrl, toAbsoluteMediaUrl } = require('@/utils/mediaUrl');

class ImageReadError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const toAbsoluteUploadUrl = toAbsoluteMediaUrl;

function normalizeImages(images, req) {
  return (images || []).map(img => ({
    ...img,
    urls: {
      thumb:  toAbsoluteUploadUrl(img?.urls?.thumb  || '', req),
      medium: toAbsoluteUploadUrl(img?.urls?.medium || '', req),
      full:   toAbsoluteUploadUrl(img?.urls?.full   || '', req),
    }
  }));
}

// [1] 내 프로필 이미지 목록 조회
async function getMyImages(myId, req) {
  if (!myId) throw new ImageReadError(401, '로그인이 필요합니다.');

  const me = await User.findById(myId, { profileImages: 1, profileMain: 1 }).lean();
  if (!me) throw new ImageReadError(404, '사용자를 찾을 수 없습니다.');

  return {
    profileMain: me.profileMain || '',
    profileImages: normalizeImages(me.profileImages, req),
  };
}

// [2] 상대방 프로필 이미지 목록 조회
async function getUserImages(userId, req) {
  const user = await User.findById(userId, { profileImages: 1, profileMain: 1 }).lean();
  if (!user) throw new ImageReadError(404, '사용자를 찾을 수 없습니다.');

  return {
    profileMain: user.profileMain || '',
    profileImages: normalizeImages(user.profileImages, req),
  };
}

// [3] 대표 사진 지정
async function setMainImage(myId, imageId) {
  if (!myId) throw new ImageReadError(401, '로그인이 필요합니다.');
  if (!imageId) throw new ImageReadError(400, 'imageId가 필요합니다.');

  const me = await User.findById(myId, { profileImages: 1 }).lean();
  if (!me) throw new ImageReadError(404, '사용자를 찾을 수 없습니다.');

  const exists = (me.profileImages || []).some(img => String(img.id) === String(imageId));
  if (!exists) throw new ImageReadError(404, '해당 이미지가 존재하지 않습니다.');

  await User.updateOne(
    { _id: myId },
    { $set: { profileMain: imageId } },
    { runValidators: false }
  );

  return { profileMain: imageId };
}

module.exports = {
  ImageReadError,
  toAbsoluteUploadUrl,
  getPublicBaseUrl,
  getMyImages,
  getUserImages,
  setMainImage,
};
