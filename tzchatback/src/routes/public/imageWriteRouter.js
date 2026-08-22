// routes/public/imageWriteRouter.js
// base: /api
// -------------------------------------------------------------
// 📷 프로필 이미지 업로드·삭제 라우터 — 실제 로직은 controllers/public/imageWrite.controller.js에 있다 (지침 §1).
// - POST   /api/profile/images         : 업로드(avatar|gallery) → 중앙 크롭 + 3종 리사이즈
// - DELETE /api/profile/images/:id     : 삭제(파일·DB·대표 후속)
// - ✅ DB에는 상대(/uploads/...) 저장, 응답은 절대 URL로 정규화
// - ✅ updateOne + runValidators:false 로 원자적 반영
// - ✅ 업로드 루트: 프로젝트 루트(기본), ENV로 오버라이드
// -------------------------------------------------------------

const express = require('express');

const authMiddleware = require('@/middlewares/authMiddleware');
const controller = require('@/controllers/public/imageWrite.controller');

const router = express.Router();
router.use(authMiddleware);

router.post('/profile/images', controller.uploadProfileImages, controller.create);
router.delete('/profile/images/:id', controller.remove);

module.exports = router;
