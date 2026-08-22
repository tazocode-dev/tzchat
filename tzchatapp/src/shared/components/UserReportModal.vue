<template>
  <Teleport to="body">
    <div class="report-overlay" role="presentation" @click.self="cancel">
      <section
        ref="dialogRef"
        class="report-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-report-title"
        aria-describedby="user-report-description"
        tabindex="-1"
        @keydown.esc="cancel"
      >
        <header class="report-header">
          <div>
            <h2 id="user-report-title">손끝 사용자 신고</h2>
            <p id="user-report-description">
              <strong>{{ nickname || '사용자' }}</strong> 님을 신고하는 사유를 선택해 주세요.
            </p>
          </div>
          <button type="button" class="close-button" :disabled="submitting" aria-label="신고 창 닫기" @click="cancel">×</button>
        </header>

        <form class="report-form" @submit.prevent="submit">
          <fieldset class="reason-list" :disabled="submitting">
            <legend>신고 사유 <span aria-hidden="true">*</span></legend>
            <label v-for="option in REPORT_REASON_OPTIONS" :key="option.value" class="reason-option">
              <input v-model="reason" type="radio" name="report-reason" :value="option.value" required />
              <span>{{ option.label }}</span>
            </label>
          </fieldset>

          <div class="details-field">
            <label for="user-report-details">상세 내용 <span class="optional">선택</span></label>
            <textarea
              id="user-report-details"
              v-model="details"
              :disabled="submitting"
              maxlength="1000"
              rows="5"
              placeholder="운영자가 확인할 수 있도록 상황을 간단히 적어주세요."
            ></textarea>
            <small>{{ details.length }} / 1000</small>
          </div>

          <p v-if="feedback" :class="feedbackKind" :role="feedbackKind === 'error' ? 'alert' : 'status'" aria-live="polite">
            {{ feedback }}
          </p>

          <footer class="report-actions">
            <button type="button" class="cancel-button" :disabled="submitting" @click="cancel">취소</button>
            <button type="submit" class="submit-button" :disabled="!canSubmit">
              {{ submitting ? '접수 중…' : '신고 접수' }}
            </button>
          </footer>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { toastController } from '@ionic/vue'
import api from '@/shared/services/api'

type UserReportReason =
  | 'inappropriate_profile'
  | 'sexual_content'
  | 'harassment'
  | 'impersonation'
  | 'spam'
  | 'other'

const REPORT_REASON_OPTIONS: ReadonlyArray<{ value: UserReportReason; label: string }> = [
  { value: 'inappropriate_profile', label: '부적절한 프로필' },
  { value: 'sexual_content', label: '음란·성적인 콘텐츠' },
  { value: 'harassment', label: '욕설·괴롭힘' },
  { value: 'impersonation', label: '사칭' },
  { value: 'spam', label: '광고·스팸' },
  { value: 'other', label: '기타' },
]

const props = defineProps<{
  userId: string
  nickname?: string
  contextType: 'profile' | 'chat'
  chatRoomId?: string
}>()

const emit = defineEmits<{
  close: []
  submitted: [report: unknown]
}>()

const dialogRef = ref<HTMLElement | null>(null)
const reason = ref<UserReportReason | ''>('')
const details = ref('')
const submitting = ref(false)
const feedback = ref('')
const feedbackKind = ref<'error' | 'success'>('error')

const hasRequiredContext = computed(() => props.contextType === 'profile' || !!props.chatRoomId)
const canSubmit = computed(() => !!props.userId && !!reason.value && hasRequiredContext.value && !submitting.value)

onMounted(async () => {
  await nextTick()
  dialogRef.value?.focus()
})

function cancel() {
  if (!submitting.value) emit('close')
}

