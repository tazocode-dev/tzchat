<template>
  <Teleport to="ion-app">
    <div
      class="popup-overlay"
      @click.self="$emit('close')"
      role="presentation"
    >
    <div
      class="popup-content"
      role="dialog"
      aria-modal="true"
      aria-labelledby="search-year-title"
    >
      <h3 id="search-year-title">검색 나이 수정</h3>

      <div class="select-group" role="group" aria-label="검색 연령 범위 선택">
        <!-- 시작년도 -->
        <div class="select-container">
          <label class="select-label" for="year-from">시작년도</label>
          <ion-select
            id="year-from"
            v-model="from"
            interface="alert"
            class="year-select"
            :aria-label="'시작년도 선택'"
            cancel-text="취소"
            ok-text="선택"
            :interface-options="{ header: '시작년도 선택', cssClass: 'profile-select-alert' }"
          >
            <ion-select-option value="">전체</ion-select-option>
            <ion-select-option
              v-for="year in filteredFromYears"
              :key="'from-' + year"
              :value="String(year)"
            >
              {{ year }}
            </ion-select-option>
          </ion-select>
        </div>

        <!-- 끝년도 -->
        <div class="select-container">
          <label class="select-label" for="year-to">끝년도</label>
          <ion-select
            id="year-to"
            v-model="to"
            interface="alert"
            class="year-select"
            :aria-label="'끝년도 선택'"
            cancel-text="취소"
            ok-text="선택"
            :interface-options="{ header: '끝년도 선택', cssClass: 'profile-select-alert' }"
          >
            <ion-select-option value="">전체</ion-select-option>
            <ion-select-option
              v-for="year in filteredToYears"
              :key="'to-' + year"
              :value="String(year)"
            >
              {{ year }}
            </ion-select-option>
          </ion-select>
        </div>
      </div>

      <!-- 메시지 -->
      <p v-if="errorMsg" class="error-msg" role="alert">{{ errorMsg }}</p>
      <p v-if="successMsg" class="success-msg" role="status">{{ successMsg }}</p>

      <!-- 버튼: 항상 가로 2분할(좌 닫기 / 우 수정), 명확한 색상 적용 -->
      <div class="button-group">
        
        <ion-button
          expand="block"
          class="btn-submit"
          @click="submit"
          :disabled="Boolean(submitting || invalidRange)"
        >
          {{ submitting ? '수정 중…' : '수정' }}
        </ion-button>
        <ion-button expand="block" class="btn-close" @click="$emit('close')">닫기</ion-button>
      </div>
    </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { IonButton, IonSelect, IonSelectOption } from '@ionic/vue'
import axios from '@/shared/services/api'

const props = defineProps({
  initialFrom: { type: [String, Number, null], default: '' },
  initialTo:   { type: [String, Number, null], default: '' },
})
const emit = defineEmits(['close', 'updated'])

const from = ref('')
const to   = ref('')
const errorMsg = ref('')
const successMsg = ref('')
const submitting = ref(false)

const thisYear = new Date().getFullYear()
const maxYear = thisYear - 19
const years = Array.from({ length: maxYear - 1950 + 1 }, (_, i) => maxYear - i)

const filteredFromYears = computed(() => (to.value ? years.filter(y => y <= parseInt(to.value)) : years))
const filteredToYears   = computed(() => (from.value ? years.filter(y => y >= parseInt(from.value)) : years))

// ✅ 항상 boolean을 반환하도록 수정 (전체 선택 시에도 버튼 활성화)
const invalidRange = computed(() => {
  const f = from.value
  const t = to.value
  if (!f || !t) return false
  return parseInt(f) > parseInt(t)
})

function syncFromProps() {
  const pf = props.initialFrom ?? ''
  const pt = props.initialTo ?? ''
  from.value = (pf === '전체' || pf === null) ? '' : String(pf)
  to.value   = (pt === '전체' || pt === null) ? '' : String(pt)
  if (from.value && to.value && parseInt(from.value) > parseInt(to.value)) {
    to.value = from.value
  }
  console.log('[SearchYearModal] syncFromProps:', {
    initialFrom: props.initialFrom, initialTo: props.initialTo, from: from.value, to: to.value
  })
}

onMounted(syncFromProps)
watch(() => [props.initialFrom, props.initialTo], syncFromProps)

const submit = async () => {
  errorMsg.value = ''
  successMsg.value = ''

  if (invalidRange.value) {
    errorMsg.value = '시작 년도는 끝 년도보다 작거나 같아야 합니다.'
    return
  }

  try {
    submitting.value = true
    const payload = {
      year1: from.value === '' ? '' : from.value,
      year2: to.value   === '' ? '' : to.value,
    }
    console.log('▶ [SearchYearModal] PATCH /api/search/year payload:', payload)

    const res = await axios.patch('/api/search/year', payload, { withCredentials: true })
    console.log('✅ 검색 나이 서버 반영 완료', res.data)
    successMsg.value = '검색 나이가 수정되었습니다.'

    setTimeout(() => {
      emit('updated', { from: from.value, to: to.value })
      emit('close')
    }, 700)
  } catch (err) {
    console.error('❌ 검색 나이 업데이트 실패', err)
    errorMsg.value = err?.response?.data?.message || '서버 오류가 발생했습니다.'
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
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
  color: #000;
}

.select-group {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin: 12px 0 8px;
  width: 100%;
}
.select-container {
  display: flex;
  flex-direction: column;
  width: 48%;
  min-width: 120px;
}
.select-label {
  font-size: 0.85rem;
  font-weight: 700;
  margin-bottom: 4px;
  color: #000;
}

.year-select {
  --background: #f9f9f9;
  --color: #000;
  --placeholder-color: #000;
  --text-color: #000;
  width: 100%;
  text-align: center;
  min-height: 50px;
  font-size: 16px;
  border: 1px solid #d9d9d9;
  border-radius: 10px;
}
.year-select::part(text),
.year-select::part(placeholder) { color: #000 !important; font-size: 16px; font-weight: 600; }
ion-select-option { color: #000 !important; }

.button-group {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-top: 12px;
}

.button-group .btn-close {
  --background: #b5b5bb;
  --background-hover: #a6a6ad;
  --background-focused: #a6a6ad;
  --background-activated: #9a9aa1;
  --color: #ffffff;
  font-weight: 700;
}
.button-group .btn-submit {
  --background: #f8d146;
  --background-hover: #f6c600;
  --background-focused: #f6c600;
  --background-activated: #efbd00;
  --color: #000000;
  font-weight: 700;
}
.button-group .btn-submit.button-disabled,
.button-group .btn-close.button-disabled {
  opacity: .6;
  pointer-events: none;
}

.button-group ion-button {
  --border-radius: 12px;
  --padding-start: 12px;
  --padding-end: 12px;
  --padding-top: 10px;
  --padding-bottom: 10px;
  min-height: 44px;
}

.error-msg,
.success-msg {
  margin-top: 6px;
  font-size: 0.9rem;
}
.error-msg { color: #c0392b; }
.success-msg { color: #2d7a33; }

:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(59,130,246,.35);
  border-radius: 10px;
}

@media (max-width: 360px) {
  .popup-content { padding: 14px; width: 94vw; }
  .select-group { gap: 10px; }
}

@media (prefers-reduced-motion: reduce) {
  .popup-content { animation: none !important; }
}

@keyframes modal-in {
  from { opacity: 0; transform: translateY(6px) scale(.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
</style>
