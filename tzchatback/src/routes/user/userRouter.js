// src/routes/user/userRouter.js
// base: /api
// -------------------------------------------------------------
// 👤 사용자 프로필/설정 라우터 — 실제 로직은 controllers/userProfile.controller.js에 있다 (지침 §1).
// - index.js 에서 app.use('/api', ...)로 마운트됨 → 내부 경로에 /api 금지
// -------------------------------------------------------------
const express = require('express');
const authMiddleware = require('@/middlewares/authMiddleware');
const controller = require('@/controllers/userProfile.controller');

const router = express.Router();

// 공통 인증·계정 상태 검증 + 라우터 전용 로깅
router.use(authMiddleware, controller.requestLogger);

router.put('/update-nickname', controller.patchNickname);
router.patch('/user/region', controller.patchRegion);
router.put('/update-selfintro', controller.patchSelfintro);
router.patch('/user/preference', controller.patchPreference);
router.patch('/user/marriage', controller.patchMarriage);

module.exports = router;
