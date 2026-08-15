// src/controllers/admin/betaMigration.controller.js
// ────────────────────────────────────────────────────────────
// 베타→일반회원 일괄 전환 컨트롤러: 권한가드 + 응답 조립.
// 실제 로직은 services/admin/betaMigrationService.js가 담당한다.
// ────────────────────────────────────────────────────────────

const { previewMigration, executeMigration, healthInfo } = require('@/services/admin/betaMigrationService');

// ───────────────────────────────────────────────
// 간단 인증/권한 가드 (프로젝트 상황에 맞게 교체 가능)
// ───────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.user) return next();
  return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
}
function requireMaster(req, res, next) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'master') return next();
  return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
}

async function preview(req, res) {
  try {
    const result = await previewMigration();
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[admin:migration:preview] error:', err);
    return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
}

async function execute(req, res) {
  try {
    const dryRun = !!req.body?.dryRun;
    const result = await executeMigration(dryRun);
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[admin:migration:execute] error:', err);
    return res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
  }
}

function health(req, res) {
  return res.json({ ok: true, ...healthInfo() });
}

module.exports = { requireAuth, requireMaster, preview, execute, health };
