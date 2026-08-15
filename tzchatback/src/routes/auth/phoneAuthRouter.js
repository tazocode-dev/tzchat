const express = require('express');
const controller = require('@/controllers/auth/phoneAuth.controller');
const accountVerificationController = require('@/controllers/accountVerification.controller');

const router = express.Router();
router.post('/request', controller.request);
router.post('/verify', controller.verify);
router.post('/change/email/request', accountVerificationController.requestPublicPhoneChangeEmail);
router.post('/change/sms/request', accountVerificationController.requestPublicPhoneChangeSms);
router.post('/change/commit', accountVerificationController.commitPublicPhoneChange);

module.exports = router;
