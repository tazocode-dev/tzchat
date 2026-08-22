// src/services/userProfileService.js
// ────────────────────────────────────────────────────────────
// 사용자 프로필 필드 업데이트 도메인 서비스 (지침 §1). routes/user/userRouter.js에서 분리.
// ────────────────────────────────────────────────────────────

const { User } = require('@/models');
const { requireCurrentActiveOptIn } = require('@/services/legal/termsPublicService');
const { validateUserGeneratedText } = require('@/services/system/ugcContentPolicyService');

class ProfileError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function updateNickname(userId, nickname) {
  const trimmedNickname = validateUserGeneratedText(nickname, { field: 'nickname' });

  // 중복 닉네임 검사 (본인 제외)
  const existing = await User.findOne({ nickname: trimmedNickname }).select('_id').lean();
  if (existing && String(existing._id) !== String(userId)) {
    throw new ProfileError(409, '중복된 닉네임입니다.');
  }

  await User.findByIdAndUpdate(userId, { nickname: trimmedNickname });
}

async function updateRegion(userId, region1, region2) {
  if (!region1 || !region2) {
    throw new ProfileError(400, '잘못된 요청: region1, region2가 필요합니다.');
  }
  await User.findByIdAndUpdate(userId, { region1, region2 });
  return { region1, region2 };
}

async function updateSelfintro(userId, selfintroRaw) {
  const selfintro = validateUserGeneratedText(selfintroRaw, { field: 'selfintro' });

  const user = await User.findByIdAndUpdate(userId, { selfintro }, { new: true });
  if (!user) throw new ProfileError(404, '사용자 없음');
  return user.selfintro;
}

// ※ 기존 동기화 규칙 유지:
//   - '이성친구'로 시작하면 search_preference = '이성친구 - 전체'
//   - '동성친구'로 시작하면 search_preference = '동성친구 - 전체'
async function updatePreference(userId, preferenceRaw, dependencies = {}) {
  const prefStr = String(preferenceRaw ?? '').trim();
  if (!prefStr) throw new ProfileError(400, '값이 부족합니다.');

  const requireOptIn = dependencies.requireCurrentActiveOptIn || requireCurrentActiveOptIn;
  await requireOptIn(userId, 'sensitive-information-consent', dependencies);

  const updateDoc = { preference: prefStr };
  if (prefStr.startsWith('이성친구')) {
    updateDoc.search_preference = '이성친구 - 전체';
  } else if (prefStr.startsWith('동성친구')) {
    updateDoc.search_preference = '동성친구 - 전체';
  }

  const UserModel = dependencies.UserModel || User;
  const user = await UserModel.findByIdAndUpdate(userId, updateDoc, { new: true });
  if (!user) throw new ProfileError(404, '사용자 없음');
  return { preference: user.preference, search_preference: user.search_preference };
}

async function updateMarriage(userId, marriageRaw) {
  const raw = (marriageRaw || '').toString().trim();
  const ALLOWED = ['미혼', '기혼', '돌싱'];
  if (!ALLOWED.includes(raw)) {
    throw new ProfileError(400, 'marriage must be one of 미혼/기혼/돌싱');
  }

  const updated = await User.findByIdAndUpdate(userId, { marriage: raw }, { new: true })
    .select('marriage updatedAt')
    .lean();
  if (!updated) throw new ProfileError(404, '사용자 없음');
  return { marriage: updated.marriage, updatedAt: updated.updatedAt };
}

module.exports = {
  ProfileError,
  updateNickname,
  updateRegion,
  updateSelfintro,
  updatePreference,
  updateMarriage,
};
