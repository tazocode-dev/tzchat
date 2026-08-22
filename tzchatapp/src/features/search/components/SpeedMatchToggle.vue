<template>
  <section class="speed-card" aria-labelledby="speed-title">
    <div class="speed-copy">
      <div class="speed-title-row">
        <ion-icon :icon="icons.flashOutline" aria-hidden="true" class="title-icon" />
        <strong id="speed-title">스피드 매칭</strong>
      </div>
      <p class="schedule">{{ scheduleText }}</p>
      <p class="hint">
        <template v-if="hasSession">
          {{ emergencyOn ? '현재 참여 중입니다.' : '잠시 숨김 상태입니다.' }}
        </template>
        <template v-else-if="isOpenNow">
          {{ isTestAccount ? '1시간씩 반복해서 테스트할 수 있습니다.' : '시간대별 1시간 이용할 수 있습니다.' }}
        </template>
        <template v-else>{{ nextStartText }}</template>
      </p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </div>

    <div v-if="hasSession" class="session-actions">
      <span class="timer" aria-live="polite">{{ formattedTime }}</span>
      <button
        type="button"
        class="action-button secondary"
        :disabled="loading"
        @click="$emit('visibility', !emergencyOn)"
      >
        {{ emergencyOn ? '잠시 숨기기' : '다시 참여' }}
      </button>
    </div>

    <button
      v-else
      type="button"
      class="action-button primary"
      :disabled="loading || !isOpenNow"
      @click="$emit('start')"
    >
      {{ loading ? '확인 중...' : '1시간 시작하기' }}
    </button>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { IonIcon } from '@ionic/vue'
import { flashOutline } from 'ionicons/icons'

const props = defineProps({
  emergencyOn: { type: Boolean, default: false },
  hasSession: { type: Boolean, default: false },
  formattedTime: { type: String, default: '' },
  availability: { type: Object, default: () => ({}) },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
})

defineEmits(['start', 'visibility'])

const icons = { flashOutline }
// 운영 시간 및 테스트 계정 예외는 서버 판정을 단일 기준으로 사용한다.
const isOpenNow = computed(() => props.availability?.isOpen === true)
const isTestAccount = computed(() => props.availability?.testAccount === true)
const scheduleText = computed(() =>
  props.availability?.scheduleText || '매일 13:00~15:00 · 21:00~23:00'
)

const nextStartText = computed(() => {
  const raw = props.availability?.nextStartsAt
  if (!raw) return '현재는 시작 시간이 아닙니다.'
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return '현재는 시작 시간이 아닙니다.'
  const text = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(date)
  return `다음 스피드 매칭은 ${text}에 시작됩니다.`
})

</script>

<style scoped>
.speed-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 92px;
  padding: 14px;
  border: 1px solid var(--panel-border);
  border-radius: 18px;
  background: linear-gradient(135deg, #fff8eb, #fff);
  box-shadow: var(--shadow-xs);
}

.speed-copy { min-width: 0; }
.speed-title-row { display: flex; align-items: center; gap: 8px; color: var(--text-strong); }
.speed-title-row strong { font-size: 15px; letter-spacing: -.03em; }
.title-icon { color: var(--gold-strong); font-size: 18px; }
.schedule { margin: 6px 0 0; color: var(--gold-strong); font-size: 11.5px; font-weight: 750; }
.hint { margin: 3px 0 0; color: var(--text-dim); font-size: 10.5px; line-height: 1.4; }
.error { margin: 5px 0 0; color: var(--danger); font-size: 10.5px; }

.session-actions { display: grid; justify-items: end; gap: 7px; }
.timer { color: var(--gold-strong); font-size: 12px; font-weight: 800; white-space: nowrap; }
.action-button {
  min-height: 42px;
  padding: 8px 13px;
  border: 0;
  border-radius: 13px;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}
.action-button.primary { background: var(--gold-strong); color: #fff; }
.action-button.secondary { border: 1px solid #d8c5a5; background: #fff; color: var(--gold-strong); }
.action-button:disabled { opacity: .48; cursor: not-allowed; }

@media (max-width: 370px) {
  .speed-card { grid-template-columns: 1fr; padding: 12px; }
  .session-actions { grid-template-columns: 1fr auto; align-items: center; justify-items: start; }
  .action-button.primary { width: 100%; }
}
</style>
