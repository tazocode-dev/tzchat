// src/routes/search/contactsRouter.js
// base: /api
// -------------------------------------------------------------
// 📞 연락처 해시 관리 라우터 — 실제 로직은 controllers/search/contacts.controller.js에 있다 (지침 §1).
// - POST   /api/contacts/hashes   : 내 연락처 해시 업로드/덮어쓰기
// - DELETE /api/contacts/hashes   : 내 연락처 해시 삭제 + 스위치 OFF (보조)
// -------------------------------------------------------------

const express = require('express');
const requireLogin = require('@/middlewares/authMiddleware');
const blockIfPendingDeletion = require('@/middlewares/blockIfPendingDeletion');
const controller = require('@/controllers/search/contacts.controller');

const router = express.Router();
router.use(requireLogin, blockIfPendingDeletion, controller.requestLogger);

router.post('/contacts/hashes', controller.postHashes);
router.delete('/contacts/hashes', controller.deleteHashes);

router.use(controller.errorHandler);

module.exports = router;
