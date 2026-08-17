<template>
  <Teleport to="ion-app">
    <div class="popup-overlay" @click.self="$emit('close')" role="presentation">
    <div
      class="popup-content"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pref-edit-title"
    >
      <h3 id="pref-edit-title">성향 수정</h3>

      <!-- 🔸 선택 제한: 일반회원이면 '동성친구' 옵션은 표시하되 비활성화 -->
      <ion-select
        v-model="newPreference"
        class="select-box"
        aria-label="성향 선택"
        interface="alert"
        cancel-text="취소"
        ok-text="선택"
        :interface-options="{ header: '성향 선택', cssClass: 'profile-select-alert' }"
        @ionChange="enforceAllowed"
      >
        <ion-select-option value="이성친구 - 일반">이성친구 - 일반</ion-select-option>
        <ion-select-option value="이성친구 - 특수">이성친구 - 특수</ion-select-option>

        <ion-select-option value="__sep__" disabled>────────────</ion-select-option>

        <ion-select-option
          value="동성친구 - 일반"
          :disabled="isRestrictedLevel"
          class="disabled-option"
          :aria-disabled="isRestrictedLevel ? 'true' : 'false'"
          :title="isRestrictedLevel ? '현재 등급에서 선택할 수 없습니다.' : ''"
        >
          동성친구 - 일반
        </ion-select-option>

        <ion-select-option
          value="동성친구 - 특수"
          :disabled="isRestrictedLevel"
          class="disabled-option"
          :aria-disabled="isRestrictedLevel ? 'true' : 'false'"
          :title="isRestrictedLevel ? '현재 등급에서 선택할 수 없습니다.' : ''"
        >
          동성친구 - 특수
        </ion-select-option>
      </ion-select>

      <!-- 🔸 안내 문구 -->
      <p v-if="isRestrictedLevel" class="note-msg">일반회원은 “이성친구”만 선택할 수 있습니다.</p>

      <!-- 🔸 메시지 -->
      <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
      <p v-if="successMsg" class="success-msg">{{ successMsg }}</p>

      <!-- 🔸 버튼 그룹 -->
      <div class="button-group">
        
        <ion-button expand="block" color="primary" @click="submitPreference">수정</ion-button>
        <ion-button expand="block" color="medium" @click="$emit('close')">닫기</ion-button>
      </div>
    </div>
    </div>
  </Teleport>
</template>

<script setup>
/* ------------------------------------------------------------------
   Modal_preference.vue
   - 성향(preference) 수정 모달

   제한 규칙(2025-10-19 기준):
     · '일반회원' → '동성친구 - …' 옵션은 비활성화(표시는 되나 선택 불가)
     · '라이트회원' | '프리미엄회원' → 모든 옵션 선택 가능

   안전장치:
     · 초기 마운트 시, 혹은 사용자가 셀렉트 값을 바꿀 때
       현재 등급에서 허용되지 않는 값이면
       강제로 '이성친구 - 일반'으로 보정하고 에러 문구 표시
------------------------------------------------------------------- */
import { ref, onMounted, computed } from 'vue'
import axios from '@/shared/services/api'
import { IonButton, IonSelect, IonSelectOption } from '@ionic/vue'
import { isSensitiveInformationConsentRequiredError } from '@/features/profile/services/sensitivePreferenceConsent'

const props = defineProps({
  message: { type: String, default: '' }, // 현재 저장된 성향(예: '이성친구 - 일반')
  level:   { type: String, default: '' }, // '일반회원' | '라이트회원' | '프리미엄회원'
})
const emit = defineEmits(['close', 'updated'])

const newPreference = ref('')
const errorMsg = ref('')
const successMsg = ref('')

/* 등급 판별: 일반회원만 제한 */
const isRestrictedLevel = computed(() => props.level === '일반회원')

/* 현재 등급에서 허용되는지 검사 */
function isAllowed(option) {
  if (isRestrictedLevel.value) return option?.startsWith('이성친구')
  return true
}

