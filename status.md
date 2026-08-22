# TZChat 현재 상태

마지막 실제 상태 확인일: 2026-08-20

이 문서는 과거 작업 로그가 아니라 현재 코드·설정·검증 결과에서 유효한 사실만 유지한다.

## 1. 프로젝트 개요

- 서비스: TZChat, 사용자 표시명 `손끝`
- 목적: 만 19세 이상 이용자 대상 데이팅·소셜 매칭
- 운영 형태: 1인 개발·운영
- 현재 단계: 저장소 기준 릴리스 후보 정비 완료, 최신 서버 배포·실기기·스토어 검증 대기
- 앱 버전: `1.0.47`
- Android `versionCode`: `47`
- iOS build: `47`
- 기준 저장소: `/Users/mac/tazocode/11017_tzchat/tzchat`

## 2. 정식 구조

```text
tzchat/
├── AGENTS.md
├── README.md
├── RELEASE_CHECKLIST.md
├── deploy/nginx/tzchat.conf
├── legal/
├── status.md
├── history.md
├── tzchatapp/
└── tzchatback/
```

- `tzchatapp`: Vue 3, TypeScript, Vite, Ionic 8, Capacitor 7, Pinia 클라이언트
- `tzchatback`: Node.js 22 이상, Express 5, MongoDB/Mongoose 8 백엔드
- `deploy/nginx/tzchat.conf`: 운영 Nginx 기준본
- `legal`: 별도 공개 저장소에 반영하기 전의 검토용 법적 문서

구조 참고 대상 `tzadmin`은 현재 공유 지침 문서 심볼릭 링크만 있고 비교할 실제 코드 트리가 없다. 따라서 현재 `tzchatapp` / `tzchatback` 경계를 이 프로젝트의 정식 구조로 유지한다.

## 3. 실행 환경

| 실행 형태 | 프론트 | 백엔드 | 상태 |
| --- | --- | --- | --- |
| 로컬 개발 | `http://localhost:11017` | `http://localhost:11018` | 코드·자동화 검증 완료 |
| 서버 웹 | `https://tzchat.tazocode.com` | 동일 도메인 `/api`, `/socket.io`, `/uploads` | TLS·Web/API/Socket.IO 응답 정상, 최신 번들 배포 필요 |
| Android/iOS | Capacitor 내장 번들 | 운영 HTTPS API | Android 로컬 서명 AAB·iOS Simulator unsigned Release 빌드 완료, 실기기·스토어 배포 미검증 |

- 로컬은 각 프로젝트의 `.env.development`, 운영은 `.env.production`, 백엔드 자동화는 `.env.test` 하나씩만 사용한다.
- 공통 `.env`는 사용하지 않고 실제 환경 파일과 자격증명은 Git에 커밋하지 않는다.
- 운영 API Origin은 `https://tzchat.tazocode.com`이다. Capacitor의 `https://localhost`는 Android WebView Origin이지 API 주소가 아니다.
- CORS는 개발 웹, 운영 웹, Android, iOS Origin을 환경별 exact allowlist로 검증한다.
- 백엔드는 PM2 ecosystem으로만 production 실행하고 환경값은 백엔드 `.env.production`에서 로드한다.

## 4. 실행·검증 명령

### 프론트

- 개발: `npm run dev`
- 전체 테스트: `npm test`
- 웹 빌드: `npm run build`
- Android/iOS 자산 복사 포함: `npm run build:app`
- 타입 검사와 production API·PWA 검증은 build에 포함된다.
- 별도 lint 스크립트는 없다.

### 백엔드

- 개발: `npm run dev`
- 전체 테스트: `npm test`
- production 구문·환경 게이트: `npm run build`
- 운영 실행/재적용: `npm run pm2:start`, `npm run pm2:reload`
- 약관 메타데이터: `NODE_ENV=production npm run seed:terms`
- 별도 lint 스크립트는 없다.

## 5. 현재 기능·정책

