# TZChat 배포 환경과 운영 반영

## 기준

- Node.js 22 이상을 사용합니다.
- 프론트 서버 경로는 `/home/tazofarm/project/tzchat/tzchatapp`입니다.
- 백엔드 서버 경로는 `/home/tazofarm/project/tzchat/tzchatback`입니다.
- 운영 도메인은 `https://tzchat.tazocode.com`, 백엔드 loopback 포트는 `11018`입니다.
- Nginx 기준본은 저장소 루트의 `deploy/nginx/tzchat.conf`입니다. 이 파일은 설정 문법만 포함하며 실제 설치 명령은 이 문서에서 관리합니다.

## 환경 파일

백엔드는 `NODE_ENV`가 먼저 결정된 후 해당 환경 파일 하나만 읽습니다.

| 환경 | 프론트 | 백엔드 |
| --- | --- | --- |
| 개발 | `tzchatapp/.env.development` | `tzchatback/.env.development` |
| 운영 | `tzchatapp/.env.production` | `tzchatback/.env.production` |
| 자동화 테스트 | 명령에서 필요값 주입 | `tzchatback/.env.test` |

- 공통 `.env`는 사용하지 않습니다. 선택된 환경 파일이 없으면 다른 파일로 대체하지 않고 실행을 중단합니다.
- 셸·PM2가 직접 지정한 값은 환경 파일보다 우선합니다.
- `*.example`은 작성 기준일 뿐 실행 파일이 아닙니다.
- `VITE_` 값은 번들에 공개되므로 비밀값을 넣지 않습니다.
- DB URI, JWT·세션 secret, TZMail·TZPhone·FCM·APNs 자격증명은 백엔드 운영 환경에서만 관리하고 Git에 커밋하지 않습니다.

## 업로드 저장소와 크기 경계

백엔드의 이미지 업로드 제한은 10MB입니다. Nginx의 `client_max_body_size`는 12MB로 두어 multipart overhead를 허용하되, 애플리케이션의 10MB JSON 오류 응답 경계를 바꾸지 않습니다.

- `UPLOAD_ROOT`
  - 최종 프로필·채팅 이미지 저장소입니다.
  - 비어 있으면 `tzchatback/uploads`를 사용합니다.
  - 릴리스 교체 중에도 유지되는 절대경로를 운영 환경 파일에 명시하는 것을 권장합니다.
- `UPLOAD_TEMP_ROOT`
  - Multer 임시 파일 저장소입니다.
  - 비어 있으면 OS 임시 디렉터리 아래 `tzchat-upload-temp`를 사용합니다.
  - 지정할 경우 백엔드 서비스 계정이 쓰고 정리할 수 있는 절대경로를 사용합니다.

예시 경로이며 실제 서버 권한·백업 정책에 맞게 결정합니다.

```dotenv
UPLOAD_ROOT=/home/tazofarm/data/tzchat/uploads
UPLOAD_TEMP_ROOT=/home/tazofarm/data/tzchat/upload-temp
```

저장소는 서비스 실행 전에 생성하고, 백엔드 서비스 계정에만 필요한 읽기·쓰기 권한을 부여합니다. `UPLOAD_ROOT`는 DB와 함께 백업·복구 대상으로 관리하고, 임시 디렉터리는 백업하지 않습니다.

## 로컬 개발·검증

```bash
cd /Users/mac/tazocode/11017_tzchat/tzchat/tzchatback
npm ci
npm run dev

cd /Users/mac/tazocode/11017_tzchat/tzchat/tzchatapp
npm ci
npm run dev
```

개발 주소는 프론트 `http://localhost:11017`, API `http://localhost:11018`입니다. 전체 검증 명령은 다음과 같습니다.

```bash
cd /Users/mac/tazocode/11017_tzchat/tzchat/tzchatapp
npm test
npm run build:app

cd /Users/mac/tazocode/11017_tzchat/tzchat/tzchatback
npm test
npm run build
```

## 운영 반영 순서

배포 전 [출시 체크리스트](../../RELEASE_CHECKLIST.md)의 백업·롤백 항목을 먼저 완료합니다.

### 1. 의존성과 프론트 빌드

```bash
cd /home/tazofarm/project/tzchat/tzchatapp
npm ci
npm test
npm run build
```

`npm run build`는 앱 버전, production API Origin, TypeScript, Vite 번들, PWA 파일을 검증합니다. Nginx는 생성된 `/home/tazofarm/project/tzchat/tzchatapp/dist`를 직접 제공합니다.

