const express = require('express');
const authMiddleware = require('@/middlewares/authMiddleware');
const controller = require('@/controllers/system/report.controller');

const router = express.Router();

router.post('/reports', authMiddleware, controller.create);

module.exports = router;