function errorMessage(error: any) {
  const status = Number(error?.response?.status || 0)
  const code = String(error?.response?.data?.code || '')
  if (status === 409 || code === 'PENDING_REPORT_EXISTS') {
    return '이미 처리 대기 중인 신고가 있습니다.'
  }
  if (status === 403 && code === 'CHAT_REPORT_FORBIDDEN') {
    return '참여 중인 채팅방의 상대만 신고할 수 있습니다.'
  }
  if (status >= 400 && status < 500) {
    return error?.response?.data?.message || '신고 내용을 확인해 주세요.'
  }
  return '신고를 접수하지 못했습니다. 잠시 후 다시 시도해 주세요.'
}

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  feedback.value = ''

  const payload: Record<string, string> = {
    reportedUserId: props.userId,
    reason: reason.value,
    details: details.value.trim(),
    contextType: props.contextType,
  }
  if (props.contextType === 'chat' && props.chatRoomId) payload.chatRoomId = props.chatRoomId

  try {
    const { data } = await api.post('/api/reports', payload)
    feedbackKind.value = 'success'
    feedback.value = '신고가 접수되었습니다.'
    try {
      const toast = await toastController.create({
        message: feedback.value,
        duration: 1800,
        color: 'success',
        position: 'bottom',
      })
      await toast.present()
    } catch {
      // 신고 저장은 완료됐으므로 UI 알림 생성 실패를 접수 실패로 되돌리지 않는다.
    }
    emit('submitted', data?.report)
    emit('close')
  } catch (error: any) {
    feedbackKind.value = 'error'
    feedback.value = errorMessage(error)
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.report-overlay {
  position: fixed;
  inset: 0;
  z-index: 10020;
  display: grid;
  place-items: center;
  padding: max(18px, env(safe-area-inset-top)) 16px max(18px, env(safe-area-inset-bottom));
  background: rgba(35, 28, 23, .58);
  backdrop-filter: blur(3px);
}
.report-dialog {
  width: min(100%, 480px);
  max-height: min(760px, calc(100dvh - 36px));
  overflow-y: auto;
  border: 1px solid var(--panel-border, #ddd2c9);
  border-radius: 20px;
  background: var(--panel, #fff);
  color: var(--text, #2d241f);
  box-shadow: 0 24px 60px rgba(35, 28, 23, .24);
  outline: none;
}
.report-header {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 20px 20px 14px;
  border-bottom: 1px solid var(--panel-border, #e4dbd2);
}
.report-header > div { flex: 1; min-width: 0; }
.report-header h2 { margin: 0; color: var(--text-strong, #211b17); font-size: 20px; letter-spacing: -.025em; }
.report-header p { margin: 7px 0 0; color: var(--text-dim, #655b54); font-size: 13px; line-height: 1.5; }
.close-button {
  width: 36px;
  height: 36px;
  border: 1px solid var(--panel-border, #ddd2c9);
  border-radius: 50%;
  background: var(--panel-soft, #f7f2ec);
  color: var(--text-dim, #655b54);
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}
.report-form { padding: 18px 20px 20px; }
.reason-list { display: grid; gap: 8px; margin: 0; padding: 0; border: 0; }
.reason-list legend { margin-bottom: 10px; color: var(--text-strong, #211b17); font-size: 14px; font-weight: 800; }
.reason-option {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 9px 12px;
  border: 1px solid var(--panel-border, #ddd2c9);
  border-radius: 12px;
  background: var(--panel-soft, #faf7f3);
  cursor: pointer;
}
.reason-option:has(input:checked) { border-color: var(--gold, #9a692a); background: var(--gold-soft, #f6ead7); }
.reason-option input { width: 18px; height: 18px; accent-color: var(--gold, #9a692a); }
.reason-option span { font-size: 14px; font-weight: 700; }
.details-field { display: grid; gap: 7px; margin-top: 18px; }
.details-field label { font-size: 14px; font-weight: 800; }
.details-field .optional { color: var(--text-faint, #8b817a); font-size: 11px; font-weight: 600; }
.details-field textarea {
  width: 100%;
  min-height: 112px;
  resize: vertical;
  box-sizing: border-box;
  border: 1px solid var(--panel-border, #ddd2c9);
  border-radius: 12px;
  padding: 11px 12px;
  background: var(--panel, #fff);
  color: var(--text, #2d241f);
  font: inherit;
  line-height: 1.45;
}
.details-field textarea:focus { outline: 2px solid rgba(154, 105, 42, .3); border-color: var(--gold, #9a692a); }
.details-field small { justify-self: end; color: var(--text-faint, #8b817a); font-size: 11px; }
.error, .success { margin: 14px 0 0; padding: 10px 12px; border-radius: 10px; font-size: 13px; line-height: 1.45; }
.error { border: 1px solid #efc9cb; background: #fff3f3; color: #8f2f36; }
.success { border: 1px solid #bfdcc8; background: #effaf2; color: #27613a; }
.report-actions { display: grid; grid-template-columns: 1fr 1.35fr; gap: 10px; margin-top: 18px; }
.report-actions button { min-height: 46px; border-radius: 12px; font-size: 14px; font-weight: 800; cursor: pointer; }
.cancel-button { border: 1px solid var(--panel-border, #ddd2c9); background: var(--panel-soft, #f7f2ec); color: var(--text-dim, #655b54); }
.submit-button { border: 1px solid #8f3238; background: #a43d44; color: #fff; }
.report-actions button:disabled, .close-button:disabled { cursor: default; opacity: .55; }
@media (max-width: 420px) {
  .report-overlay { padding-inline: 10px; }
  .report-header { padding: 17px 16px 12px; }
  .report-form { padding: 15px 16px 17px; }
  .reason-option { min-height: 40px; padding-block: 8px; }
}
</style>
