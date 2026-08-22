// routes/index.js
module.exports = (app) => {
  // 요청 로그는 main.js의 공통 로거(method/path/status/response time) 하나로 통일했다.

  // ----------------------------------------------------------
  // ✅ Public / Open — 로그인 불필요 엔드포인트들을 "먼저" 마운트
  //    (catch-all 성격의 일반 /api 라우터보다 선행해야 합니다)
  // ----------------------------------------------------------

  // ✅ 전화번호 인증 로그인 (기본 인증 수단) — 비로그인 공개 엔드포인트
  app.use('/api/auth/phone', require('./auth/phoneAuthRouter'));

  // 기존 이메일 계정 호환용 공개 엔드포인트. 기본 로그인 화면에서는 사용하지 않는다.
  app.use('/api/auth/email', require('./auth/emailAuthRouter'));

  // 공개 약관/정책/공지
  app.use('/api/terms', require('./legal/termsPublicRouter'));   // 공개 약관/정책 조회, 버전 목록 등 (비인증)
  app.use('/api/legal', require('./legal/legalRouter'));         // 공개/동의 엔드포인트 혼재 (경로별 인증 구분)
  app.use('/api/notices', require('./system/noticeRouter'));     // 공개 공지사항

  // ----------------------------------------------------------
  // Admin (특정 경로를 일반 경로보다 먼저 마운트)
  // ----------------------------------------------------------
  app.use('/api/admin', require('./admin/termsRouter'));         // 관리자 전용 – 약관
  app.use('/api/admin', require('./admin/adminRouter'));         // 관리자 전용 – 시스템/유저/채팅/공지/통계/환경
  app.use('/api/admin', require('./admin/migrationRouter'));     // 관리자 전용 – migration

  // ----------------------------------------------------------
  // User / Auth / Profile 등 일반 /api 라우터 (인증 요구 가능)
  // ----------------------------------------------------------
  app.use('/api', require('./user/authRouter'));                 // 인증된 유저 목록
  app.use('/api', require('./user/accountRouter'));              // 내 계정 중심 라우터
  app.use('/api', require('./user/sessionRouter'));              // 세션/토큰 / 로그인 / 로그아웃

  // 온보딩 미완료 계정에게도 필요한 계정 상태/탈퇴는 게이트 전에 둔다.
  app.use('/api/account', require('./system/accountDeletionRouter')); // 회원 탈퇴

  // 메인 기능은 전화번호 로그인 후 출생연도·성별 입력이 완료된 계정만 접근한다.
  app.use('/api', require('@/middlewares/authMiddleware'), require('@/middlewares/requireCompletedOnboarding'));

  app.use('/api', require('./user/userRouter'));                 // 내 정보 수정(닉네임/지역/자기소개/특징)

  // public
  app.use('/api', require('./public/imageWriteRouter'));         // 프로필 이미지 업로드·리사이즈·목록·대표 지정·삭제
  app.use('/api', require('./public/imageReadRouter'));          // 프로필 이미지 조회, 대표지정

  // ----------------------------------------------------------
  // Chat / Social
  // ----------------------------------------------------------
  app.use('/api', require('./chat/chatRoomRouter'));             // 채팅방/메시지
  app.use('/api', require('./chat/chatMessageRouter'));          // 채팅방/메시지

  app.use('/api', require('./chat/friendRelationRouter'));       // 친구 목록 /삭제/ 차단/해제/ 유저상세
  app.use('/api', require('./chat/friendRequestManageRouter'));  // 친구 "신청 처리/목록" 전용 라우터
  app.use('/api', require('./chat/friendRequestSendRouter'));    // 친구 신청 발송 / 취소
  app.use('/api', require('./system/reportRouter'));              // 사용자 신고 접수

  // ----------------------------------------------------------
  // Search
  // ----------------------------------------------------------
  app.use('/api', require('./search/searchingRouter'));          // 검색 설정 전용 라우터
  app.use('/api', require('./search/targetRouter'));             // 검색/추천 질의 전용 라우터
  app.use('/api', require('./search/emergencyRouter'));          // 긴급모드 on/off, 잔여시간 계산 등
  app.use('/api', require('./search/contactsRouter'));           // 연락처

  // ----------------------------------------------------------
  // System
  // ----------------------------------------------------------
  app.use('/api/push', require('./system/pushRouter'));          // 푸시 디바이스 토큰 등록/해제
  // 초기 무료 운영 기간에는 멤버십·결제 API를 제공하지 않는다.
};
