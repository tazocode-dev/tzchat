// backend/routes/auth/emailAuthRouter.js
// base: /api/auth/email
// -----------------------------------------------
// 이메일 인증 로그인 라우터 — 실제 로직은 controllers/auth/emailAuth.controller.js에 있다 (지침 §1).
// 비로그인 상태에서 호출되는 공개 엔드포인트이므로 인증 미들웨어를 걸지 않는다.
// -----------------------------------------------
const express = require('express');
const router = express.Router();

const controller = require('@/controllers/auth/emailAuth.controller');

router.post('/request', controller.request);
router.post('/verify', controller.verify);

module.exports = router;
