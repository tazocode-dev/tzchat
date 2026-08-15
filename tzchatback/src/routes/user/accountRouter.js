// src/routes/user/accountRouter.js
// base: /api
// ------------------------------------------------------
// 내 계정 중심 라우터 — 실제 로직은 controllers/account.controller.js에 있다 (지침 §1).
// - GET /me           (현재 사용자와 스피드 매칭 상태 포함)
// - GET /my-friends   (친구 ID 목록)
// - PUT /update-password
// ------------------------------------------------------

const express = require('express');
const controller = require('@/controllers/account.controller');
const onboardingController = require('@/controllers/onboarding.controller');
const verificationController = require('@/controllers/accountVerification.controller');
const authMiddleware = require('@/middlewares/authMiddleware');
const requireCompletedOnboarding = require('@/middlewares/requireCompletedOnboarding');

const router = express.Router();

router.get('/me', controller.authFromJwtOrSession, controller.me);
router.get('/onboarding/status', controller.authFromJwtOrSession, onboardingController.status);
router.patch('/onboarding/birth-year', controller.authFromJwtOrSession, onboardingController.birthYear);
// 이전 앱 버전의 생년월일 요청은 호환을 위해 유지한다.
router.patch('/onboarding/birth-date', controller.authFromJwtOrSession, onboardingController.birthDate);
router.patch('/onboarding/gender', controller.authFromJwtOrSession, onboardingController.gender);
router.get('/my-friends', authMiddleware, requireCompletedOnboarding, controller.myFriends);
router.put('/update-password', controller.authFromJwtOrSession, controller.updatePassword);
router.post('/account-verification/email/request', controller.authFromJwtOrSession, verificationController.requestEmail);
router.post('/account-verification/email/commit', controller.authFromJwtOrSession, verificationController.commitEmail);
router.post('/account-verification/phone/email/request', controller.authFromJwtOrSession, verificationController.requestPhoneEmail);
router.post('/account-verification/phone/sms/request', controller.authFromJwtOrSession, verificationController.requestPhoneSms);
router.post('/account-verification/phone/commit', controller.authFromJwtOrSession, verificationController.commitPhone);

module.exports = router;