- 기본 가입·로그인은 전화번호 문자 인증이며, 이메일 인증은 기존 계정 호환과 인증정보 변경에 유지한다.
- 필수 약관 4개, 선택 동의 2개, 유효한 만 19세 이상 나이, 성별을 서버와 클라이언트 메인 진입 게이트에서 확인한다.
- 프로필, 일반 매칭, 매일 13~15시·21~23시 스피드 매칭, 친구, 채팅, 사용자별 미읽음·NEW 상태를 제공한다.
- 연락처 지인 제외는 현재 동의 버전을 요구하고, 최대 2,000개의 64자리 SHA-256 hex만 소문자로 정규화·중복 제거해 저장하며 철회 시 해시를 삭제한다.
- 민감정보 선택 동의는 구조화된 `preference`, `search_preference`에만 적용하고 철회 시 두 필드를 비운다.
- 초기 출시는 무료 서비스다. 프론트 멤버십·결제 화면/API와 백엔드 membership/payment/point 설정·route·controller·service 구현은 제거했다.
- 탈퇴 보존 정책에 필요한 `MembershipOrder`, `Payment` 모델과 모델 등록은 유지한다.
- AdMob과 Firebase Analytics의 직접 사용·네이티브 연결은 제거했다. FCM 푸시와 필요한 Firebase Core/Messaging은 유지한다.

## 6. 보안·UGC·계정 상태

- HTTP JWT는 Authorization 또는 명시한 token header에서만 읽고 URL query token은 무시한다.
- master 권한은 DB에서 로드한 `User.role=master`만 인정하고 request body·legacy 필드를 신뢰하지 않는다.
- 보호 라우트는 공통 `authMiddleware`가 매 요청마다 DB 계정 상태를 확인하며 정지, 탈퇴 유예, 삭제 계정을 차단한다. 단, 탈퇴 유예 안내에 필요한 `/me`와 탈퇴 상태 조회·취소만 제한적으로 허용하고 온보딩·비밀번호·인증정보·개인 동의 변경은 차단한다.
- Socket.IO는 handshake auth/header token 또는 검증된 세션만 허용하고 query token·익명 연결을 거부하며, 매 연결마다 사용자 DB 상태를 확인한다. 정지·탈퇴 신청 성공 시 해당 사용자의 기존 socket도 best-effort로 연결 해제한다.
- legacy 관리자 로그인은 계정 존재 여부와 비밀번호 오류를 같은 401 응답으로 처리하고, 15분 동안 IP+아이디 5회·IP 전체 30회 실패 제한과 정수 `Retry-After`가 있는 429 응답을 적용한다.
- 탈퇴 신청·상태·취소 API는 일관된 한국어 `code`·`message`·`error` 계약을 사용한다. 클라이언트는 탈퇴 유예 응답을 밝은 테마의 전용 안내 화면으로 보내고 정지·삭제 응답에서는 저장된 인증정보를 정리한 뒤 로그인 화면으로 이동한다.
- UGC는 닉네임·소개·친구 신청·채팅 저장 전 허용 형식·길이·금지어를 검증한다.
- 프로필·채팅 신고, 양방향 차단, master 신고 상태 처리·사용자 정지·해제·운영 로그가 구현되어 있다.
- 탈퇴는 14일 유예 후 재시도 가능한 purge가 추가 데이터와 파일을 정리하고, 법적·운영 보존 대상은 분리한다.
- master 전용 정적 `admin-test` 탭·route·페이지와 사용자 등급을 수정하던 hidden grade API·route·controller·service는 출시 표면에서 제거했다.

## 7. 이미지 업로드

- 애플리케이션 이미지 제한은 10MB, Nginx 요청 제한은 multipart overhead를 고려한 12MB이다.
- 확장자·MIME·실제 decode 형식, 픽셀 상한, traversal을 검증하고 최종 JPEG로 재인코딩하며 실패 시 임시 파일을 정리한다.
- 프로필 신규 업로드는 최대 2장이며, 사전 개수 검사와 원자적 DB 조건으로 동시 요청을 차단한다. 기존 3장 이상 데이터는 임의로 삭제하지 않는다.
- `UPLOAD_ROOT`는 최종 저장소, `UPLOAD_TEMP_ROOT`는 임시 저장소다. 상세 기준은 `tzchatback/docs/deployment-environments.md`에 있다.

