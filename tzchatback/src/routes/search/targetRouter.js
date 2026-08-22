// src/routes/search/targetRouter.js
// base: /api
// -------------------------------------------------------------
// 🔎 검색/추천 질의 전용 라우터 — 실제 로직은 controllers/search/targetSearch.controller.js에 있다 (지침 §1).
// - POST /api/search/users     : 조건 검색
// - GET  /api/search/targets   : 추천 후보(원천 리스트)
// -------------------------------------------------------------
const express = require('express');
const authMiddleware = require('@/middlewares/authMiddleware');
const controller = require('@/controllers/search/targetSearch.controller');

const router = express.Router();
router.use(authMiddleware, controller.requestLogger);

router.post('/search/users', controller.postSearchUsers);
router.get('/search/targets', controller.getTargets);

router.use(controller.errorHandler);

module.exports = router;
