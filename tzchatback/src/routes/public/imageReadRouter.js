// routes/public/imageReadRouter.js
// base: /api
// -------------------------------------------------------------
// 📷 프로필 이미지 조회·대표지정 라우터 — 실제 로직은 controllers/public/imageRead.controller.js에 있다 (지침 §1).
// - GET  /api/profile/images                 : 내 이미지 목록
// - GET  /api/users/:id/profile/images       : 상대 이미지 목록
// - PUT  /api/profile/main                   : 대표 사진 지정
// - ✅ 응답 시 이미지 URL 절대경로로 정규화(혼합콘텐츠 방지)
// -------------------------------------------------------------

const express = require('express');
const authMiddleware = require('@/middlewares/authMiddleware');
const controller = require('@/controllers/public/imageRead.controller');

const router = express.Router();
router.use(authMiddleware);

router.get('/profile/images', controller.listMine);
router.get('/users/:id/profile/images', controller.listOfUser);
router.put('/profile/main', controller.setMain);

module.exports = router;
