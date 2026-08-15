<template>
  <Teleport to="ion-app">
    <div class="popup-overlay" @click.self="$emit('close')" role="presentation">
    <div class="popup-content" role="dialog" aria-modal="true" aria-labelledby="search-marriage-title">
      <h3 id="search-marriage-title">상대 결혼 유무 수정</h3>

      <!-- ✅ DB값(현재 저장값) 우선 선택 -->
      <!-- ✅ 비활성 옵션도 "현재 값"일 때는 선택 허용 -->
      <ion-select
        v-model="marriage"
        class="select-box"
        aria-label="상대 결혼 유무 선택"
        interface="alert"
        cancel-text="취소"
        ok-text="선택"
        :interface-options="{ header: '상대 결혼 유무 선택', cssClass: 'profile-select-alert' }"
      >
        <!--<option value="">선택</option>-->
        <ion-select-option
          v-for="opt in OPTIONS"
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

      <!-- 버튼: 가로 2분할(좌 닫기 / 우 수정) -->
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
   Search_Marriage.vue
   - 검색용 결혼유무(search_marriage) 수정 모달
   - DB의 현재값(props.message) 우선 노출
   - PATCH /api/search/marriage (withCredentials)
============================================================ */
import { ref, onMounted, watch } from 'vue'
import axios from '@/shared/services/api'
import { IonButton, IonSelect, IonSelectOption } from '@ionic/vue'

const props = defineProps({
  // 예: "전체" | "미혼" | "기혼" | "돌싱"
  message: { type: String, default: '' }
})
const emit = defineEmits(['close', 'updated'])

// 기본 옵션 (정책상 일부는 비활성)
// ※ 현재 선택값이면 비활성이라도 선택 허용 (사용자 혼란 방지)
const OPTIONS = [
  { label: '전체', value: '전체', disabled: false },
  { label: '미혼', value: '미혼', disabled: false },
  { label: '기혼', value: '기혼', disabled: false  },
  { label: '돌싱', value: '돌싱', disabled: false  },
]

const ALLOWED = OPTIONS.map(o => o.value)

const marriage   = ref('')
const errorMsg   = ref('')
const successMsg = ref('')

function isOptionDisabled(value) {
  const opt = OPTIONS.find(o => o.value === value)
  if (!opt) return false
  // 현재값은 항상 선택 허용
  if (value === marriage.value) return false
  return !!opt.disabled
}

function syncFromProps() {
  const v = (props.message || '').trim()
  marriage.value = ALLOWED.includes(v) ? v : '전체'
}
onMounted(syncFromProps)
watch(() => props.message, syncFromProps)

async function submit() {
  errorMsg.value = ''
  successMsg.value = ''

  const next = (marriage.value || '').trim()
  const prev = (props.message || '').trim()

  if (!next) {
    errorMsg.value = '값을 선택하세요.'
    return
  }
  if (!ALLOWED.includes(next)) {
    errorMsg.value = '올바른 값을 선택하세요.'
    return
  }
  if (next === prev) {
    errorMsg.value = '기존 값과 동일합니다.'
    return
  }

  try {
    const res = await axios.patch(
      '/api/search/marriage',
      { marriage: next },
      { withCredentials: true }
    )

    if (res.data?.success) {
      successMsg.value = '상대 결혼 유무가 수정되었습니다.'
      setTimeout(() => {
        emit('updated', next) // 부모에서 user.search_marriage = value 반영
        emit('close')
      }, 700)
    } else {
      errorMsg.value = res.data?.message || '수정 실패'
    }
  } catch (err) {
    // 타입 경고 회피용 안전 접근
    const status = (err && err.response && err.response.status) || 0
    if (status === 404) errorMsg.value = 'API 경로가 없습니다. 서버를 확인하세요.'
    else if (status === 500) errorMsg.value = '서버 오류가 발생했습니다.'
    else errorMsg.value = '서버 요청에 실패했습니다.'
  }
}
</script>

<style scoped>
/* ===========================================================
   기준 모달 스타일 + 버튼 선명 색상
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
  padding: calc(var(--safe-top) + 12px) 12px calc(var(--safe-bottom) + 12px);
  z-index: 1000;
  overscroll-behavior: contain;
}

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

.popup-content h3 {
  margin: 0 0 12px;
  font-size: clamp(16px, 3.4vw, 18px);
  font-weight: 800;
  line-height: 1.25;
}

/* 셀렉트 */
.select-box {
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
.select-box::part(text),
.select-box::part(placeholder) { font-size: 16px; font-weight: 600; }
.select-box:focus-visible {
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
.button-group .btn-close {
  --background: #b5b5bb;
  --background-hover: #a6a6ad;
  --background-focused: #a6a6ad;
  --background-activated: #9a9aa1;
  --color: #ffffff;
}
.button-group .btn-submit {
  --background: #f8d146;
  --background-hover: #f6c600;
  --background-focused: #f6c600;
  --background-activated: #efbd00;
  --color: #000000;
}

/* 접근성 */
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
