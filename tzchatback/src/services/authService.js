// 인증된 사용자가 조회하는 사용자 목록 도메인 서비스.
// 신규 가입은 전화번호 문자 인증 흐름에서만 처리한다.

const { User } = require('@/models');
const { getBlockedUserIdSet, buildDiscoverableUserFilter } = require('@/services/chat/blockPolicyService');

async function listPublicUsers({ page: pageInput, limit: limitInput, requesterId }) {
  const page = Math.max(1, Number.parseInt(pageInput, 10) || 1);
  const limit = Math.min(200, Math.max(1, Number.parseInt(limitInput, 10) || 200));
  const blockedUserIds = await getBlockedUserIdSet(requesterId);
  const users = await User.find(buildDiscoverableUserFilter(requesterId, blockedUserIds))
    .select('username nickname birthyear gender region1 region2 preference selfintro')
    .skip((page - 1) * limit)
    .limit(limit);

  return { users, page, limit };
}

module.exports = { listPublicUsers };
