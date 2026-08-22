// src/routes/admin/adminRouter.js
// base: /api/admin
// -----------------------------------------------
// 관리자 서버/시스템 모니터링 라우터 — 실제 로직은 controllers/admin/adminMonitor.controller.js에 있다 (지침 §1).
// 권한: authMiddleware + master 권한 체크
//
// ⚠️ 정리: 이 파일은 예전에 users/chatrooms/reports/notices/stats/config 등
// 훨씬 많은 라우트를 가지고 있었던 흔적(관련 모델 import, 안 쓰이는 logAdminAction
// 헬퍼, "이하 나머지 라우트도 동일하게..." 주석)이 남아있었지만, 실제로 등록된
// 라우트는 heartbeat/db-ping/online/logs 4개뿐이었다. 쓰이지 않는 모델 import와
// 죽은 헬퍼 함수를 제거했다(동작 변경 없음 - 애초에 아무 데서도 호출되지 않던 코드).
// -----------------------------------------------
const express = require('express');
const router = express.Router();

const authMiddleware = require('@/middlewares/authMiddleware');
const controller = require('@/controllers/admin/adminMonitor.controller');
const reportController = require('@/controllers/admin/adminReport.controller');
const userModerationController = require('@/controllers/admin/userModeration.controller');

router.use(authMiddleware, controller.requireMaster, controller.requestLogger);

router.get('/heartbeat', controller.heartbeat);
router.get('/db-ping', controller.dbPing);
router.get('/online', controller.online);
router.get('/logs', controller.logs);
router.get('/users', controller.users);
router.patch('/users/:id/suspension', userModerationController.updateSuspension);
router.get('/reports', reportController.list);
router.patch('/reports/:id/status', reportController.updateStatus);
router.post('/push/test', controller.pushTest);

module.exports = router;