### 2. 백엔드 검증·약관·PM2

```bash
cd /home/tazofarm/project/tzchat/tzchatback
npm ci --omit=dev
npm test
npm run build
NODE_ENV=production npm run seed:terms
npm run pm2:reload
```

- 최초 PM2 반영은 `npm run pm2:start`, 이후 코드·환경 변경은 `npm run pm2:reload`를 사용합니다.
- 과거에 직접 실행한 PM2 프로세스가 남아 있다면 최초 1회는 기존 `tzchatback`을 삭제하고 ecosystem으로 재생성합니다.
- `npm run build`는 백엔드 산출물을 만들지 않고 전체 JavaScript 구문과 production 환경 제약을 검증합니다.
- `seed:terms`는 해당 환경 DB의 고정 버전 메타데이터를 upsert합니다. 실행 전 DB 대상을 확인합니다.

최초 ecosystem 전환이 필요한 경우에만 다음을 수행합니다.

```bash
pm2 delete tzchatback
cd /home/tazofarm/project/tzchat/tzchatback
npm run pm2:start
pm2 save
```

### 3. Nginx 기준본 반영

```bash
cd /home/tazofarm/project/tzchat
sudo install -m 0644 deploy/nginx/tzchat.conf /etc/nginx/sites-available/tzchat.conf
sudo ln -sfn /etc/nginx/sites-available/tzchat.conf /etc/nginx/sites-enabled/tzchat.conf
sudo nginx -t
sudo systemctl reload nginx
```

`nginx -t`가 실패하면 reload하지 않고 이전 활성 설정을 유지합니다. 기준본은 다음을 강제합니다.

- HTTP 80을 HTTPS 443으로 redirect
- `tzchatapp/dist` SPA 직접 제공
- `/api/`, `/socket.io/`, `/uploads/`를 `127.0.0.1:11018`로 proxy
- `/debug/` 404
- Nginx default access log off(질의·식별자가 포함된 중복 요청 로그 방지), 백엔드의 정제된 API access 로그 사용
- hashed `/assets/` immutable cache
- `index.html`, `manifest.webmanifest`, `firebase-messaging-sw.js` no-cache
- `nosniff`, referrer, permissions, `SAMEORIGIN` 보안 헤더

CSP는 현재 Ionic·법적 문서 iframe·외부 연결을 실기기에서 완전히 검증하지 않아 출시 기준본에 추가하지 않았습니다. HSTS도 하위 도메인·인증서·롤백 정책을 운영에서 확정하기 전이므로 추가하지 않았습니다.

## 반영 후 확인

```bash
node --version
pm2 status tzchatback
curl -fsS https://tzchat.tazocode.com/api/health
curl -fsS 'https://tzchat.tazocode.com/socket.io/?EIO=4&transport=polling'
curl -fsSI https://tzchat.tazocode.com/
curl -fsSI https://tzchat.tazocode.com/manifest.webmanifest
curl -fsSI https://tzchat.tazocode.com/firebase-messaging-sw.js
```

기대 결과:

- health body는 `{"ok":true}`입니다.
- Socket.IO polling은 HTML이 아닌 Engine.IO open packet을 반환합니다.
- 웹 루트와 manifest는 최신 `손끝` 밝은 테마·PNG 아이콘 설정입니다.
- `manifest.webmanifest`, `firebase-messaging-sw.js`, `index.html`은 no-cache이고 hashed assets는 immutable입니다.
- `https://tzchat.tazocode.com/debug/`는 404입니다.

`pm2 env`의 전체 출력은 비밀값을 노출할 수 있으므로 사용하지 않습니다. PM2 상태와 production에서 정제된 애플리케이션 로그만 확인합니다.

## 롤백

1. 배포 전 보존한 이전 commit·lockfile·`dist`로 코드와 프론트 자산을 복구합니다.
2. 백엔드 의존성을 이전 lockfile로 재설치하고 `npm run build` 후 PM2를 reload합니다.
3. Nginx 변경이 원인이면 이전 vhost를 복구하고 `sudo nginx -t` 통과 후 reload합니다.
4. 데이터 복구는 스키마·약관 메타데이터 호환성을 확인한 후에만 수행합니다.
5. 롤백 후 웹, health, Socket.IO, 로그인, 업로드 이미지, 푸시를 다시 점검합니다.
