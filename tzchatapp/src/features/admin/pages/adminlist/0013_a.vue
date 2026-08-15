
<!--  -->

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
        <ion-title>간단 페이지</ion-title>
      </ion-toolbar>
    </ion-header>

    <!-- ✅ 본문 -->
    <ion-content class="ion-padding">
      <p class="text-white">준비 중 입니다.</p>
    </ion-content>
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
  IonContent
} from '@ionic/vue'
import { useRouter } from 'vue-router'

const router = useRouter()

/** 뒤로가기 동작 */
const goBack = () => {
  console.log('[SimplePage] 뒤로가기 클릭')
  router.back()
}
</script>

<style scoped>
/* ✅ 상단바 스타일 */
ion-toolbar {
  --background: #1e1e1e; /* 다크 배경 */
  --color: #fff;         /* 기본 텍스트 흰색 */
  padding: 0 6px;
  min-height: 48px;
}
ion-title {
  font-weight: 600;
  font-size: clamp(16px, 4vw, 18px);
  color: #fff;
  text-align: center;
}

/* ✅ 버튼 */
.back-btn {
  color: #fff;
  font-size: clamp(16px, 4vw, 18px);
  font-weight: 600;
  padding: 4px 8px;
  min-width: 40px;
}
.back-btn:hover {
  background: rgba(255,255,255,0.1);
  border-radius: 6px;
}

/* ✅ 본문 */
ion-content {
  --background: #121212;
}

.text-white {
  color: #fff; /* 본문 글씨 흰색 */
  font-size: clamp(14px, 3.8vw, 16px);
  line-height: 1.5;
}
</style>