## 8. 네이티브·PWA

- Android/iOS/Capacitor 설치 표시명은 `손끝`이고 package/bundle ID는 `com.tazocode.tzchat`이다.
- Capacitor WebView는 HTTPS scheme, `cleartext=false`, 밝은 테마 Keyboard style을 사용한다.
- Android는 target/compile SDK 36, 연락처 읽기 권한만 사용하며 앱 데이터 cloud backup·device transfer를 차단한다.
- 연락처 플러그인은 Capacitor 7 호환 `@capacitor-community/contacts` 7.2.0이며, iOS의 `limited`를 사용자가 선택한 연락처에 대한 부분 접근으로 허용한다. 7.2.0 네이티브 구현을 동기화한 Simulator 빌드에서 연락처 플러그인 경고 없이 컴파일된다.
- Android/iOS/Web 푸시는 FCM registration token으로 통일했고, 알림 설정·무효 토큰 정리·허용된 딥링크를 서버와 클라이언트에서 검증한다.
- PWA manifest는 standalone, 밝은 theme/background, 실제 PNG 아이콘을 사용한다. 서비스 워커는 검증된 MongoDB 채팅방 ID만 딥링크에 사용하고 운영 로그를 남기지 않는다.

## 9. 파일·의존성 정리

- 페이지·모달·필터는 `AllUsersPage`, `TargetSearchPage`, `SearchAgeRangeEditModal`, `SearchRegionsEditModal`, `SpeedMatchToggle`, `normalSearchFilter`, `speedSearchFilter` 등 역할 기반 영문 이름으로 정리했다.
- 미참조 샘플·더미·오타 중복 파일과 빈 소스·테스트 디렉터리, Android 예제 테스트, 사용하지 않는 ESLint/Cypress 골격, 중복 Nginx 파일을 제거했다.
- 중복되고 모델 경로가 잘못된 beta 전환 스크립트와 legacy 인증·탈퇴 차단 middleware를 제거했다. 유지하는 운영 마이그레이션·master 승격 도구는 기본 dry-run이며 실제 변경에는 명시적인 apply 또는 확인 문구가 필요하다.
- 프론트·백엔드 package는 Node.js 22 이상을 명시하고 백엔드는 비공개 패키지(`private:true`)로 설정했다.
- root 심볼릭 링크·`.DS_Store`를 정리했고, OS 잔여물·로컬 `tzadmin`·Android release 산출물은 Git에서 제외한다.
- 실제 `.env` 파일, Android keystore·properties, 백엔드 서비스 계정 파일은 Git 비추적 상태다. Firebase Android/iOS 공개 클라이언트 설정은 앱 빌드에 필요한 추적 대상이다.
- 프론트·백엔드 production 의존성 audit 결과는 각각 취약점 0개다.

## 10. 운영 로그·공개 응답

- production에서 프론트·백엔드 routine `log/info/debug`를 차단하고, warning/error는 토큰·이메일·전화번호·ID·IP·query·raw payload를 정제한다.
- HTTP access 로그는 method, route path, status, duration만 남긴다.
- `/api/health`는 `{"ok":true}`만 반환한다.
- 공개 공지 상세는 `isPublished=true`를 DB 조회 조건에 강제하고, 비공개 포함 상세는 `requireMaster`로 보호된 `/manage/:id`에서만 조회한다.

## 11. Nginx·외부 배포 상태

