// src/controllers/membership/membership.controller.js
// ────────────────────────────────────────────────────────────
// 멤버십 플랜 조회 컨트롤러: 요청 파싱 + 응답 조립.
// 실제 로직은 services/membership/membershipService.js가 담당한다.
// ────────────────────────────────────────────────────────────

const { getPlans, getHealth } = require('@/services/membership/membershipService');

function plans(req, res) {
  try {
    // 캐시 방지(임시 페이지 정책/문구 변경 시 즉시 반영 목적)
    res.setHeader('Cache-Control', 'no-store');

    // 성별 결정: ?gender=male|female → 없으면 req.user.gender → 기본 male
    const genderParam = req.query.gender || (req.user && req.user.gender) || '';
    const data = getPlans(genderParam);

    return res.json({ ok: true, ...data });
  } catch (err) {
    console.error('[membership/plans] error:', err);
    return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
}

function health(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.json({ ok: true, ...getHealth() });
}

module.exports = { plans, health };
