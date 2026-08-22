// src/controllers/admin/betaMigration.controller.js
// ────────────────────────────────────────────────────────────
// 베타→일반회원 일괄 전환 컨트롤러: 요청 검증과 응답 조립.
// 실제 로직은 services/admin/betaMigrationService.js가 담당한다.
// ────────────────────────────────────────────────────────────

const { previewMigration, executeMigration } = require('@/services/admin/betaMigrationService');

const BETA_MIGRATION_CONFIRMATION = 'BETA_TO_BASIC';

class BetaMigrationRequestError extends Error {
  constructor(code, message) {
    super(message);
    this.status = 400;
    this.code = code;
  }
}

function parseExecutionRequest(body) {
  if (!body || typeof body.dryRun !== 'boolean') {
    throw new BetaMigrationRequestError(
      'INVALID_MIGRATION_MODE',
      'dryRun은 boolean 값이어야 합니다.',
    );
  }
  if (body.dryRun === false && body.confirmation !== BETA_MIGRATION_CONFIRMATION) {
    throw new BetaMigrationRequestError(
      'MIGRATION_CONFIRMATION_REQUIRED',
      `실제 전환을 실행하려면 ${BETA_MIGRATION_CONFIRMATION} 확인 문구가 필요합니다.`,
    );
  }
  return { dryRun: body.dryRun };
}

async function preview(req, res, dependencies = {}) {
  try {
    const runPreview = dependencies.previewMigration || previewMigration;
    const result = await runPreview();
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[admin:migration:preview] failed', { name: err?.name, code: err?.code, message: err?.message });
    return res.status(500).json({ ok: false, code: 'MIGRATION_INTERNAL_ERROR', message: '마이그레이션 미리보기에 실패했습니다.' });
  }
}

async function execute(req, res, dependencies = {}) {
  try {
    const { dryRun } = parseExecutionRequest(req.body);
    const runMigration = dependencies.executeMigration || executeMigration;
    const result = await runMigration(dryRun);
    return res.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof BetaMigrationRequestError) {
      return res.status(err.status).json({ ok: false, code: err.code, message: err.message });
    }
    console.error('[admin:migration:execute] failed', { name: err?.name, code: err?.code, message: err?.message });
    return res.status(500).json({ ok: false, code: 'MIGRATION_INTERNAL_ERROR', message: '마이그레이션 실행에 실패했습니다.' });
  }
}

module.exports = {
  BETA_MIGRATION_CONFIRMATION,
  BetaMigrationRequestError,
  execute,
  parseExecutionRequest,
  preview,
};
