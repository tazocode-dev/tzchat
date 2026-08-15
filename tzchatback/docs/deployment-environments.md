# TZChat 환경 분리 및 서버 반영

## 환경 파일 역할

백엔드는 `NODE_ENV`가 먼저 결정된 뒤 다음 파일만 읽습니다.

- 개발: 서버 전용 공통 비밀 설정 `.env`를 먼저 읽고 `.env.development`를 적용합니다.
- 운영: 같은 `.env`를 먼저 읽고 `.env.production`을 운영 전용 재정의 파일로 적용합니다. 같은 키는 환경별 파일이 우선합니다.
- 자동화 테스트: 실제 실행 설정과 분리된 `.env.test`가 있을 때만 읽으며 `MAIL_PROVIDER=dev`는 이 환경에서만 허용합니다.
- 셸과 PM2에 직접 지정한 환경변수는 파일보다 우선합니다.

서버에 수동 복사할 파일:

- `tzchatback/.env`: 운영 DB, JWT·세션, TZMail·TZPhone 등 기본·비밀 설정
- `tzchatback/.env.production`: 현재 서버에서 사용하는 운영 Origin, provider와 운영 재정의 설정. 비밀값이 들어 있으면 이 파일도 비밀 파일로 취급합니다.
- `tzchatapp/.env.production`: Vite 빌드에 포함되는 공개 설정만 허용

서버에 복사하지 않을 파일:

- `tzchatback/.env.development`
- `tzchatapp/.env.development`
- 모든 `*.example` 파일은 작성 기준일 뿐 실제 실행 파일로 복사하지 않습니다.

`VITE_` 변수는 앱 번들에 포함되므로 API 키나 비밀번호를 넣지 않습니다. 실제 비밀 환경 파일은 Git에 커밋하지 않습니다.

TZMail 등록 앱 ID는 `com.tazocode.com`입니다. API 키는 공통 `.env`에만 저장하고 문서나 프론트 환경 파일에 넣지 않습니다. 테스트 계정 로그인 고정 인증번호는 백엔드 정책에서만 관리하고 프론트 번들에 포함하지 않습니다. 운영 백엔드는 TZPhone의 base URL·앱 ID·API 키가 아직 없으므로, 세 값을 발급·설정하기 전에는 배포 검사가 의도적으로 실패합니다.

## 개발 실행

```bash
cd /Users/mac/tazocode/11017_tzchat/tzchat/tzchatback
npm run dev

cd /Users/mac/tazocode/11017_tzchat/tzchat/tzchatapp
npm run dev
```

개발 웹은 `http://localhost:11017`, 개발 API는 `http://localhost:11018`만 사용합니다. 일반 이메일은 `MAIL_PROVIDER=tzmail`, `TZMAIL_BASE_URL=https://tzmail.tazocode.com/api`, `EMAIL_CODE_FIXED=false`로 실제 TZMail 발송을 사용합니다. 문자도 `SMS_PROVIDER=tzphone`, `TZPHONE_BASE_URL=https://tzphone.tazocode.com/api`로 실제 TZPhone 발송을 사용하며 mock은 자동화 테스트에서만 허용합니다.

## 운영 배포 전 검사

```bash
cd /home/tazofarm/project/tzchat/tzchatapp
npm ci
npm run build

cd /home/tazofarm/project/tzchat/tzchatback
npm ci --omit=dev
npm run build
```

백엔드의 `npm run build`는 컴파일하거나 `dist` 산출물을 만들지 않습니다. 전체 JavaScript 구문과 운영 환경설정을 검사하는 배포 전 검사이므로, 운영 서버에는 `src`, `scripts`, `package.json`, `package-lock.json` 등 백엔드 실행 소스를 그대로 배포해야 합니다.

운영 빌드는 잘못된 CORS, 클라이언트용 로컬·사설 API 주소, 폐기된 공개 URL 키, `MAIL_PROVIDER=dev`, `EMAIL_CODE_FIXED=true`, 등록값과 다른 TZMail 앱 ID, 잘못된 API 키 형식, 필수 TZMail·TZPhone 설정 누락을 거부합니다. 공개 미디어 URL은 `PUBLIC_API_ORIGIN`만 사용합니다. 배포 전 검사는 운영 서버 외부의 `FCM_SA_PATH` 파일이 로컬에 없어도 허용하지만, 실제 production 서버는 시작 전에 해당 파일의 존재와 읽기 권한을 확인하고 실패 시 기동하지 않습니다. TZMail과 같은 서버의 운영 백엔드는 `TZMAIL_BASE_URL=http://127.0.0.1:10024/api`를 사용합니다.

## 이메일 인증 구조와 장애 확인

- 웹과 Android/iOS 앱은 모두 TZChat 백엔드의 `/api/auth/email/*`만 호출합니다. TZMail 앱 ID와 API 키는 프론트 번들에 포함하지 않습니다.
- 정확히 지정된 심사용 이메일의 로그인 요청만 `sent=false`, `reviewLogin=true`로 응답하고 실제 메일을 발송하지 않습니다. 이메일 변경·전화번호 변경 인증에는 이 우회를 적용하지 않습니다.
- 일반 이메일은 임의의 6자리 번호를 생성해 TZMail 발송 성공 뒤 `sent=true`로 응답합니다.
- `devCode`는 `NODE_ENV=test`와 `MAIL_PROVIDER=dev`가 함께 설정된 자동화 테스트에서만 반환됩니다.

502를 확인할 때는 먼저 TZChat의 `/api/health`와 TZMail의 `/api/health`를 각각 확인합니다. 그다음 제한된 백엔드 로그에서 `network_error`, `timeout`, `delivery_rejected`, `providerCode`를 확인합니다. TZMail health가 정상이더라도 메일 요청만 실패하면 Nginx로 단정하지 말고 앱 ID·활성 키·메일 공급자 거부 응답을 먼저 확인합니다.

## PM2 반영

PM2는 반드시 ecosystem 파일로 실행합니다. `pm2 start src/server.js` 또는 `pm2 start npm -- start`처럼 직접 실행하면 운영 검증에서 거부됩니다.

최초 실행:

```bash
cd /home/tazofarm/project/tzchat/tzchatback
npm run pm2:start
pm2 save
```

코드와 환경 변경 후 무중단 반영:

```bash
cd /home/tazofarm/project/tzchat/tzchatback
npm run build
npm run pm2:reload
```

서버 수동 환경값:

- `.env`: `TZMAIL_API_KEY` 등 비밀값
- `.env.production` 또는 PM2 ecosystem: `MAIL_PROVIDER=tzmail`, `EMAIL_CODE_FIXED=false`, `TZMAIL_BASE_URL=http://127.0.0.1:10024/api`, `TZMAIL_APP_ID=com.tazocode.com`

환경 오류로 기동 직후 종료되면 PM2는 짧은 재시작을 최대 5회로 제한합니다.

## 반영 후 확인

```bash
curl -fsS https://tzchat.tazocode.com/api/health
sudo nginx -t
sudo systemctl reload nginx
```

`pm2 env` 전체 출력은 비밀값을 노출할 수 있으므로 사용하지 않습니다. 상태 확인에는 `pm2 status tzchatback`과 제한된 애플리케이션 로그만 사용합니다.

운영 Nginx 기준본은 프로젝트 최상위 `nginx.md`이며, `/debug/`는 백엔드 proxy 대상으로 두지 않습니다.
