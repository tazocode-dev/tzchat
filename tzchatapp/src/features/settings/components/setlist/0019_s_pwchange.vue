
<!-- 비밀번호 변경 -->


<!-- src/views/PasswordChangePage.vue -->
<template>
  <ion-page class="password-page">
    <!-- 헤더: 블랙+골드 -->
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <!-- 히스토리가 없을 때 이동할 기본 경로를 원하는 페이지로 바꾸세요 
          <ion-back-button defaultHref="/home/profile" aria-label="뒤로가기" />
          -->
        </ion-buttons>

        <ion-title>비밀번호 변경</ion-title>

        <ion-buttons slot="end">
          <!-- 필요 시 우측 닫기대신 도움말 등으로 교체 가능 -->
          <ion-button @click="goBack" aria-label="닫기(우측)">닫기</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <!-- 본문 -->
    <ion-content :fullscreen="true">
      <ion-list inset>
        <!-- 현재 비밀번호 -->
        <ion-item>
          <ion-label position="stacked">현재 비밀번호</ion-label>
          <ion-input
            type="password"
            placeholder="현재 비밀번호"
            v-model="form.current"
            @ionInput="logInput('current', $event)"
            autocomplete="current-password"
          />
        </ion-item>

        <!-- 새 비밀번호 -->
        <ion-item>
          <ion-label position="stacked">새 비밀번호</ion-label>
          <ion-input
            type="password"
            placeholder="새 비밀번호"
            v-model="form.next"
            @ionInput="logInput('next', $event)"
            autocomplete="new-password"
          />
        </ion-item>

        <!-- 새 비밀번호 확인 -->
        <ion-item>
          <ion-label position="stacked">새 비밀번호 확인</ion-label>
          <ion-input
            type="password"
            placeholder="새 비밀번호 확인"
            v-model="form.confirm"
            @ionInput="logInput('confirm', $event)"
            autocomplete="new-password"
          />
        </ion-item>
      </ion-list>

      <!-- 액션 버튼 -->
      <div class="btn-row">
        <ion-button
          expand="block"
          @click="onSubmit"
          :disabled="isSubmitting"
        >
          {{ isSubmitting ? '변경 중...' : '변경' }}
        </ion-button>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
// -------------------------------------------------------
// PasswordChangePage.vue (블랙+골드 테마 / 페이지 버전)
// - PUT /api/update-password (세션 기반)
// - 주석/로그 최대화
// - 성공 시 이전 화면으로 이동(router.back())
// -------------------------------------------------------
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton,
  IonContent, IonList, IonItem, IonLabel, IonInput, IonBackButton
} from '@ionic/vue'
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/shared/services/api'

const router = useRouter()

const form = reactive({ current: '', next: '', confirm: '' })
const isSubmitting = ref(false)

function goBack () {
  try { router.back() } catch { router.push('/home/profile') }
}

function logInput (key: string, ev: any) {
  // 입력 로그는 보안상 마스킹 처리
  const masked = '•'.repeat(String(ev?.target?.value ?? '').length)
  console.debug(`[PasswordPage] input ${key}: ${masked}`)
}

function validate () {
  // 클라이언트 1차 검증 (서버에서 최종 검증 필수)
  if (!form.current || !form.next || !form.confirm) {
    alert('모든 항목을 입력해 주세요.')
    return false
  }
  if (form.next.length < 4) {
    alert('새 비밀번호는 4자 이상을 권장합니다.')
    return false
  }
  if (form.next !== form.confirm) {
    alert('새 비밀번호가 일치하지 않습니다.')
    return false
  }
  if (form.current === form.next) {
    alert('현재 비밀번호와 다른 비밀번호를 입력해 주세요.')
    return false
  }
  return true
}

async function handleChangePassword () {
  console.info('[PasswordPage] send → PUT /api/update-password')
  // 상대경로 fetch() → 공통 API client(@/shared/services/api)로 통일 (네이티브 앱에서 잘못된 origin으로
  // 요청이 나가던 문제 수정, 지침 §3)
  try {
    const res = await api.put('/api/update-password', { current: form.current, next: form.next })
    console.info('[PasswordPage] success:', res.data?.message || 'OK')
    return true
  } catch (e: any) {
    const errMsg = e?.response?.data?.message || e?.message || '서버 오류'
    console.warn('[PasswordPage] fail:', errMsg)
    throw new Error(errMsg)
  }
}

async function onSubmit () {
  if (!validate() || isSubmitting.value) return
  isSubmitting.value = true

  try {
    if (await handleChangePassword()) {
      // 성공 처리: 폼 리셋 + 알림 + 이전 화면으로
      form.current = form.next = form.confirm = ''
      alert('비밀번호가 변경되었습니다.')
      goBack()
    }
  } catch (err: any) {
    const msg = String(err?.message || '')
    if (msg.includes('Failed to fetch') || msg.includes('ECONNREFUSED')) {
      alert('서버에 연결할 수 없습니다. (백엔드 실행 상태 확인)')
    } else {
      alert(msg || '비밀번호 변경에 실패했습니다.')
    }
  } finally {
    isSubmitting.value = false
  }
}
</script>