/* 변경 시 즉시 보정 (비허용 값이면 되돌림) */
function enforceAllowed(e) {
  const val = e?.detail?.value ?? e?.target?.value ?? newPreference.value
  if (!isAllowed(val)) {
    newPreference.value = '이성친구 - 일반'
    errorMsg.value = '현재 등급에서는 “이성친구”만 선택할 수 있습니다.'
  } else {
    errorMsg.value = ''
  }
}

/* 초기값 세팅 (비허용 초기값이면 보정) */
onMounted(() => {
  const init = props.message || '이성친구 - 일반'
  newPreference.value = isAllowed(init) ? init : '이성친구 - 일반'
})

/* 저장 */
const submitPreference = async () => {
  errorMsg.value = ''
  successMsg.value = ''

  const trimmed = (newPreference.value || '').trim()
  const prev = (props.message || '').trim()

  if (!trimmed) {
    errorMsg.value = '값을 선택하세요.'
    return
  }
  if (!isAllowed(trimmed)) {
    errorMsg.value = '현재 등급에서는 “이성친구”만 선택할 수 있습니다.'
    return
  }
  if (trimmed === prev) {
    errorMsg.value = '기존 값과 동일합니다.'
    return
  }

  try {
    const res = await axios.patch(
      '/api/user/preference',
      { preference: trimmed },
      { withCredentials: true }
    )

    if (res.data?.success) {
      successMsg.value = '성향이 성공적으로 수정되었습니다.'
      setTimeout(() => {
        emit('updated', trimmed)
        emit('close')
      }, 800)
    } else {
      errorMsg.value = res.data?.message || '수정 실패'
    }
  } catch (err) {
    if (isSensitiveInformationConsentRequiredError(err)) {
      newPreference.value = props.message || ''
      errorMsg.value = '현재 버전의 민감정보 선택 동의가 필요합니다. 닫기 후 다시 설정해 주세요.'
      return
    }
    const msg = err?.response?.data?.message || '서버 오류가 발생했습니다.'
    errorMsg.value = msg
  }
}
</script>

<style scoped>
/* ===========================================================
   성향 수정 모달 - 기본 템플릿
=========================================================== */
.popup-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.45);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);
  z-index: 1000;
  padding: calc(var(--safe-top) + 12px)
           12px
           calc(var(--safe-bottom) + 12px);
}

.popup-content {
  background: #fff;
  color: #000;
  width: min(92vw, 420px);
  max-height: min(86vh, 640px);
  border: 1px solid #eaeaea;
  border-radius: 14px;
  box-shadow: 0 10px 28px rgba(0,0,0,0.18);
  padding: 16px 18px;
  text-align: center;
  overflow: auto;
  box-sizing: border-box;
  animation: modal-in .18s ease-out;
  transform-origin: center;
}

h3 {
  margin: 0 0 12px;
  font-size: clamp(16px, 3.4vw, 18px);
  font-weight: 800;
}

/* 셀렉트 박스 */
.select-box {
  --background: #fff;
  --color: #000;
  --placeholder-color: #6b7280;
  --placeholder-opacity: 1;
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

.select-box::part(text),
.select-box::part(placeholder) { font-size: 16px; font-weight: 600; }

/* 비활성 옵션 시각 보조 */
.disabled-option[disabled] {
  color: #9ca3af;
}

/* 안내/메시지 */
.note-msg { margin-top: 6px; font-size: 13px; color: #6b7280; }
.error-msg { color: #c0392b; margin-top: 6px; font-size: 14px; }
.success-msg { color: #2d7a33; margin-top: 6px; font-size: 14px; }

/* 버튼 그룹 */
.button-group {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 12px;
}
.button-group ion-button {
  --border-radius: 12px;
  min-height: 44px;
  font-weight: 700;
}

@keyframes modal-in {
  from { opacity: 0; transform: translateY(6px) scale(.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
</style>
