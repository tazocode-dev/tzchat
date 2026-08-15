<template>
  <Teleport to="ion-app">
    <div class="popup-overlay" @click.self="$emit('close')">
    <div class="popup-content" role="dialog" aria-modal="true" aria-labelledby="region-edit-title">
      <h3 id="region-edit-title">지역 수정</h3>

      <div class="select-group">
        <label for="region1">지역1 (시/도)</label>
        <ion-select
          id="region1"
          v-model="selectedRegion1"
          interface="alert"
          class="profile-select"
          placeholder="시/도 선택"
          cancel-text="취소"
          ok-text="선택"
          :interface-options="{ header: '시/도 선택', cssClass: 'profile-select-alert' }"
          @ionChange="onRegion1Change"
        >
          <ion-select-option v-for="(districts, province) in regions" :key="province" :value="province">
            {{ province }}
          </ion-select-option>
        </ion-select>

        <label for="region2">지역2 (시/군/구)</label>
        <ion-select
          id="region2"
          v-model="selectedRegion2"
          interface="alert"
          class="profile-select"
          placeholder="시/군/구 선택"
          cancel-text="취소"
          ok-text="선택"
          :disabled="!selectedRegion1"
          :interface-options="{ header: '시/군/구 선택', cssClass: 'profile-select-alert' }"
        >
          <ion-select-option v-for="district in region2Options" :key="district" :value="district">
            {{ district }}
          </ion-select-option>
        </ion-select>
      </div>

      <p v-if="errorMsg" class="error-msg" role="alert">{{ errorMsg }}</p>
      <p v-if="successMsg" class="success-msg" role="status">{{ successMsg }}</p>

      <div class="button-group">
        
        <ion-button
          expand="block"
          color="primary"
          @click="submitRegion"
          :disabled="isSubmitting"
        >
          {{ isSubmitting ? '수정 중…' : '수정' }}
        </ion-button>
        <ion-button expand="block" color="medium" @click="$emit('close')">닫기</ion-button>
      </div>
    </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { IonButton, IonSelect, IonSelectOption } from '@ionic/vue'
import axios from '@/shared/services/api'
import { regions } from '@/shared/utils/regions.js'

const props = defineProps({
  // 예: '서울 강남구' (한 칸 공백 구분) — 부모에서 전달
  message: { type: String, default: '' }
})
const emit = defineEmits(['close', 'updated'])

const selectedRegion1 = ref('')
const selectedRegion2 = ref('')
const region2Options  = ref([])

const errorMsg   = ref('')
const successMsg = ref('')
const isSubmitting = ref(false)

/** 초기 세팅: message 기반으로 선택값 복구 */
function applyInitialMessage(msg = '') {
  try {
    const raw = (msg || '').trim().replace(/\s+/g, ' ')
    if (!raw) {
      selectedRegion1.value = ''
      selectedRegion2.value = ''
      region2Options.value = []
      return
    }

    // 앞 단어를 region1으로, 나머지를 region2로 간주 (공백 포함 district 명 방어)
    const firstSpace = raw.indexOf(' ')
    let r1 = '', r2 = ''
    if (firstSpace === -1) {
      r1 = raw
      r2 = ''
    } else {
      r1 = raw.slice(0, firstSpace)
      r2 = raw.slice(firstSpace + 1)
    }

    // 존재하는 region1 키로만 세팅
    if (!regions[r1]) {
      // 키가 '서울특별시'인데 '서울'이 넘어오는 등의 경우 보정 시도
      const guess = Object.keys(regions).find(k => raw.startsWith(k + ' '))
      if (guess) {
        r1 = guess
        r2 = raw.slice(guess.length + 1)
      }
    }

    selectedRegion1.value = r1 || ''
    region2Options.value = regions[r1] || []
    selectedRegion2.value = r2 || ''
  } catch {
    selectedRegion1.value = ''
    selectedRegion2.value = ''
    region2Options.value = []
  }
}

onMounted(() => applyInitialMessage(props.message))
watch(() => props.message, v => applyInitialMessage(v))

/** 지역1 변경 시 하위 옵션 재설정 */
function onRegion1Change() {
  region2Options.value = regions[selectedRegion1.value] || []
  selectedRegion2.value = ''
}

