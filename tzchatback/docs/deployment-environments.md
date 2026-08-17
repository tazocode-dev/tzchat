# TZChat 환경 분리 및 서버 반영

## 환경 파일 역할

백엔드는 `NODE_ENV`가 먼저 결정된 뒤 해당 환경 파일 하나만 읽습니다.

- 개발: `.env.development`
- 운영: `.env.production`
- 자동화 테스트 런타임: `.env.test`
- 공통 `.env`는 사용하지 않습니다. 선택된 환경 파일이 없으면 다른 파일로 대체하지 않고 기동을 중단합니다.
- 셸과 PM2에 직접 지정한 환경변수는 선택된 파일보다 우선합니다.

`.env.development`와 `.env.production`은 각각 DB, JWT·세션, Origin, TZMail·TZPhone, 계정 정책, 푸시 설정을 포함하는 완결된 파일입니다. 한 환경의 값을 다른 환경 파일에 의존시키지 않습니다.

서버에 수동 복사할 파일:

- `tzchatback/.env.production`: 운영 백엔드 설정 전체. 비밀 파일로 취급합니다.
- `tzchatapp/.env.production`: Vite 빌드에 포함되는 공개 설정만 허용

서버에 복사하지 않을 파일:

- `tzchatback/.env.development`
- `tzchatback/.env.test`
- `tzchatapp/.env.development`
- 모든 `*.example` 파일은 작성 기준일 뿐 실제 실행 파일로 복사하지 않습니다.

`VITE_` 변수는 앱 번들에 포함되므로 API 키나 비밀번호를 넣지 않습니다. 실제 비밀 환경 파일은 Git에 커밋하지 않습니다.

TZMail·TZPhone API 키와 테스트 계정 로그인 고정 인증번호는 해당 백엔드 환경 파일에서만 관리하고 문서나 프론트 환경 파일에 넣지 않습니다. 운영 필수 설정이 비어 있으면 배포 검사가 의도적으로 실패합니다.

## 개발 실행

```bash
cd /Users/mac/tazocode/11017_tzchat/tzchat/tzchatback
npm run dev

cd /Users/mac/tazocode/11017_tzchat/tzchat/tzchatapp
npm run dev
```

개발 웹은 `http://localhost:11017`, 개발 API는 `http://localhost:11018`만 사용합니다. 일반 이메일은 `MAIL_PROVIDER=tzmail`, `TZMAIL_BASE_URL=https://tzmail.tazocode.com/api`, `EMAIL_CODE_FIXED=false`로 실제 TZMail 발송을 사용합니다. 문자도 `SMS_PROVIDER=tzphone`, `TZPHONE_BASE_URL=https://tzphone.tazocode.com/api`로 실제 TZPhone 발송을 사용하며 mock은 자동화 테스트에서만 허용합니다.

## 약관 동의 메타데이터 초기화

공개 법적 본문은 GitHub Pages에서만 제공하고, DB에는 현재 가입 동의 판정에 필요한 고정 버전 메타데이터와 사용자 동의 기록만 저장합니다. 서버 시작 시 자동 실행하지 않으며 운영자가 대상 환경을 명시해 실행합니다.

```bash
# 로컬 개발 DB
cd /Users/mac/tazocode/11017_tzchat/tzchat/tzchatback
NODE_ENV=development npm run seed:terms

# 운영 DB
cd /home/tazofarm/project/tzchat/tzchatback
NODE_ENV=production npm run seed:terms
```

명령은 선택한 `.env.<NODE_ENV>`의 `MONGO_URI`를 사용하며 URI를 출력하지 않습니다. 같은 `slug`와 고정 버전을 upsert하고 해당 slug의 다른 활성 버전만 비활성화하므로 같은 환경에서 반복 실행해도 문서가 중복 생성되거나 버전이 매번 바뀌어 불필요한 재동의가 발생하지 않습니다. 실행 전 `NODE_ENV`와 대상 환경 파일이 올바른 DB를 가리키는지 확인해야 합니다.

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

공통 `.env`와 ecosystem 중복 설정을 사용하던 기존 PM2 프로세스에는 과거 환경값이 남을 수 있습니다. 이 구조를 처음 반영할 때는 한 번만 기존 프로세스를 삭제하고 ecosystem으로 다시 생성합니다.

```bash
pm2 delete tzchatback
cd /home/tazofarm/project/tzchat/tzchatback
npm run pm2:start
pm2 save
```

신규 서버 최초 실행:

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

PM2 ecosystem에는 `NODE_ENV`와 ecosystem 실행 표식만 둡니다. 애플리케이션 설정은 모두 `.env.production`에서 관리합니다.

환경 오류로 기동 직후 종료되면 PM2는 짧은 재시작을 최대 5회로 제한합니다.

## 반영 후 확인

```bash
curl -fsS https://tzchat.tazocode.com/api/health
sudo nginx -t
sudo systemctl reload nginx
```

`pm2 env` 전체 출력은 비밀값을 노출할 수 있으므로 사용하지 않습니다. 상태 확인에는 `pm2 status tzchatback`과 제한된 애플리케이션 로그만 사용합니다.

운영 Nginx 기준본은 프로젝트 최상위 `nginx.md`이며, `/debug/`는 백엔드 proxy 대상으로 두지 않습니다.
