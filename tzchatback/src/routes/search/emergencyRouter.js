// src/routes/search/emergencyRouter.js
// base: /api
// -------------------------------------------------------------
// 스피드 매칭 라우터 — 실제 로직은 controllers/search/emergencyMode.controller.js에 있다.
// -------------------------------------------------------------
const express = require('express');
const blockIfPendingDeletion = require('@/middlewares/blockIfPendingDeletion');
const controller = require('@/controllers/search/emergencyMode.controller');

const router = express.Router();
router.use(controller.ensureAuth, blockIfPendingDeletion, controller.syncEmergencyExpiration);

router.put('/emergencyon', controller.putOn);
router.put('/emergencyoff', controller.putOff);
router.get('/emergencyusers', controller.getList);
router.post('/search/emergencyusers', controller.postFilter);

module.exports = router;
