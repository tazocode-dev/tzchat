<!-- src/views/DeletionPending.vue -->
<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>탈퇴 신청 상태</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <h2>계정이 탈퇴 신청 상태입니다</h2>
      <p>유예기간 동안 일반 기능 이용이 제한됩니다.</p>

      <p v-if="scheduledAt">예정 삭제일: {{ scheduledAt }}</p>
      <p v-if="remaining">{{ remaining }}</p>

      <ion-button expand="block" :disabled="loading" @click="cancel">
        {{ loading ? '처리 중…' : '탈퇴 신청 취소하기' }}
      </ion-button>

      <ion-button expand="block" fill="outline" @click="logout">로그아웃</ion-button>
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
  try { await AuthAPI.logout() }
  finally { router.replace('/login') }
}
</script>

<style scoped>
ion-content {
  --background: #121212; /* 다크 배경 */
  color: #fff;           /* 기본 글씨 색 */
}

h2, p {
  color: #fff;
}
</style>
