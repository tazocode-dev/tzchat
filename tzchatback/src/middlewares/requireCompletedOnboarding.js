const { isProfileOnboardingComplete, buildStatus } = require('@/services/onboardingService');
const { getRequireConsent } = require('@/services/legal/termsPublicService');

function createRequireCompletedOnboarding(dependencies = {}) {
  const resolveRequiredConsent = dependencies.getRequireConsent || getRequireConsent;

  return async function requireCompletedOnboarding(req, res, next) {
    // master는 기존 운영 정책상 약관·프로필 온보딩을 우회한다.
    if (String(req.user?.role || '').toLowerCase() === 'master') return next();

    try {
      // 프론트 UX와 동일하게 필수 약관을 출생연도·성별보다 먼저 완료한다.
      const agreement = await resolveRequiredConsent(req.user?._id);
      if (agreement?.needReconsent) {
        return res.status(403).json({
          ok: false,
          code: 'AGREEMENTS_REQUIRED',
          message: '필수 약관에 먼저 동의해 주세요.',
          requiredSlugs: agreement.requiredSlugs || [],
        });
      }

      if (isProfileOnboardingComplete(req.user)) return next();

      return res.status(403).json({
        ok: false,
        code: 'ONBOARDING_REQUIRED',
        message: '필수 기본 정보를 먼저 입력해 주세요.',
        onboarding: buildStatus(req.user),
      });
    } catch (error) {
      return next(error);
    }
  };
}

const requireCompletedOnboarding = createRequireCompletedOnboarding();

module.exports = requireCompletedOnboarding;
module.exports.createRequireCompletedOnboarding = createRequireCompletedOnboarding;
