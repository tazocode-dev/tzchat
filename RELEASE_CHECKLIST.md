# TZChat 출시 체크리스트

기준일: 2026-08-20

현재 앱 버전: `1.0.47` / Android·iOS build `47`

`[x]`는 현재 저장소에서 실제로 확인한 항목만 표시합니다. 서버 반영, 실기기, 스토어 작업은 아직 완료하지 않았으므로 체크하지 않습니다.

## 1. 저장소 자동 게이트

- [x] `tzchatapp`: `npm test` — 28개 파일, 127개 통과
- [x] `tzchatapp`: `npm run build:app` — 511개 모듈 production build, 58개 파일 검사, Android/iOS 자산 복사·일치 검증 통과
- [x] `@capacitor-community/contacts` 7.2.0을 Android/iOS에 동기화하고 iOS `limited` 부분 접근 회귀를 검증함
- [x] `tzchatback`: `npm test` — 234개 통과
- [x] `tzchatback`: `npm run build` — Node/JavaScript 구문·production 환경 검증 통과
- [x] 보호 라우트의 공통 `authMiddleware` DB 계정 상태 검증, 탈퇴 유예 예외·한국어 응답/UI, 정지·탈퇴 socket 해제를 검증함
- [x] Socket query token·익명 연결 차단과 legacy 로그인 일반화·실패 제한을 검증함
- [x] 연락처 요청의 64자리 SHA-256 hex·최대 2,000개·정규화·중복 제거·동의 경계를 검증함
- [x] 관리자 beta 전환·인덱스 마이그레이션·master 승격의 기본 dry-run과 명시적 실행 확인 경계를 검증함
- [x] 양쪽 `npm audit --omit=dev` — production 취약점 0개
- [x] 양쪽 `npm ls` — 종료 코드 0
- [x] 정적 release 설정 검사 통과
- [x] `git diff --check` — whitespace 오류 없음
- [ ] 출시할 commit/tag가 확정되었고 관계없는 작업 파일이 없음
- [x] 실제 `.env.*`, Android keystore·properties, 백엔드 서비스 계정 파일이 Git 비추적 상태임
- [x] Firebase Android/iOS 공개 클라이언트 설정은 앱 빌드에 필요한 Git 추적 대상임을 확인함

## 2. 서버 배포

### 사전 보존

- [ ] 현재 운영 commit, PM2 상태, 활성 Nginx vhost·인증서 경로를 기록함
- [ ] MongoDB 백업을 생성하고 복구 가능한 위치·보관 기간을 확인함
- [ ] `UPLOAD_ROOT` 전체를 백업하고 백엔드 서비스 계정의 읽기·쓰기 권한을 확인함
- [ ] 이전 `tzchatapp/dist`, 백엔드 소스·lockfile, Nginx 활성 설정을 롤백용으로 보존함

### 반영 순서

- [ ] 서버 Node.js가 22 이상임을 확인함: `node --version`
- [ ] `tzchatapp/.env.production`, `tzchatback/.env.production`, 저장소 외부 `FCM_SA_PATH`를 수동 반영함
- [ ] 프론트 의존성 고정 설치: `cd tzchatapp && npm ci`
- [ ] 프론트 운영 빌드: `npm run build`
- [ ] 백엔드 의존성 고정 설치: `cd tzchatback && npm ci --omit=dev`
- [ ] 백엔드 배포 게이트: `npm run build`
- [ ] 운영 DB 대상 약관 메타데이터 반영: `NODE_ENV=production npm run seed:terms`
- [ ] PM2 ecosystem 기준 신규 실행 또는 무중단 재적용: `npm run pm2:start` / `npm run pm2:reload`
- [ ] `deploy/nginx/tzchat.conf`를 운영 vhost에 반영함
- [ ] Nginx 구문 검사: `sudo nginx -t`
- [ ] 구문 통과 후에만 재적용: `sudo systemctl reload nginx`

### 반영 후 검증

- [ ] `pm2 status tzchatback`가 `online`이고 재시작 반복이 없음
- [ ] `https://tzchat.tazocode.com/`가 최신 밝은 테마·앱 `1.0.47`·최신 PWA manifest를 제공함
- [ ] `curl -fsS https://tzchat.tazocode.com/api/health`가 `{"ok":true}`만 반환함
- [ ] `curl -fsS 'https://tzchat.tazocode.com/socket.io/?EIO=4&transport=polling'`이 Engine.IO open packet을 반환함
- [ ] `/uploads/`의 기존 프로필·채팅 이미지가 정상 응답함
- [ ] `/debug/`가 404이고 `/api/`, `/socket.io/`, `/uploads/` 외 예상치 못한 proxy 경로가 없음
- [ ] 로그에 query, body, token, 사용자 식별자, provider raw payload가 남지 않음

## 3. Android 출시

