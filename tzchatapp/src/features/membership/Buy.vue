<!-- '@/features/membership/Buy.vue' -->
<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>손끝 멤버십</ion-title>

        <!-- 🔙 같은 줄 오른쪽 끝에 '뒤로가기' 버튼 -->
        <ion-buttons slot="end">
          <ion-button @click="$router.back()">뒤로가기</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding membership-safe">
      <!-- 성별 표시 -->
      <section class="membership-section membership-header">
        현재 사용자: <strong>{{ genderLabel }}</strong>
      </section>

      <!-- 분기 렌더링: 남성 → BuyMale / 여성 → BuyFemale -->
      <component :is="componentName" />
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
  IonButtons,
  IonButton,
} from '@ionic/vue'
import { computed } from 'vue'
import { storeToRefs } from 'pinia'

// 공통 스타일
import '@/shared/theme/membership.css'

// 하위 분기 페이지
import BuyMale from '@/features/membership/BuyMale.vue'
import BuyFemale from '@/features/membership/BuyFemale.vue'

// ⚠️ 일부 환경의 TS 플러그인 별칭 문제 회피가 필요하면 상대 경로 사용
import { useUserStore } from '@/shared/stores/user'

const userStore = useUserStore()
const { user } = storeToRefs(userStore)

// 현재 사용자 성별 판단 (기본: 남성)
const isFemale = computed(() => {
  const g = String(user.value?.gender || '').toLowerCase()
  return g.includes('여') || g === 'female'
})
const genderLabel = computed(() => (isFemale.value ? '여성 회원' : '남성 회원'))

// 렌더링할 컴포넌트 결정
const componentName = computed(() => (isFemale.value ? BuyFemale : BuyMale))
</script>

<style scoped>
/* 페이지 자체의 추가 커스텀은 최소화.
   공통 스타일은 /src/theme/membership.css 사용 */
</style>
