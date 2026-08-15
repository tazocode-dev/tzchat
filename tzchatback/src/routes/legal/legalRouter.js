// routes/legal/legalRouter.js
// base: /api/legal
// -----------------------------------------------
// 법적 동의(레거시/공식) 라우터 — 실제 로직은 controllers/legal/legal.controller.js에 있다 (지침 §1).
// -----------------------------------------------
const express = require('express');
const router = express.Router();

const requireLogin = require('@/middlewares/requireLogin');
const controller = require('@/controllers/legal/legal.controller');

// GET /api/legal/consents/required — 활성 필수/선택 동의 항목 목록
router.get('/consents/required', controller.requiredConsents);

// POST /api/legal/consents/agree — 동의 저장(필수/선택 공통)
router.post('/consents/agree', requireLogin, controller.postConsentsAgree);

// GET /api/legal/agreements/me — 내 동의 현황 조회
router.get('/agreements/me', requireLogin, controller.myAgreements);

// POST /api/legal/agreements/me/consent — (하위호환) 동의하기
router.post('/agreements/me/consent', requireLogin, controller.postMyConsentLegacy);

// GET /api/legal/agreements/me/status — 필수 재동의 목록(pending) + 선택 동의 현황(optional)
router.get('/agreements/me/status', requireLogin, controller.myAgreementStatus);

module.exports = router;