- [x] 최종 `npm run build:app` 후 Android 자산이 production API를 가리킴
- [x] `cd tzchatapp/android && ./gradlew bundleRelease`로 fail-closed 서명이 적용된 release AAB를 생성함
- [x] `tzchatapp/android/app/build/outputs/bundle/release/app-release.aab`(5.2MB)의 `jarsigner` `jar verified`와 `versionName=1.0.47`, `versionCode=47`을 확인함
- [ ] release signing key·properties의 안전한 외부 백업과 복구 가능성을 확인함
- [ ] Play Console에서 서명, target SDK 36, 권한, Data safety, 계정 삭제 URL을 확인함
- [ ] 내부 테스트 트랙에 AAB를 올리고 실제 Play 설치본을 검증함

## 4. iOS 출시

- [x] iOS Simulator 대상 unsigned Release fresh build와 앱 `1.0.47`·build `47`, Contacts framework 포함을 확인함
- [ ] `tzchatapp/ios/App/App.xcworkspace`를 Xcode에서 열고 production 자산을 확인함
- [ ] Generic iOS Device 대상 Release Archive를 생성함
- [ ] archive의 marketing version `1.0.47`, build `47`, bundle ID, Distribution 서명·provisioning을 확인함
- [ ] Push Notifications entitlement, Background Modes/Remote notifications, APNs·FCM 연결을 확인함
- [ ] App Store Connect/TestFlight에 업로드하고 실제 TestFlight 설치본을 검증함

## 5. 실기기·통합 검증

- [ ] Android 실기기에서 일반 번호·심사용 번호의 문자 가입·로그인·재발송·만료·오답 횟수를 확인함
- [ ] iOS 실기기에서 동일한 문자 가입·로그인 흐름을 확인함
- [ ] 기존 이메일 계정 호환 로그인과 이메일 인증·변경을 실제 TZMail 수신으로 확인함
- [ ] Android/iOS 전경·배경·종료 상태의 FCM 수신, 배지, 딥링크, 로그아웃 토큰 해제를 확인함
- [ ] 연락처 권한 거부·허용, 해시 업로드, 지인 제외 ON/OFF, 동의 철회 후 삭제를 확인함
- [ ] 필수 4·선택 2 약관, 만 19세 성인, 성별 온보딩과 새로고침·앱 재실행 게이트를 확인함
- [ ] 두 계정으로 일반/스피드 매칭, 친구 신청, 채팅, 사진, 미읽음·NEW 상태를 확인함
- [ ] 프로필·채팅 신고, 양방향 차단, master 신고 처리·정지·해제를 확인함
- [ ] 탈퇴 신청, 14일 유예 안내, 취소, 만료 purge가 보존 데이터를 제외하고 완료되는지 확인함
- [ ] 프로필 사진 10MB 경계, 확장자·MIME 위장, 동시 3번째 사진을 실제 업로드로 확인함

## 6. 법적 문서·스토어 정책

- [x] `https://tazocode-dev.github.io/tazocode-legal/tzchat/terms.html` — HTTP 200 확인
- [x] `https://tazocode-dev.github.io/tazocode-legal/tzchat/privacy.html` — HTTP 200 확인
- [x] `https://tazocode-dev.github.io/tazocode-legal/tzchat/child-safety.html` — HTTP 200 확인
- [x] `https://tazocode-dev.github.io/tazocode-legal/tzchat/account-deletion.html` — HTTP 200 확인
- [ ] 배포된 `https://tazocode-dev.github.io/tazocode-legal/tzchat/privacy.html#sensitive`에 `sensitive` 앵커와 선택 동의 본문이 있음
- [ ] 앱의 4개 공개 문서·12개 slug 연결과 가입 동의 버전이 실제 배포본에서 일치함
- [ ] Apple App Privacy와 Google Play Data safety에 계정·인증, 프로필·사진, 연락처 해시, UGC·신고·차단, FCM, 장치·진단 데이터를 현재 구현과 일치시킴
- [ ] 개인정보 처리방침·계정 삭제·아동 안전 URL을 양 스토어 메타데이터에 반영함
- [ ] 콘텐츠 등급, 연락처·알림·사진 권한 설명, 심사용 계정·안내가 최신 빌드와 일치함
- [ ] 유료 멤버십·결제·광고를 제공하지 않는 초기 무료 정책이 스토어 설명과 스크린샷에 일치함

## 7. 롤백

- [ ] 롤백 기준 commit/tag, 이전 `dist`, 이전 백엔드 의존성·소스, 이전 Nginx 설정의 위치를 기록함
- [ ] PM2를 이전 commit으로 재적용하는 명령과 소요 시간을 확인함
- [ ] Nginx 롤백 후 `sudo nginx -t` 성공을 확인하고 reload하는 절차를 확인함
- [ ] DB 변경이 있는 배포는 호환성 여부와 복구 순서를 별도로 기록함
- [ ] Android staged rollout / iOS phased release 중지·이전 빌드 재배포 방법을 확인함
- [ ] 롤백 후 웹·health·Socket.IO·로그인·이미지·푸시 최소 점검을 반복함