<style scoped>
/* ─────────────────────────────────────────────────────────────
   블랙+골드 토큰 (필요 시 전역 theme에 병합 가능)
   - 가능한 한 이 컴포넌트 안에서만 재정의 (부작용 최소화)
───────────────────────────────────────────────────────────── */
.password-page {
  /* 팔레트 */
  --gold-weak: #a77534;
  --gold-press: #754b1a;
  --bg-0: var(--bg);
  --bg-1: var(--panel);
  --bg-2: var(--panel-2);
  --line: var(--panel-border);
  --text-weak: var(--text-faint);
  --focus: var(--gold);
}

/* 페이지 루트 */
.password-page {
  color: var(--text-strong);
}

/* 헤더/툴바: 블랙+골드 */
.password-page :deep(ion-header),
.password-page :deep(ion-toolbar) {
  --background: var(--bg-0);
  --color: var(--text-strong);
  border-bottom: 1px solid var(--line);
}

.password-page :deep(ion-title) {
  color: var(--gold);
  font-weight: 800;
  letter-spacing: 0.2px;
}

.password-page :deep(ion-buttons ion-button) {
  --background: transparent;
  --color: var(--gold);
  --ripple-color: var(--gold-weak);
  font-weight: 700;
}

/* 콘텐츠 배경 */
.password-page :deep(ion-content) {
  --background: var(--bg-0);
  color: var(--text);
}

/* 리스트 카드 */
.password-page :deep(ion-list[inset]) {
  margin: 12px;
  padding: 0;
  background: var(--bg-1);
  border: 1px solid var(--line);
  border-radius: 14px;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

/* 아이템(행) */
.password-page :deep(ion-item) {
  --background: var(--bg-1);
  --color: var(--text);
  --padding-start: 12px;
  --inner-padding-end: 12px;
  --min-height: 62px;
  --inner-border-width: 0 0 1px 0;
  --inner-border-color: var(--line);

  /* 기본 하이라이트 제거 */
  --highlight-color-focused: transparent;
  --highlight-color-valid: transparent;
  --highlight-color-invalid: transparent;
  --show-full-highlight: 0;
}
.password-page :deep(ion-item:last-of-type) { --inner-border-width: 0; }

/* 라벨: 골드 포인트 */
.password-page :deep(ion-item ion-label) {
  color: var(--gold);
  font-weight: 800;
  font-size: clamp(14px, 2.6vw, 15px);
  margin-bottom: 8px;
  letter-spacing: 0.2px;
}

/* 입력창(native) */
.password-page :deep(ion-input::part(native)) {
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 12px 12px;
  font-size: 16px;
  color: var(--text-strong);
  line-height: 1.35;
  min-height: 46px;
  outline: none !important;
  box-shadow: none !important;
}
.password-page :deep(ion-input::part(native)::placeholder) {
  color: var(--text-weak);
}

/* 포커스(인풋): 골드 테두리 강조 */
.password-page :deep(ion-input:focus-within)::part(native),
.password-page :deep(ion-input:focus)::part(native),
.password-page :deep(ion-input:focus-visible)::part(native) {
  border-color: var(--focus);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus) 26%, transparent);
}

/* 바깥 outline 완전 제거 */
.password-page :deep(ion-item:focus),
.password-page :deep(ion-item:focus-within),
.password-page :deep(ion-item:focus-visible) {
  outline: none !important;
  box-shadow: none !important;
  border-radius: 0 !important;
}

/* 네이티브 input까지 완전 차단 */
.password-page :deep(ion-input input),
.password-page :deep(ion-input input:focus),
.password-page :deep(ion-input input:focus-within),
.password-page :deep(ion-input input:focus-visible) {
  outline: none !important;
  box-shadow: none !important;
}

/* 크롬 자동완성 보정 */
.password-page :deep(ion-input::part(native)):-webkit-autofill,
.password-page :deep(ion-input::part(native)):-webkit-autofill:hover,
.password-page :deep(ion-input::part(native)):-webkit-autofill:focus {
  -webkit-text-fill-color: var(--text-strong) !important;
  caret-color: var(--text-strong);
  box-shadow: 0 0 0 1000px var(--bg-2) inset !important;
  transition: background-color 9999s ease-out, color 9999s ease-out;
}

/* 액션 버튼: 골드 메인 */
.btn-row { padding: 16px 12px 18px; }

.password-page :deep(ion-button) {
  --background: var(--gold);
  --color: #fff;
  --background-activated: var(--gold-press);
  --background-hover: var(--gold-press);
  --border-radius: 12px;
  --padding-top: 12px;
  --padding-bottom: 12px;
  font-weight: 900;
  letter-spacing: 0.3px;
  box-shadow: 0 8px 20px rgba(111,69,22,0.18);
}
.password-page :deep(ion-button[disabled]) {
  opacity: 0.6;
  box-shadow: none;
}

/* 초소형 화면 대응 */
@media (max-width: 360px) {
  .password-page :deep(ion-list[inset]) { margin: 10px; }
  .btn-row { padding: 12px 10px 14px; }
  .password-page :deep(ion-item) { --padding-start: 10px; --inner-padding-end: 10px; }
}

/* 모션 최소화 옵션 */
@media (prefers-reduced-motion: reduce) {
  * { transition-duration: 0.001ms !important; animation-duration: 0.001ms !important; }
}
</style>
