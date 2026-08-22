// /routes/system/pushRouter.js
// base: /api/push
// -------------------------------------------------------------
// ✅ 디바이스 토큰 등록/삭제 라우터 — 실제 로직은 controllers/system/push.controller.js에 있다 (지침 §1).
// - 내부 라우터 경로에 /api 사용 금지 (index.js에서 /api/push 로 마운트)
// -------------------------------------------------------------
const express = require('express');

const authMiddleware = require('@/middlewares/authMiddleware');
const controller = require('@/controllers/system/push.controller');

const router = express.Router();
// 공통 인증에서 로그인과 계정 상태를 함께 검증한다.
router.use(authMiddleware);
router.use(controller.requestLogger);

router.post('/register', controller.register);
router.post('/unregister', controller.unregister);

module.exports = router;
