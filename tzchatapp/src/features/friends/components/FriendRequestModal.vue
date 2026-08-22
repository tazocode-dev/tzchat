<template>
  <Teleport to="body">
    <div class="popup-overlay" @click.self="onClose">
    <div class="popup-modal">
      <!-- 헤더 -->
      <div class="modal-header">
        <h3 class="title">
          매칭 신청
          <small class="to-nickname"> {{ toNickname }}</small>
        </h3>
        <!-- 라인형 버튼(테마 클래스) 
        <IonButton size="small" class="btn-outline" @click="onClose">닫기</IonButton>
        -->
      </div>

      <!-- 본문 -->
      <div class="modal-body">
        <label class="label" for="friend-msg">인사말 (선택)</label>
        <textarea
          id="friend-msg"
          v-model.trim="message"
          class="message-input"
          rows="5"
          maxlength="300"
          placeholder="예) 안녕하세요! 친하게 지내요 :)"
        ></textarea>

        <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
        <p v-if="successMsg" class="success-msg">{{ successMsg }}</p>
      </div>

      <!-- 풋터 -->
      <div class="modal-footer">
        <IonButton
          expand="block"
          class="btn-primary glow"
          :disabled="isSubmitting"
          @click="onSubmit"
        >
          {{ isSubmitting ? '전송 중...' : '신청하기' }}
        </IonButton>
        <IonButton expand="block" class="btn-muted" @click="onCancel">취소</IonButton>
      </div>
    </div>
    </div>
  </Teleport>
</template>

<script setup>
// --------------------------------------------------------------
// 일반 친구 신청 모달
// - 친구 신청 모달
// - 핵심: 성공 시 'submitted' 이벤트로 { requestId } emit
// - 공통 axios 인스턴스 사용(토큰/쿠키 일원화)
// --------------------------------------------------------------
import { ref, onMounted } from 'vue'
import { IonButton } from '@ionic/vue'
import axios from '@/shared/services/api' // ✅ 공통 인스턴스

const props = defineProps({
  toUserId: { type: String, required: true },
  toNickname: { type: String, required: true },
  // 부모에서 전달할 수도 있는 기본 메시지(없으면 '')
  defaultMessage: { type: String, default: '' }
})

// ✅ 부모 호환: submitted / cancel / close (requestSent는 하위 호환용)
const emit = defineEmits(['submitted', 'cancel', 'close', 'requestSent'])

const message = ref('')
const isSubmitting = ref(false)
const errorMsg = ref('')
const successMsg = ref('')

onMounted(() => {
  message.value = props.defaultMessage || ''
})

function onClose () {
  emit('close')
}

function onCancel () {
  emit('cancel')
  emit('close')
}

async function onSubmit () {
  if (isSubmitting.value) return
  isSubmitting.value = true
  errorMsg.value = ''
  successMsg.value = ''

  try {
    const payload = {
      to: props.toUserId,              // ✅ 핵심: toUserId → to
      message: message.value || ''
    }
    // ✅ 공통 인스턴스 사용(Authorization/Cookie 일원화)
    const { data } = await axios.post('/api/friend-request', payload, { withCredentials: true })

    // ✅ 다양한 응답 포맷에서 requestId 추출
    const requestId =
      data?._id ??
      data?.request?._id ??
      data?.data?._id ??
      data?.requestId ??
      null

    successMsg.value = '매칭 신청이 전송되었습니다.'

    // ✅ 표준 이벤트로 즉시 부모 갱신 → 버튼이 곧바로 "신청취소"로 전환됨
    emit('submitted', { requestId })

    // 하위 호환 이벤트(필요시 사용)
    emit('requestSent', { requestId, raw: data })

    setTimeout(() => emit('close'), 150)
  } catch (err) {
    const status = err?.response?.status
    const data = err?.response?.data
    const msg = data?.error || data?.message || err?.message || '친구 신청에 실패했습니다.'
    errorMsg.value = msg
    console.error('[FriendRequestModal] submit failed', {
      status,
      code: data?.code || data?.errorCode,
    })
  } finally {
    isSubmitting.value = false
  }
}
</script>

<style scoped>
/* body로 Teleport되어도 테마 상속이 끊기지 않도록 모달 자체 색을 명시한다. */

/* 오버레이 (반투명 블랙) */
.popup-overlay {
  position: fixed;
  inset: 0;
  background: rgba(36,33,31,.62);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}

/* 모달 박스 */
.popup-modal {
  width: min(560px, 100%);
  background: #ffffff;
  border: 1px solid #ddd5cb;
  border-radius: 20px;
  box-shadow: 0 22px 60px rgba(36,33,31,.28);
  padding: 18px;
  color: #28231f;
  opacity: 1;
}

/* 헤더 */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 2px 10px 2px;
  border-bottom: 1px solid #ddd5cb;
}
.title { margin: 0; font-size: 18px; font-weight: 800; color: #17130f; }
.to-nickname { margin-left: 6px; font-size: 12px; font-weight: 600; color: #625b55; }

/* 본문 */
.modal-body { padding: 12px 2px; }
.label { display: block; margin-bottom: 6px; font-weight: 700; color: #28231f; }
.message-input {
  width: 100%;
  min-height: 120px;
  border: 1px solid #cfc5ba;
  border-radius: 14px;
  padding: 12px;
  line-height: 1.4;
  font-size: 14px;
  color: #28231f;
  background: #ffffff;
  outline: none;
}
.message-input::placeholder { color: #746d67; }
.message-input:focus {
  border-color: #8f6124;
  box-shadow: 0 0 0 3px rgba(143,97,36,.16);
}

/* 메시지 */
.error-msg { margin-top: 8px; font-size: 13px; color: #ad3542; }
.success-msg { margin-top: 8px; font-size: 13px; color: #32704a; }

/* 풋터 */
.modal-footer {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid #ddd5cb;
}

/* IonButton 테마 클래스(전역 theme-gold.css와 톤 맞춤) */
.btn-primary {
  --background: #8f6124;
  --background-hover: #6f4516;
  --background-activated: #6f4516;
  --color: #ffffff;
  --border-radius: 14px;
  font-weight: 700;
}
.btn-muted {
  --background: transparent;
  --color: #28231f;
  --border-color: #cfc5ba;
  --border-style: solid;
  --border-width: 1px;
  --border-radius: 14px;
  font-weight: 700;
}
.btn-outline {
  --background: transparent;
  --color: #8f6124;
  --border-color: #8f6124;
  --border-style: solid;
  --border-width: 1px;
  --border-radius: 12px;
  font-weight: 700;
}

/* 살짝 반짝이는 강조 */
.glow {
  box-shadow: none;
}

/* 접근성 포커스 */
:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(255,213,79,.25);
  border-radius: 10px;
}
</style>
