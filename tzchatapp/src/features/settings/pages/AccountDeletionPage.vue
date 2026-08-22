<!-- 계정 탈퇴 화면 -->
<template>
  <ion-page>
    <!-- ✅ 상단 헤더 -->
    <ion-header>
      <ion-toolbar>
        <!-- 뒤로가기 버튼 -->
        <ion-buttons slot="start">
          <ion-button class="back-btn" @click="goBack">←</ion-button>
        </ion-buttons>

        <!-- 가운데 제목 -->
        <ion-title>회원 탈퇴 하기</ion-title>
      </ion-toolbar>
    </ion-header>

    <!-- ✅ 본문 -->
    <ion-content class="ion-padding">
      <!-- 📘 안내: 탈퇴 동작 설명 -->
      <div class="delete-guide">
        <strong>탈퇴 전에 확인해 주세요</strong>
        <p>탈퇴를 신청하면 계정 이용이 중지되고 유예기간이 지난 뒤 영구 삭제됩니다.</p>
        <ul>
          <li>유예기간 동안에는 계정이 비활성 상태로 유지됩니다.</li>
          <li>삭제가 완료된 정보는 복구하기 어렵습니다.</li>
          <li>계속 진행할 경우 아래 탈퇴하기 버튼을 눌러주세요.</li>
        </ul>
        <button class="guide-link" type="button" @click="openDeletionGuide">계정 및 데이터 삭제 안내 보기</button>
      </div>
    </ion-content>

    <!-- ✅ 가장 밑: 탈퇴하기 버튼 (footer) -->
    <ion-footer>
      <ion-toolbar>
        <ion-button
          expand="block"
          color="danger"
          :disabled="deleting"
          @click="onClickDelete"
          aria-label="회원 탈퇴 요청"
        >
          {{ deleting ? '처리 중…' : '탈퇴하기' }}
        </ion-button>
      </ion-toolbar>
    </ion-footer>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonButtons,
  IonButton,
  IonTitle,
  IonContent,
  IonFooter,
  alertController,
  toastController
} from '@ionic/vue'
import { useRouter } from 'vue-router'
import { ref } from 'vue'
import { http } from '@/shared/services/api' // ✅ 공통 HTTP 래퍼 (인터셉터 적용)

const router = useRouter()
const deleting = ref(false)
const openDeletionGuide = () => router.push('/home/legals/v2/data-retention')

/** 뒤로가기 동작 */
const goBack = () => {
  router.back()
}

/** 확인 다이얼로그 */
async function confirmDelete(): Promise<boolean> {
  const alert = await alertController.create({
    header: '정말 탈퇴하시겠습니까?',
    message: '탈퇴 신청 시 계정이 비활성화되고, 14일의 유예기간 후 영구 삭제됩니다.',
    buttons: [
      { text: '취소', role: 'cancel' },
      { text: '확인', role: 'confirm' },
    ],
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  return role === 'confirm'
}

/** 토스트 메시지 */
async function showToast(msg: string) {
  const toast = await toastController.create({
    message: msg,
    duration: 2000,
  })
  await toast.present()
}

/**
 * ✅ 탈퇴 버튼 클릭 핸들러
 * - 1) 사용자 확인(confirm)
 * - 2) /api/account/delete-request (POST) 호출
 * - 3) 성공 시 안내(toast) 후 전용 안내 화면으로 이동
 * - 4) 실패/오류는 toast + 콘솔 로그
 */
const onClickDelete = async () => {
  const confirmed = await confirmDelete()
  if (!confirmed) return

  deleting.value = true
  try {
    const { data } = await http.post('/api/account/delete-request', {})
    const msg = data?.message || data?.data?.message || '탈퇴가 신청되었습니다.'
    await showToast(msg)

    // ✅ 전용 안내 화면으로 이동
    router.replace('/account/deletion-pending')
  } catch (e: any) {
    console.error('[Delete] 요청 실패', { status: e?.response?.status, code: e?.response?.data?.code })
    const status = e?.response?.status
    const m = e?.response?.data?.error || e?.response?.data?.message || e?.message
    if (status && m) await showToast(`탈퇴 신청 실패 (${status}) ${m}`)
    else await showToast('네트워크 오류로 탈퇴 신청에 실패했습니다.')
  } finally {
    deleting.value = false
  }
}
</script>

<style scoped>
ion-toolbar {
  --background: var(--panel-2);
  --color: var(--text);
  padding: 0 6px;
  min-height: 48px;
}
ion-title {
  font-weight: 600;
  font-size: clamp(16px, 4vw, 18px);
  color: var(--text-strong);
  text-align: center;
}

/* ✅ 버튼 */
.back-btn {
  --color: var(--gold-strong);
  font-size: clamp(16px, 4vw, 18px);
  font-weight: 600;
  padding: 4px 8px;
  min-width: 40px;
}
.back-btn:hover {
  --background: var(--gold-soft);
  border-radius: 6px;
}

/* ✅ 본문 */
ion-content {
  --background: var(--bg);
}

.delete-guide {
  margin-top: 16px;
  padding: 20px;
  border: 1px solid #e7c7ca;
  border-radius: 18px;
  background: var(--danger-soft);
  color: var(--text);
  font-size: 14px;
  line-height: 1.65;
}
.delete-guide strong { display: block; color: var(--danger); font-size: 18px; }
.delete-guide p { margin: 8px 0 12px; color: var(--text-dim); }
.delete-guide ul { margin: 0; padding-left: 20px; }
.delete-guide li + li { margin-top: 6px; }
.guide-link { margin-top: 14px; border: 0; padding: 0; background: transparent; color: var(--gold-strong); font-weight: 700; text-decoration: underline; cursor: pointer; }

ion-footer {
  --background: var(--panel-2);
  border-top: 1px solid var(--panel-border);
}
</style>
