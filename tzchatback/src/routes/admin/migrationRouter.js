/**
 * 관리자 전용 마이그레이션 라우터 — 실제 로직은 controllers/admin/betaMigration.controller.js에 있다 (지침 §1).
 * ------------------------------------------------------------
 * 베타 종료 시점에 '베타회원' → '일반회원' 일괄 전환
 *
 * 엔드포인트:
 *   - GET  /api/admin/migration/beta-to-basic/preview
 *       → 대상 건수만 조회 (dry-run)
 *   - POST /api/admin/migration/beta-to-basic
 *       body: { dryRun: true } 또는
 *             { dryRun: false, confirmation: 'BETA_TO_BASIC' }
 *       → 명시적으로 확인된 실제 업데이트 또는 안전한 dry-run
 *
 * 주의:
 *   - 공통 인증과 DB 기반 master 권한 검사를 통과한 관리자만 접근 가능
 *   - 실행 전 반드시 백업 권장
 */

const express = require('express');
const router = express.Router();
const controller = require('@/controllers/admin/betaMigration.controller');
const authMiddleware = require('@/middlewares/authMiddleware');
const requireMaster = require('@/middlewares/requireMaster');

// JWT payload나 클라이언트 응답값의 role을 신뢰하지 않고 매 요청마다 DB 권한을 확인한다.
router.use(authMiddleware, requireMaster);
router.get('/migration/beta-to-basic/preview', controller.preview);
router.post('/migration/beta-to-basic', controller.execute);

module.exports = router;