/** 서버 전송 */
async function submitRegion() {
  errorMsg.value = ''
  successMsg.value = ''

  const r1 = (selectedRegion1.value || '').trim()
  const r2 = (selectedRegion2.value || '').trim()

  if (!r1 || !r2) {
    errorMsg.value = '지역을 모두 선택하세요.'
    return
  }

  const prev = (props.message || '').trim().replace(/\s+/g, ' ')
  const nextCombined = `${r1} ${r2}`

  if (nextCombined === prev) {
    errorMsg.value = '기존 지역과 동일합니다.'
    return
  }

  try {
    isSubmitting.value = true
    const res = await axios.patch(
      '/api/user/region',
      { region1: r1, region2: r2 },
      { withCredentials: true }
    )

    // ✅ 성공 판정 강화: 2xx 상태코드 또는 success/ok 플래그가 true면 성공 처리
    const httpOk = res && res.status >= 200 && res.status < 300
    const flagOk = !!(res?.data?.success || res?.data?.ok)

    if (httpOk || flagOk) {
      successMsg.value = '지역이 성공적으로 수정되었습니다.'
      setTimeout(() => {
        // 부모가 객체/문자열 모두 처리 가능하지만, 더 명확하게 객체로 전달
        emit('updated', { region1: r1, region2: r2 })
        emit('close')
      }, 650)
    } else {
      errorMsg.value = res?.data?.message || '수정 실패'
    }
  } catch (err) {
    console.error('[Modal_region] 서버 오류', err)
    const status = err?.response?.status
    if (status === 409) {
      errorMsg.value = err?.response?.data?.message || '다른 변경과 충돌했습니다. 다시 시도해 주세요.'
    } else if (status === 400) {
      errorMsg.value = err?.response?.data?.message || '요청 값이 올바르지 않습니다.'
    } else {
      errorMsg.value = err?.response?.data?.message || '서버 오류가 발생했습니다.'
    }
  } finally {
    isSubmitting.value = false
  }
}
</script>

<style scoped>
/* ──────────────────────────────────────────────────────────────
   지역 수정 모달 - CSS 보정
────────────────────────────────────────────────────────────── */
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
  overscroll-behavior: contain;
  padding: calc(var(--safe-top) + 12px) 12px calc(var(--safe-bottom) + 12px);
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
.popup-content h3 {
  margin: 0 0 10px;
  font-size: clamp(16px, 3.4vw, 18px);
  font-weight: 800;
  line-height: 1.25;
}
.select-group {
  margin-top: 12px;
  text-align: left;
  display: grid;
  grid-template-columns: 1fr;
  grid-row-gap: 8px;
}
.select-group label {
  font-size: clamp(14px, 2.8vw, 15px);
  font-weight: 700;
  color: #111;
  letter-spacing: 0.1px;
}
.select-group .profile-select {
  --background: #fff;
  --color: #111;
  --placeholder-color: #6b7280;
  --placeholder-opacity: 1;
  --padding-start: 12px;
  --padding-end: 12px;
  width: 100%;
  min-height: 50px;
  font-size: 16px;
  line-height: 1.3;
  background: #fff;
  color: #111;
  border: 1px solid #ccc;
  border-radius: 10px;
  outline: none;
  transition: border-color .15s, box-shadow .15s;
}
.select-group .profile-select::part(text),
.select-group .profile-select::part(placeholder) {
  font-size: 16px;
  font-weight: 600;
}
.select-group .profile-select:focus-visible {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59,130,246,.25);
  border-radius: 10px;
}
.button-group {
  display: grid;
  grid-auto-flow: column;
  gap: 8px;
  margin-top: 12px;
}
.button-group ion-button {
  --border-radius: 12px;
  --padding-start: 12px; --padding-end: 12px;
  --padding-top: 8px; --padding-bottom: 8px;
  min-height: 44px;
  font-weight: 700;
}
.error-msg,
.success-msg {
  margin: 6px 0 0;
  font-size: clamp(14px, 2.8vw, 15px);
  line-height: 1.3;
  word-break: break-word;
  text-align: left;
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
  .button-group { gap: 6px; }
}
@media (prefers-reduced-motion: reduce) {
  .popup-content { animation: none !important; }
}
@keyframes modal-in {
  from { opacity: 0; transform: translateY(6px) scale(.98); }
  to   { opacity: 1; transform: translateY(0)   scale(1); }
}
</style>
