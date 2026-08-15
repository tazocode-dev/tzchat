// models/index.js
const mongoose = require('mongoose');


//Chat
require('./Chat/ChatRoom');  //역할: 1:1 DM 방(또는 멀티) 자체를 표현. 마지막 메시지 캐시로 리스트 성능 최적화.
require('./Chat/Message');  //역할: 채팅 메시지(텍스트/이미지)와 읽음 상태 관리.

//Legal
require('./Legal/Terms');  //역할: 약관 동의
require('./Legal/UserAgreement');  //역할: 버전관리

//membership
require('./membership/MembershipOrder');  //역할: 멤버십 결제내역 (등급 구매 기록)

//Payment
require('./Payment/Payment');  //역할: 결제 / 구독 모델 뼈대

//Social
require('./Social/FriendRequest');  //역할: 친구 신청 흐름 관리(보냄/받음/수락/거절).

//System
require('./System/AdminLog');  //역할: 운영자 액션 감사 로그(승격/차단/삭제 등).
require('./System/AppConfig');  //역할: 런타임 키-값 설정 저장(기능 토글/수치 설정).
require('./System/Notice');  //역할: 공지사항(활성 기간/노출 제어 포함).
require('./System/UserDailyAgg'); // tzchat 프로젝트 - 사용자 일일 활동 집계(원천 지표)
require('./System/UserDailyScore'); // tzchat 프로젝트 - 사용자 일일 노출 점수(분배용)

//user
require('./User/User');  //역할: 회원 기본정보/프로필/검색조건/친구·차단/탈퇴 상태까지 아우르는 핵심 사용자 모델.
require('./User/DeviceToken'); //역할: 푸시용 디바이스 토큰 관리. 기기·플랫폼별 토큰 1건씩 추적.
require('./User/DeletionRequest'); //역할: 공개 웹폼 등에서 접수된 “계정 삭제 요청”의 로그/처리상태 보관.
require('./User/PointLog');  //역할: 포인트로그
require('./User/EmailVerification'); //역할: 이메일 인증번호(6자리) 해시 저장 + TTL 자동만료
require('./User/AccountVerification'); //역할: 로그인 후 이메일·전화번호 변경용 목적별 인증번호
require('./User/PhoneVerification'); //역할: 전화번호 로그인 인증번호 해시 저장 + TTL 자동만료




// 등록된 모델을 export (IDE 자동완성에 유리)
module.exports = {

  //Chat
  ChatRoom: mongoose.model('ChatRoom'),
  Message: mongoose.model('Message'),

  //membership
  MembershipOrder: mongoose.model('MembershipOrder'),

  //Payment
  Payment: mongoose.model('Payment'),

  //Social
  FriendRequest: mongoose.model('FriendRequest'),

  //System
  AdminLog: mongoose.model('AdminLog'),
  AppConfig: mongoose.model('AppConfig'),
  Notice: mongoose.model('Notice'),
  UserDailyAgg: mongoose.model('UserDailyAgg'),
  UserDailyScore: mongoose.model('UserDailyScore'),

  //User
  DeletionRequest: mongoose.model('DeletionRequest'),
  DeviceToken: mongoose.model('DeviceToken'),
  User: mongoose.model('User'),
  PointLog: mongoose.model('PointLog'),
  EmailVerification: mongoose.model('EmailVerification'),
  AccountVerification: mongoose.model('AccountVerification'),
  PhoneVerification: mongoose.model('PhoneVerification'),

  //Legal
  Terms: mongoose.model('Terms'),
  UserAgreement: mongoose.model('UserAgreement'),




};


/* Router 사용할때

const requireLogin = require('@/middlewares/authMiddleware');

// models/index.js 가 모든 모델을 export 한다는 가정

const {



  } = require('@/models');




*/
