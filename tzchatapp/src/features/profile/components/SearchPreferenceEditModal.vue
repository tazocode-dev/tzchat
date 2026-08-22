<template>
  <Teleport to="ion-app">
    <div class="popup-overlay" @click.self="$emit('close')" role="presentation">
    <div class="popup-content" role="dialog" aria-modal="true" aria-labelledby="search-pref-title">
      <h3 id="search-pref-title">검색 특징 수정</h3>

      <!-- ✅ DB값(현재 저장값) 우선 선택 -->
      <!-- ✅ 비활성 옵션도 "현재 값"일 때는 선택 허용 -->
      <ion-select
        v-model="preference"
        class="preference-select"
        aria-label="검색 특징 선택"
        interface="alert"
        cancel-text="취소"
        ok-text="선택"
        :interface-options="{ header: '검색 특징 선택', cssClass: 'profile-select-alert' }"
      >
        <!--<option value="">선택</option>-->
        <ion-select-option
          v-for="opt in options"
          :key="opt.value"
          :value="opt.value"
          :disabled="isOptionDisabled(opt.value)"
        >
          {{ opt.label }}
        </ion-select-option>
      </ion-select>

      <!-- 메시지 -->
      <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
      <p v-if="successMsg" class="success-msg">{{ successMsg }}</p>

      <!-- 버튼: 가로 2분할(좌 닫기 / 우 수정) + 선명한 색상 -->
      <div class="button-group">
        
        <ion-button expand="block" class="btn-submit" @click="submit">수정</ion-button>
        <ion-button expand="block" class="btn-close" @click="$emit('close')">닫기</ion-button>
      </div>
    </div>
    </div>
  </Teleport>
</template>

<script setup>
/* ============================================================
   SearchPreferenceEditModal.vue
   - DB에서 받은 값(props.message) 우선 노출
   - "이성친구*"로 시작하면 동성 옵션 비활성
   - "동성친구*"로 시작하면 이성 옵션 비활성
   - 단, 현재 선택값(preference)과 같으면 비활성 무시(선택 허용)
============================================================ */
import { ref, onMounted, watch } from 'vue'
import axios from '@/shared/services/api'
import { IonButton, IonSelect, IonSelectOption } from '@ionic/vue'
import { isSensitiveInformationConsentRequiredError } from '@/features/profile/services/sensitivePreferenceConsent'

/* 현재 저장값 */
const props = defineProps({
  message: { type: String, default: '' } // 예: "이성친구 - 전체"
})
const emit = defineEmits(['close', 'updated'])

/* 상태 */
const preference = ref('')      // 현재 선택 값
const errorMsg   = ref('')
const successMsg = ref('')

/* 옵션 목록 (라벨/값 고정) */
const options = [
  { label: '이성친구 - 전체', value: '이성친구 - 전체' },
  { label: '이성친구 - 내 성향', value: '이성친구 - 내 성향' },
  { label: '동성친구 - 전체', value: '동성친구 - 전체' },
  { label: '동성친구 - 내 성향', value: '동성친구 - 내 성향' },
]

/* 그룹 추출: '이성친구' | '동성친구' | null */
function extractGroup(val) {
  if (typeof val !== 'string') return null
  if (val.startsWith('이성친구')) return '이성친구'
  if (val.startsWith('동성친구')) return '동성친구'
  return null
}

/* 비활성 규칙:
   - 현재 선택 그룹이 '이성친구'면 '동성친구*' 모두 비활성
   - 현재 선택 그룹이 '동성친구'면 '이성친구*' 모두 비활성
   - 단, value가 현재 선택값과 같으면 항상 활성(선택 유지 가능) */
function isOptionDisabled(value) {
  // 현재 선택값과 같으면 항상 허용
  if (value === preference.value) return false

  const currentGroup = extractGroup(preference.value || props.message || '')
  const valueGroup =
    value.startsWith('이성친구') ? '이성친구'
      : value.startsWith('동성친구') ? '동성친구'
      : null

  if (!currentGroup || !valueGroup) return false
  // 그룹이 다르면 비활성
  return currentGroup !== valueGroup
}

/* 초기/재오픈 시 DB값 우선 동기화 */
function syncFromProps() {
  preference.value = props.message || ''
}
onMounted(syncFromProps)
watch(() => props.message, syncFromProps)

