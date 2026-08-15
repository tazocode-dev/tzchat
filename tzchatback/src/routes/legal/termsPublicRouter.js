// routes/legal/termsPublicRouter.js
// base: /api/terms
// -----------------------------------------------
// 공개 약관/동의 라우터 — 실제 로직은 controllers/legal/termsPublic.controller.js에 있다 (지침 §1).
// -----------------------------------------------
const express = require('express');
const router = express.Router();

// ✅ 하이브리드 로그인 미들웨어
const requireLogin = require('@/middlewares/requireLogin');
const controller = require('@/controllers/legal/termsPublic.controller');

// ------------------------------
// 신규 표준 엔드포인트 (프론트 사용)
// ------------------------------

// GET /api/terms/active — 활성 문서 전체(페이지 + 동의서)
router.get('/active', controller.active);

// GET /api/terms/:slug/active — 특정 슬러그의 활성 문서(본문 포함)
router.get('/:slug/active', controller.activeBySlug);

// GET /api/terms/:slug/versions — 특정 슬러그의 모든 버전
router.get('/:slug/versions', controller.versions);

// POST /api/terms/consents — 단일 동의 저장/갱신 (로그인 필요)
router.post('/consents', requireLogin, controller.postConsent);

// GET /api/terms/agreements/list — 모든 활성 동의서 + 사용자 상태
router.get('/agreements/list', requireLogin, controller.agreementsList);

// GET /api/terms/agreements/status (별칭 /status) — 대기 중 항목 + 전체 현황
router.get(['/agreements/status', '/status'], requireLogin, controller.agreementsStatus);

// POST /api/terms/agreements/accept — 배치 저장
router.post('/agreements/accept', requireLogin, controller.agreementsAccept);

// -----------------------------------------
// 기존 호환 엔드포인트 (기존 프론트/앱 대비)
// -----------------------------------------

// GET /api/terms/latest
router.get('/latest', controller.latest);

// POST /api/terms/agree — 활성버전 일치 검증 + 메타 저장
router.post('/agree', requireLogin, controller.postAgree);

// GET /api/terms/require-consent
router.get('/require-consent', requireLogin, controller.requireConsent);

module.exports = router;
