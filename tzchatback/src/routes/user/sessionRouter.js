// src/routes/user/sessionRouter.js
// base: /api
// ------------------------------------------------------
// 세션/토큰 전담 라우터 — 실제 로직은 controllers/session.controller.js에 있다 (지침 §1).
// - 로그인 / 로그아웃 / 토큰 갱신 / 하위호환 /userinfo
// ------------------------------------------------------

const express = require('express');
const controller = require('@/controllers/session.controller');

const router = express.Router();

router.post('/login', controller.login);
router.post('/logout', controller.logout);
router.post('/token/refresh', controller.refreshToken);
router.get('/userinfo', controller.userinfo);

module.exports = router;
