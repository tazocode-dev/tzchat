<!-- 닉네임 수정 모달 -->
<template>
  <Teleport to="ion-app">
    <!-- 오버레이: 배경 클릭 시에만 닫힘 (.self) -->
    <div
      class="popup-overlay"
      role="presentation"
      @click.self="onOverlayClick"
    >
    <!-- 콘텐츠 카드: dialog semantics -->
    <div
      class="popup-content"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      :aria-busy="isSubmitting ? 'true' : 'false'"
      @keydown.esc.prevent.stop="onEsc"
      ref="cardRef"
    >
      <h3 :id="titleId">닉네임 수정</h3>

      <!-- 입력창 -->
      <input
        v-model="newNickname"
        type="text"
        maxlength="20"
        placeholder="새 닉네임을 입력하세요"
        class="nickname-input"
        :disabled="isSubmitting"
        @keydown.enter.prevent="submitNickname"
        aria-label="새 닉네임"
      /> 

      <!-- 결과 메시지 -->
      <p v-if="errorMsg" class="error-msg" role="alert">{{ errorMsg }}</p>
      <p v-if="successMsg" class="success-msg" role="status">{{ successMsg }}</p>

      <!-- 버튼 그룹 (가로 고정: 닫기 | 수정) -->
      <div class="button-group">


        <ion-button
          expand="block"
          color="primary"
          @click="submitNickname"
          :disabled="isSubmitting"
        >
          {{ isSubmitting ? '수정 중…' : '수정' }}
        </ion-button>
        <ion-button
          expand="block"
          color="medium"
          @click="onClose"
          :disabled="isSubmitting"
        >
          닫기
        </ion-button>
      </div>
    </div>
    </div>
  </Teleport>
</template>

<script setup>
/* ============================================================================
   닉네임 수정 모달
   - 흰 카드 / 검은 텍스트 / overlay 딤+블러
   - 버튼: [닫기=medium] [수정=primary] → 항상 가로 2열
   - 접근성(ARIA), ESC 닫기, 중복 클릭 방지
============================================================================ */
import { ref, onMounted } from 'vue'
import axios from '@/shared/services/api'
import { IonButton } from '@ionic/vue'

/* Props */
const props = defineProps({
  message: { type: String, default: '' }
})

/* Emits */
const emit = defineEmits(['close', 'updated'])

/* State */
const newNickname = ref(props.message || '')
const errorMsg = ref('')
const successMsg = ref('')
const isSubmitting = ref(false)

/* 접근성: 제목 ID, 카드 ref */
const titleId = `modal-title-${Math.random().toString(36).slice(2)}`
const cardRef = ref(null)

/* 첫 포커스 */
onMounted(() => {
  try { cardRef.value?.focus?.() } catch {}
})

/* 닫기 */
const onClose = () => emit('close')
const onOverlayClick = () => emit('close')
const onEsc = () => emit('close')

/* 저장 */
const submitNickname = async () => {
  errorMsg.value = ''
  successMsg.value = ''

  const trimmed = newNickname.value.trim()
  if (!trimmed) {
    errorMsg.value = '닉네임을 입력하세요.'
    return
  }
  if (trimmed === props.message) {
    errorMsg.value = '기존 닉네임과 동일합니다.'
    return
  }

  try {
    isSubmitting.value = true
    const response = await axios.put(
      '/api/update-nickname',
      { nickname: trimmed },
      { withCredentials: true }
    )

    if (response?.data?.success) {
      successMsg.value = '닉네임이 성공적으로 수정되었습니다.'
      setTimeout(() => {
        emit('updated', trimmed)
        emit('close')
      }, 800)
    } else {
      errorMsg.value = response?.data?.message || '닉네임 수정 실패'
    }
  } catch (err) {
    errorMsg.value = err?.response?.data?.message || '서버 오류가 발생했습니다.'
  } finally {
    isSubmitting.value = false
  }
}
</script>

<style scoped>
/* ============================================================================
   White Card Modal (공통 템플릿)
   - 흰 카드 + 검정 텍스트
   - overlay 딤/블러, safe-area 패딩
   - 버튼 그룹: 항상 가로 2열
============================================================================ */

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
  overscroll-behavior: contain;
  z-index: 1000;
}

/* 카드 */
.popup-content {
  width: min(92vw, 420px);
  max-height: min(86vh, 640px);
  overflow: auto;
  background: #fff;
  color: #000;
  border: 1px solid #eaeaea;
  border-radius: 14px;
  box-shadow: 0 10px 28px rgba(0,0,0,0.18);
  padding: 16px 18px;
  text-align: center;
  box-sizing: border-box;
  animation: modal-in .18s ease-out;
  transform-origin: center;
  outline: none;
}

/* 제목 */
.popup-content h3 {
  margin: 0 0 12px;
  font-size: clamp(16px, 3.4vw, 18px);
  font-weight: 800;
  line-height: 1.25;
  color: #000;
}

/* 입력창 */
.nickname-input {
  width: 100%;
  min-height: 44px;
  padding: 12px;
  margin: 12px 0;
  font-size: 16px;
  line-height: 1.45;
  background: #fff;
  color: #111;
  border: 1px solid #ccc;
  border-radius: 10px;
  transition: border-color .15s, box-shadow .15s, background-color .15s;
}
.nickname-input::placeholder { color: #999; }
.nickname-input:focus-visible {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59,130,246,.25);
}
.nickname-input:disabled {
  background: #f3f3f3;
  opacity: .85;
  cursor: not-allowed;
}

/* 메시지 */
.error-msg,
.success-msg {
  margin: 6px 0 0;
  font-size: clamp(13px, 2.8vw, 14px);
  line-height: 1.35;
}
.error-msg { color: #c0392b; }
.success-msg { color: #2d7a33; }

/* 버튼 그룹: 항상 가로 2열 */
.button-group {
  display: grid;
  grid-template-columns: 1fr 1fr;  /* ← 가로 고정 */
  gap: 10px;
  margin-top: 12px;
}

/* IonButton 공통 */
.button-group ion-button {
  --border-radius: 12px;
  --padding-start: 12px;
  --padding-end: 12px;
  min-height: 44px;
  font-weight: 700;
}

/* 포커스 링(접근성) */
:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(59,130,246,.35);
  border-radius: 10px;
}

/* 모션 최소화 */
@media (prefers-reduced-motion: reduce) {
  .popup-content { animation: none !important; }
}

/* 등장 애니메이션 */
@keyframes modal-in {
  from { opacity: 0; transform: translateY(6px) scale(.98); }
  to   { opacity: 1; transform: translateY(0)   scale(1); }
}
</style>