/* 저장 */
const submit = async () => {
  errorMsg.value = ''
  successMsg.value = ''

  if (!preference.value) {
    errorMsg.value = '특징을 선택해주세요.'
    return
  }
  if (preference.value === (props.message || '')) {
    errorMsg.value = '기존 값과 동일합니다.'
    return
  }

  try {
    const res = await axios.patch(
      '/api/search/preference',
      { preference: preference.value },
      { withCredentials: true }
    )

    if (res.data?.success) {
      successMsg.value = '검색 특징이 수정되었습니다.'
      setTimeout(() => {
        emit('updated', preference.value)
        emit('close')
      }, 700)
    } else {
      errorMsg.value = res.data?.message || '수정 실패'
    }
  } catch (err) {
    console.warn('❌ 서버 요청 실패')
    if (isSensitiveInformationConsentRequiredError(err)) {
      preference.value = props.message || ''
      errorMsg.value = '현재 버전의 민감정보 선택 동의가 필요합니다. 닫기 후 다시 설정해 주세요.'
      return
    }
    errorMsg.value = err?.response?.data?.message || '서버 오류가 발생했습니다.'
  }
}
</script>

<style scoped>
/* ===========================================================
   기준 모달 스타일 + 버튼 선명 색상
   - dim+blur 오버레이, safe-area 패딩
   - 카드 폭: min(92vw, 420px)
   - 버튼: 항상 가로 2분할 (닫기=회색, 수정=노랑)
=========================================================== */

/* 오버레이 */
.popup-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.45);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
  padding: calc(var(--safe-top) + 12px) 12px calc(var(--safe-bottom) + 12px);
  z-index: 1000;
  overscroll-behavior: contain;
}

/* 카드 */
.popup-content {
  background: #fff;
  color: #000;
  width: min(92vw, 420px);
  max-height: min(86vh, 640px);
  border: 1px solid #eaeaea;
  border-radius: 14px;
  box-shadow: 0 10px 28px rgba(0,0,0,.18);
  padding: 16px 18px;
  text-align: center;
  box-sizing: border-box;
  animation: modal-in .18s ease-out;
  transform-origin: center;
}

/* 제목 */
.popup-content h3 {
  margin: 0 0 12px;
  font-size: clamp(16px, 3.4vw, 18px);
  font-weight: 800;
  line-height: 1.25;
}

/* 셀렉트 */
.preference-select {
  --background: #fff;
  --color: #000;
  --padding-start: 12px;
  --padding-end: 12px;
  width: 100%;
  min-height: 50px;
  margin: 12px 0 8px;
  font-size: 16px;
  color: #000;
  background: #fff;
  border: 1px solid #d9d9d9;
  border-radius: 12px;
  outline: none;
  transition: border-color .15s, box-shadow .15s;
}
.preference-select::part(text),
.preference-select::part(placeholder) { font-size: 16px; font-weight: 600; }
.preference-select:focus-visible {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59,130,246,.25);
}

/* 메시지 */
.error-msg,
.success-msg {
  margin: 6px 0 0;
  font-size: 0.9rem;
  line-height: 1.35;
}
.error-msg { color: #c0392b; }
.success-msg { color: #2d7a33; }

/* 버튼: 가로 2분할 + 명확한 색상 */
.button-group {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 12px;
}
.button-group ion-button {
  --border-radius: 12px;
  --padding-start: 12px;
  --padding-end: 12px;
  --padding-top: 10px;
  --padding-bottom: 10px;
  min-height: 44px;
  font-weight: 700;
}

/* ▶ 색상 커스터마이즈 (스샷 톤) */
.button-group .btn-close {
  --background: #b5b5bb;       /* 진한 회색 */
  --background-hover: #a6a6ad;
  --background-focused: #a6a6ad;
  --background-activated: #9a9aa1;
  --color: #ffffff;            /* 글자 흰색 */
}
.button-group .btn-submit {
  --background: #f8d146;       /* 선명한 노랑 */
  --background-hover: #f6c600;
  --background-focused: #f6c600;
  --background-activated: #efbd00;
  --color: #000000;            /* 글자 검정 */
}

/* 포커스 링 */
:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(59,130,246,.35);
  border-radius: 12px;
}

/* 모션 최소화 */
@media (prefers-reduced-motion: reduce) {
  .popup-content { animation: none !important; }
}

/* 등장 애니메이션 */
@keyframes modal-in {
  from { opacity: 0; transform: translateY(6px) scale(.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
</style>
