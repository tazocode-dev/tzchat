<template> 
  <ion-modal :is-open="true" @didDismiss="closeModal">
    <div class="modal-container">
      <!-- 닫기 버튼 -->
      <div class="modal-header">
        <h3>📨 친구 신청 인사말</h3>
        <ion-button size="small" fill="clear" @click="closeModal">닫기</ion-button>
      </div>

      <!-- 메시지 본문 -->
      <div class="message-box">
        <p class="message-content">
          {{ request.message || '메시지가 없습니다.' }}
        </p>
      </div>

      <!-- 상태 메시지 -->
      <p v-if="errorMsg" class="msg-error">{{ errorMsg }}</p>
      <p v-if="successMsg" class="msg-success">{{ successMsg }}</p>

      <!-- 수락/거절/차단 버튼 -->
      <div class="button-row">
        <ion-button
          color="success"
          expand="block"
          :disabled="isSubmitting"
          @click="accept"
        >
          {{ isSubmitting && action==='accept' ? '수락 중...' : '수락' }}
        </ion-button>

        <ion-button
          color="medium"
          expand="block"
          :disabled="isSubmitting"
          @click="reject"
        >
          {{ isSubmitting && action==='reject' ? '거절 중...' : '거절' }}
        </ion-button>

        <ion-button
          color="danger"
          expand="block"
          :disabled="isSubmitting"
          @click="block"
        >
          {{ isSubmitting && action==='block' ? '차단 중...' : '차단' }}
        </ion-button>
      </div>
    </div>
  </ion-modal>
</template>

<script setup>
// --------------------------------------------------------------
// Modal_FriendMessage.vue
// - 받은 친구 신청의 인사말 확인 + 수락/거절/차단 처리
// - 변경 최소: API 호출을 모달 내부에 추가
// - 주석/로그 풍부, 에러메시지 그대로 노출
// - ✅ axios 인스턴스 통일(@/shared/services/api) / withCredentials 유지
// --------------------------------------------------------------
import { ref } from 'vue'
import axios from '@/shared/services/api'
import { IonModal, IonButton } from '@ionic/vue'

const props = defineProps({
  // request: {_id, from, to, message, status, ...}
  request: { type: Object, required: true },
})

const emit = defineEmits(['close', 'accepted', 'rejected', 'blocked'])

const isSubmitting = ref(false)
const action = ref('')          // 'accept' | 'reject' | 'block'
const errorMsg = ref('')
const successMsg = ref('')

const closeModal = () => emit('close')

// 공통 처리기: API 호출 래퍼
async function doCall(method, url, okEvent) {
  if (!props.request?._id) {
    errorMsg.value = '요청 ID가 없습니다.'
    console.error('[FriendMessage] missing request._id', props.request)
    return
  }

  if (isSubmitting.value) return
  isSubmitting.value = true
  errorMsg.value = ''
  successMsg.value = ''

  try {
    console.log('[FriendMessage] request start', { method, url, id: props.request._id })
    const res = await axios({ method, url, withCredentials: true })
    console.log('[FriendMessage] request ok', { status: res.status, data: res.data })

    // 성공 메시지 & 상위 알림
    successMsg.value = okEvent === 'accepted'
      ? '친구 수락이 완료되었습니다. 채팅방이 생성됩니다.'
      : okEvent === 'rejected'
      ? '친구 신청을 거절했습니다.'
      : '해당 사용자를 차단했습니다.'

    emit(okEvent, props.request._id)

    // UX: 잠깐 보여주고 닫기
    setTimeout(() => emit('close'), 500)
  } catch (err) {
    const data = err?.response?.data
    const msg = data?.message || data?.error || '처리에 실패했습니다.'
    errorMsg.value = msg
    console.error('[FriendMessage] request fail', { msg, err: data || err })
  } finally {
    isSubmitting.value = false
  }
}

// 액션들
async function accept() {
  action.value = 'accept'
  await doCall('put', `/api/friend-request/${props.request._id}/accept`, 'accepted')
}
async function reject() {
  action.value = 'reject'
  await doCall('put', `/api/friend-request/${props.request._id}/reject`, 'rejected')
}
async function block() {
  action.value = 'block'
  await doCall('put', `/api/friend-request/${props.request._id}/block`, 'blocked')
}
</script>

<style scoped>
/* ── Modal_FriendMessage: CSS 보정만 적용 ───────────────────────────────
   - 모달 쉘(ion-modal) 크기/라운드/백드롭 톤 통일
   - 내부 카드(.modal-container) 가독성/그림자/반응형 패딩
   - 헤더/본문/버튼 간격 및 폰트 스케일 통일
   - 긴 메시지 스크롤 안전(max-height)
   - 터치 타깃(≥40px), safe-area 하단 여백 반영
   - 글자색은 검은색(가독성 요청)
────────────────────────────────────────────────────────────────────── */

/* 모달 자체 톤/크기 */
:deep(ion-modal) {
  --backdrop-opacity: 0.45;
  --width: min(92vw, 420px);
  --height: auto;
  --border-radius: 14px;
  --box-shadow: 0 10px 28px rgba(0,0,0,.20);
}
:deep(ion-modal)::part(content) {
  background: transparent;
  border-radius: 14px;
  overflow: visible;
}

/* 카드 래퍼 */
.modal-container {
  background: #fff;
  color: #000;
  border: 1px solid #eaeaea;
  border-radius: 14px;
  box-shadow: 0 10px 28px rgba(0,0,0,.12);
  padding: 16px 18px;
  font-size: clamp(14px, 2.6vw, 15px);
  max-height: min(86vh, 640px);
  overflow: auto;
  padding-bottom: calc(16px + var(--safe-bottom));
  box-sizing: border-box;
}

/* 헤더: 타이틀 + 닫기 버튼 */
.modal-header {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.modal-header h3 {
  margin: 0;
  font-size: clamp(16px, 3.2vw, 18px);
  font-weight: 800;
  color: #000;
  line-height: 1.25;
}
.modal-header ion-button {
  --border-radius: 12px;
  --padding-start: 12px;
  --padding-end: 12px;
  min-height: 40px;
  font-weight: 600;
}

/* 메시지 박스 */
.message-box {
  padding: 12px;
  background-color: #f6f6f6;
  border-radius: 10px;
  border: 1px solid #e5e5e5;
  margin-bottom: 12px;
  white-space: pre-wrap;
  line-height: 1.45;
  color: #111;
  max-height: 38vh;
  overflow: auto;
}
.message-content {
  margin: 0;
  color: #333;
  word-break: break-word;
}

/* 상태 메시지 */
.msg-error {
  margin: 8px 0;
  color: #b00020;
  font-weight: 700;
  font-size: 13px;
}
.msg-success {
  margin: 8px 0;
  color: #1db954;
  font-weight: 700;
  font-size: 13px;
}

/* 버튼 열 */
.button-row {
  display: grid;
  grid-auto-flow: row;
  gap: 8px;
}
.button-row ion-button {
  --border-radius: 12px;
  --padding-start: 12px;
  --padding-end: 12px;
  min-height: 44px;
  font-weight: 700;
}

/* 포커스 접근성 */
:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(59,130,246,.35);
  border-radius: 10px;
}

/* 초소형 화면(≤360px) 보정 */
@media (max-width: 360px) {
  .modal-container { padding: 14px; }
  .message-box { padding: 10px; }
}
</style>
