/**
 * 관리자 전용 마이그레이션 라우터 — 실제 로직은 controllers/admin/betaMigration.controller.js에 있다 (지침 §1).
 * ------------------------------------------------------------
 * 베타 종료 시점에 '베타회원' → '일반회원' 일괄 전환
 *
 * 엔드포인트:
 *   - GET  /api/admin/migration/beta-to-basic/preview
 *       → 대상 건수만 조회 (dry-run)
 *   - POST /api/admin/migration/beta-to-basic
 *       body: { dryRun?: boolean }
 *       → 실제 업데이트 또는 dry-run
 *
 * 주의:
 *   - 관리자만 접근 가능(아래 간단 가드 사용)
 *   - 실행 전 반드시 백업 권장
 */

const express = require('express');
const router = express.Router();
const controller = require('@/controllers/admin/betaMigration.controller');
const requireLogin = require('@/middlewares/requireLogin');
const requireMaster = require('@/middlewares/requireMaster');

// JWT payload나 클라이언트 응답값의 role을 신뢰하지 않고 매 요청마다 DB 권한을 확인한다.
router.use(requireLogin, requireMaster);
router.get('/migration/beta-to-basic/preview', controller.preview);
router.post('/migration/beta-to-basic', controller.execute);
router.get('/migration/health', controller.health);

module.exports = router;
