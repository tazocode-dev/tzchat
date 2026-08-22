# TZChat / 손끝

TZChat은 만 19세 이상 이용자를 대상으로 하는 데이팅·소셜 매칭 서비스입니다. 사용자 표시명은 `손끝`이고, 저장소·도메인·패키지의 기술 식별자는 `TZChat`을 유지합니다.

## 요구 환경

- Node.js 22 이상
- npm
- 로컬 백엔드 개발용 MongoDB
- 네이티브 작업 시 Android Studio/JDK와 Xcode/CocoaPods

## 저장소 구조

```text
tzchat/
├── deploy/nginx/   # 운영 Nginx 기준 설정
├── legal/          # 외부 공개 전 검토용 법적 문서
├── tzchatapp/      # Vue 3 + Ionic + Capacitor 클라이언트
└── tzchatback/     # Express + MongoDB 백엔드
```

구조 참고 대상인 `tzadmin`은 현재 공유 지침 문서를 가리키는 심볼릭 링크만 있고 비교할 수 있는 실제 앱·백엔드 코드 트리는 없습니다. 따라서 이 저장소의 현재 `tzchatapp` / `tzchatback` 경계를 정식 구조로 유지합니다.

## 설치와 로컬 개발

각 프로젝트에서 의존성을 설치합니다.

```bash
cd tzchatapp
npm ci

cd ../tzchatback
npm ci
```

환경 파일은 example을 복사해 직접 작성합니다.

```bash
cp tzchatapp/.env.development.example tzchatapp/.env.development
cp tzchatback/.env.development.example tzchatback/.env.development
```

실제 `.env.*`, API 키, JWT·세션 secret, 메일·문자·푸시 자격증명은 Git에 커밋하지 않습니다. `VITE_` 값은 클라이언트 번들에 포함되므로 비밀값을 넣으면 안 됩니다.

로컬 실행은 두 터미널에서 진행합니다.

```bash
cd tzchatback
npm run dev

cd tzchatapp
npm run dev
```

기본 개발 주소는 프론트 `http://localhost:11017`, 백엔드 `http://localhost:11018`입니다.

## 테스트와 빌드

```bash
cd tzchatapp
npm test
npm run build
npm run build:app

cd ../tzchatback
npm test
npm run build
```

- 프론트 `build`는 버전·운영 API Origin·타입·Vite 번들을 검증합니다.
- `build:app`은 운영 번들을 Android/iOS 프로젝트에 복사하고 자산 일치를 확인합니다.
- 백엔드 `build`는 산출물을 만드는 명령이 아니라 JavaScript 구문과 production 환경을 검증하는 배포 게이트입니다.

## 배포 개요

운영에서는 `tzchatapp/dist`를 Nginx가 직접 제공하고, `/api/`, `/socket.io/`, `/uploads/`를 `127.0.0.1:11018`의 백엔드로 전달합니다. 백엔드는 PM2 ecosystem으로 실행하며 운영 환경값은 각 프로젝트의 `.env.production`에서 관리합니다.

적용·롤백·실기기 검증은 반드시 출시 체크리스트를 따릅니다. 저장소의 Nginx 파일은 기준본이며 운영 서버 반영은 별도 작업입니다.

## 관련 문서

- [현재 프로젝트 상태](status.md)
- [주요 논의와 결정](history.md)
- [출시 체크리스트](RELEASE_CHECKLIST.md)
- [배포 환경·PM2·Nginx 반영 절차](tzchatback/docs/deployment-environments.md)
- [운영 Nginx 기준 설정](deploy/nginx/tzchat.conf)
- [법적 문서 검토본](legal/)
