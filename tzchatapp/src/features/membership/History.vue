<!-- front/components/05110_Membership/History.vue -->
<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>결제 이력</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding membership-safe">
      <!-- ✅ 로딩 -->
      <section v-if="loading" class="membership-center mt-6">
        <ion-spinner name="crescent" />
      </section>

      <!-- ✅ 오류 -->
      <section v-else-if="error" class="membership-center membership-error mt-6">
        {{ error }}
      </section>

      <!-- ✅ 이력 목록 -->
      <section v-else-if="orders.length" class="history-list">
        <div v-for="item in orders" :key="item.id" class="history-card">
          <div class="history-header">
            <h3>{{ item.planName }}</h3>
            <span class="price">{{ item.priceDisplay }}</span>
          </div>
          <p class="status">상태: {{ statusLabel(item.status) }}</p>
          <p class="time" v-if="item.paidAt">
            결제일: {{ formatDate(item.paidAt) }}
          </p>
          <p class="note" v-if="item.note">{{ item.note }}</p>
        </div>
      </section>

      <!-- ✅ 데이터 없음 -->
      <section v-else class="membership-center mt-10">
        <p>결제 이력이 없습니다.</p>
      </section>
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
  IonSpinner,
} from '@ionic/vue'
import { ref, onMounted } from 'vue'
import '@/shared/theme/membership.css'
import { fetchHistory, type HistoryItem } from '@/shared/services/membershipApi'
import { useUserStore } from '@/shared/stores/user'

const userStore = useUserStore()
const orders = ref<HistoryItem[]>([])
const loading = ref(false)
const error = ref('')

onMounted(async () => {
  try {
    loading.value = true
    if (!userStore.user?._id) {
      error.value = '로그인이 필요합니다.'
      return
    }

    const res = await fetchHistory(userStore.user._id)
    if (res.ok) {
      orders.value = res.orders
    } else {
      error.value = res.error || '이력 조회 실패'
    }
  } catch (e) {
    console.error(e)
    error.value = '결제 이력을 불러오는 중 오류가 발생했습니다.'
  } finally {
    loading.value = false
  }
})

function statusLabel(s: string): string {
  switch (s) {
    case 'mock_paid':
    case 'paid':
      return '결제 완료'
    case 'cancelled':
      return '취소됨'
    case 'refunded':
      return '환불됨'
    default:
      return s
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
}
</script>

<style scoped>
.history-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.history-card {
  border: 1px solid var(--ion-color-medium);
  border-radius: 12px;
  padding: 1rem;
  background: var(--ion-color-light);
}
.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.price {
  font-weight: bold;
  color: var(--ion-color-primary);
}
.status {
  font-size: 0.9rem;
  color: var(--ion-color-medium);
}
.time {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
}
.note {
  font-size: 0.8rem;
  margin-top: 0.3rem;
  color: var(--ion-color-dark);
}
</style>
