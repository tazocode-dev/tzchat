// src/routes/search/searchingRouter.js
// base: /api
// -------------------------------------------------------------
// 🔧 검색 설정 전용 라우터 — 실제 로직은 controllers/search/searchSettings.controller.js에 있다 (지침 §1).
// - PATCH /api/search/year
// - PATCH /api/search/regions
// - PATCH /api/search/preference
// - PATCH /api/search/settings
// - PATCH /api/search/marriage
// -------------------------------------------------------------
const express = require('express');
const authMiddleware = require('@/middlewares/authMiddleware');
const controller = require('@/controllers/search/searchSettings.controller');

const router = express.Router();
router.use(authMiddleware, controller.requestLogger);

router.patch('/search/year', controller.patchYear);
router.patch('/search/regions', controller.patchRegions);
router.put('/search/regions', controller.patchRegions);
router.patch('/search/preference', controller.patchPreference);
router.patch('/search/settings', controller.patchSettings);
router.patch('/search/marriage', controller.patchMarriage);

router.use(controller.errorHandler);

module.exports = router;
