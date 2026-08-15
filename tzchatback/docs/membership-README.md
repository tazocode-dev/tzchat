# 🧾 Membership System Guide (tzchat)

## 1️⃣ 개요
본 문서는 **네네챗 멤버십 시스템**의 등급, 가격, API, 마이그레이션 정책을 정리한 운영용 내부 문서입니다.

---

## 2️⃣ 등급 구조

| 코드 | 명칭 | 기본 대상 | 가격(₩) | 비고 |
|------|-------|-------------|-----------|-------|
| BETA | 베타회원 | 테스트 기간 기본등급 | 무료 | 2026-12-31 23:59 종료 |
| BASIC | 일반회원 | 정식 기본등급 | 무료 | |
| LIGHT | 라이트회원 | 유료(남/여 구분) | 9,900 | |
| PREMIUM | 프리미엄회원 | 유료(공용) | 19,900 | |

---

## 3️⃣ 혜택 구조 (임시 페이지 기준)

| 성별 | BASIC | LIGHT | PREMIUM |
|------|--------|--------|----------|
| 남성 | 혜택 01 | 혜택 02 | 혜택 03 |
| 여성 | 혜택 11 | 혜택 12 | 혜택 03 |

※ 실제 혜택 내용은 이후 `config/membership.js` 내 문구 갱신으로 조정.

---

## 4️⃣ 주요 경로 및 파일

| 구분 | 경로 | 설명 |
|------|------|------|
| Backend Config | `/config/membership.js` | 등급, 가격, 혜택 정의 |
| Membership API | `/routes/membership/membershipRouter.js` | 플랜 조회용 API (`/api/membership/plans`) |
| Payment API | `/routes/payment/paymentRouter.js` | 임시 결제(모의) API (`/api/purchase`) |
| Migration Script | `/scripts/migrations/2026-12-31-beta-to-basic.js` | 베타회원 → 일반회원 일괄 전환 |
| Admin API | `/routes/admin/migrationRouter.js` | 관리자용 마이그레이션 실행/미리보기 |
| Front Buy Page | `/src/components/05110_Membership/Buy.vue` | 남녀 자동 분기형 구매 페이지 |
| Admin Page | `/src/components/04910_Page9_Admin/adminlist/0021_a.vue` | 관리자에서 일괄 전환 실행 |
| Styles | `/src/theme/membership.css` | 멤버십 전용 UI 스타일 |

---

## 5️⃣ 베타 종료 일정

- **종료시점:** 2026-12-31 23:59 (Asia/Seoul)
- **스크립트 실행:**  
  ```bash
  node scripts/migrations/2026-12-31-beta-to-basic.js