- 운영 기준본은 `deploy/nginx/tzchat.conf`이다.
- Nginx는 `/home/tazofarm/project/tzchat/tzchatapp/dist`를 직접 제공하고 `/api/`, `/socket.io/`, `/uploads/`를 `127.0.0.1:11018`로 전달하며 `/debug/`를 404로 차단한다.
- HTTP→HTTPS, 12MB 요청 경계, SPA fallback, hashed asset immutable, index·manifest·service worker no-cache, `nosniff`·referrer·permissions·`SAMEORIGIN` 헤더가 기준본에 있다.
- CSP와 HSTS는 호환성·서브도메인·롤백 위험을 실제 운영에서 확정하기 전이므로 아직 추가하지 않았다.
- 외부 운영 도메인의 TLS, 웹, API, Socket.IO 응답은 정상이다.
- 현재 외부 웹은 2026-08-15의 구 번들을 제공하여 어두운 테마와 구 PWA manifest가 노출된다. 최신 빌드와 Nginx 기준본 배포가 필요하다.

## 12. 법적 문서

다음 공개 문서 4개는 외부에서 HTTP 200을 반환한다.

- `https://tazocode-dev.github.io/tazocode-legal/tzchat/terms.html`
- `https://tazocode-dev.github.io/tazocode-legal/tzchat/privacy.html`
- `https://tazocode-dev.github.io/tazocode-legal/tzchat/child-safety.html`
- `https://tazocode-dev.github.io/tazocode-legal/tzchat/account-deletion.html`

현재 배포된 `privacy.html`에는 앱이 선택 민감정보 동의에 사용하는 `#sensitive` 앵커가 없다. 검토본을 외부 법적 문서 저장소에 반영·배포해야 한다.

## 13. 최종 검증 결과

- 프론트 `npm test`: 28개 파일, 127개 테스트 통과
- 프론트 `npm run build:app`: 511개 모듈 production 빌드·58개 파일 검사·Android/iOS 자산 복사 통과
- Android 최신 `bundleRelease`: fail-closed 서명 설정으로 `tzchatapp/android/app/build/outputs/bundle/release/app-release.aab`(5.2MB) 생성, `jarsigner`의 `jar verified`와 `versionName=1.0.47`·`versionCode=47` 확인
- iOS Simulator 최신 unsigned Release fresh build: 앱 `1.0.47`·build `47`과 Contacts framework 포함 확인
- 백엔드 `npm test`: 234개 테스트 통과
- 백엔드 `npm run build`: JavaScript 구문·production 환경 검증 통과
- 프론트·백엔드 `npm audit --omit=dev`: 각각 취약점 0개
- 프론트·백엔드 `npm ls`: 각각 종료 코드 0
- 정적 release 검사와 `git diff --check`: 통과

## 14. 미검증·남은 외부 작업

- 최신 웹·백엔드·Nginx 기준본의 실제 운영 서버 반영
- 실제 MongoDB·TZMail·TZPhone·FCM·APNs를 연결한 종단간 integration 테스트
- Android/iOS 실기기의 가입·연락처·푸시·신고·차단·탈퇴 흐름
- Android signed AAB의 Play Console 업로드·내부 테스트 설치와 스토어 서명 검증
- iOS 실제 기기용 Release Archive·Distribution 서명과 App Store Connect·TestFlight 업로드
- 스토어 Data safety·App Privacy·권한 설명·심사 계정·법적 URL 최종 검증
- 운영 MongoDB·`UPLOAD_ROOT`·Nginx·release 자산의 백업·복구 연습

## 15. 다음 우선작업

1. 운영 DB·업로드·기존 설정을 백업한 후 최신 프론트·백엔드·`deploy/nginx/tzchat.conf`를 순서대로 배포한다.
2. 외부 `privacy.html#sensitive`를 포함한 법적 문서 4개를 최신 검토본으로 반영하고 앱·약관 메타데이터 연결을 확인한다.
3. Android/iOS 실기기에서 문자·이메일·FCM·연락처·가입·신고·차단·탈퇴 통합 흐름을 검증한다.
4. 로컬에서 검증한 Android signed AAB를 내부 테스트 트랙에 올리고, iOS Archive를 Distribution 서명으로 생성해 TestFlight 설치본을 검증한다.
5. 스토어 개인정보·데이터 보안·콘텐츠 등급·계정 삭제·심사 메타데이터를 현재 구현과 일치시킨다.
