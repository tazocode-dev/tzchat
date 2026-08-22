<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>탈퇴 신청 상태</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="pending-content ion-padding">
      <main class="pending-shell">
        <section class="pending-card" aria-labelledby="deletion-pending-title" :aria-busy="loading || loggingOut">
          <span class="status-badge">탈퇴 처리 대기</span>
          <h1 id="deletion-pending-title">계정이 탈퇴 신청 상태입니다</h1>
          <p class="description">
            14일의 유예기간 동안 일반 기능 이용이 제한되며, 기간 안에는 탈퇴 신청을 취소할 수 있습니다.
          </p>

          <div v-if="scheduledAt || remaining" class="status-panel">
            <p v-if="scheduledAt"><strong>예정 삭제일</strong><span>{{ scheduledAt }}</span></p>
            <p v-if="remaining" class="remaining" aria-live="polite"><strong>남은 시간</strong><span>{{ remaining }}</span></p>
          </div>

          <div class="actions">
            <ion-button expand="block" :disabled="loading || loggingOut" @click="cancel">
              {{ loading ? '처리 중…' : '탈퇴 신청 취소하기' }}
            </ion-button>

            <ion-button
              class="logout-button"
              expand="block"
              fill="outline"
              :disabled="loading || loggingOut"
              @click="logout"
            >
              {{ loggingOut ? '로그아웃 중…' : '로그아웃' }}
            </ion-button>
          </div>
        </section>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  alertController,
  toastController,
} from '@ionic/vue'
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { auth as AuthAPI, http } from '@/shared/services/api'

const router = useRouter()
const loading = ref(false)
const loggingOut = ref(false)
const scheduledAt = ref<string>('')
const remaining = ref<string>('')

let timer: number | null = null

onMounted(async () => {
  try {
    const { data } = await http.get('/api/account/status')
    const scheduled =
      data?.pendingDeletion?.scheduledAt ||
      data?.data?.pendingDeletion?.scheduledAt

    if (scheduled) {
      const due = new Date(scheduled)
      scheduledAt.value = due.toLocaleString()

      // ✅ 카운트다운 시작
      timer = window.setInterval(() => {
        const now = new Date()
        const diff = due.getTime() - now.getTime()

        if (diff <= 0) {
          remaining.value = '곧 삭제됩니다.'
          if (timer) {
            clearInterval(timer)
            timer = null
          }
          return
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24))
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24)
        const mins = Math.floor((diff / (1000 * 60)) % 60)
        const secs = Math.floor((diff / 1000) % 60)
        remaining.value = `${days}일 ${hours}시간 ${mins}분 ${secs}초 남음`
      }, 1000)
    }
  } catch {
    // 상태 조회 실패 시 무시
  }
})

onUnmounted(() => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
})

/** 확인 다이얼로그 */
async function confirmCancel(): Promise<boolean> {
  const alert = await alertController.create({
    header: '탈퇴 신청을 취소하시겠습니까?',
    buttons: [
      { text: '아니오', role: 'cancel' },
      { text: '예', role: 'confirm' },
    ],
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  return role === 'confirm'
}

/** 토스트 */
async function showToast(message: string) {
  const toast = await toastController.create({ message, duration: 2000 })
  await toast.present()
}

const cancel = async () => {
  const ok = await confirmCancel()
  if (!ok) return

  loading.value = true
  try {
    const { data } = await http.post('/api/account/cancel-delete', {})
    await showToast(data?.message || data?.data?.message || '탈퇴 신청이 취소되었습니다.')
    router.replace('/')
  } catch (e: any) {
    const msg = e?.response?.data?.error || e?.response?.data?.message || '취소 실패'
    await showToast(msg)
  } finally {
    loading.value = false
  }
}

const logout = async () => {
  if (loading.value || loggingOut.value) return
  loggingOut.value = true
  try { await AuthAPI.logout() }
  finally { router.replace('/login') }
}
</script>

<style scoped>
.pending-content {
  --background: var(--bg);
  color: var(--text);
}

.pending-shell {
  width: min(100%, 560px);
  min-height: 100%;
  margin: 0 auto;
  display: grid;
  align-content: center;
  padding: 24px 0;
}

.pending-card {
  padding: clamp(22px, 6vw, 32px);
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-lg);
  background: var(--panel);
  box-shadow: 0 12px 32px rgba(68, 52, 38, 0.1);
}

.status-badge {
  display: inline-flex;
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 13px;
  font-weight: 800;
}

h1 {
  margin: 16px 0 8px;
  color: var(--text-strong);
  font-size: clamp(22px, 6vw, 28px);
  line-height: 1.35;
}

.description {
  margin: 0;
  color: var(--text-dim);
  line-height: 1.65;
}

.status-panel {
  margin: 22px 0;
  padding: 14px 16px;
  border: 1px solid var(--panel-border);
  border-radius: var(--radius-md);
  background: var(--panel-2);
}

.status-panel p {
  margin: 0;
  display: grid;
  gap: 3px;
}

.status-panel p + p {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--panel-border);
}

.status-panel strong {
  color: var(--text-dim);
  font-size: 13px;
}

.status-panel span {
  color: var(--text-strong);
  font-weight: 700;
}

.remaining span {
  color: var(--danger);
}

.actions {
  display: grid;
  gap: 10px;
}

.logout-button {
  --border-color: var(--panel-border);
  --color: var(--gold-strong);
}
</style>
