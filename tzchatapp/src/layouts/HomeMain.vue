<!-- src/components/.../HomeMain.vue -->
<template>
  <IonPage>
    <!-- 상단 영역 -->
    <IonHeader :translucent="true">
      <div class="top-wrap">
        <TopPoint />
      </div>
    </IonHeader>

    <!-- 가운데 스크롤 영역: IonContent 단일 책임 (fullscreen 제거) -->
    <IonContent class="content">
      <MainPage />
    </IonContent>

    <!-- 하단 고정 영역 -->
    <IonFooter :translucent="true">
      <div class="bottom-wrap">
        <TopMenu />
      </div>
    </IonFooter>
  </IonPage>
</template>

<script setup>
import { IonPage, IonHeader, IonContent, IonFooter } from '@ionic/vue'
import TopMenu from './TopMenu.vue'
import MainPage from './MainPage.vue'
import TopPoint from './TopPoint.vue'
</script>

<style scoped>
/* IonContent 배경 */
.content {
  --background: var(--bg);
}

/* 상단/하단 컨테이너 (필요 시 패딩만) */
.top-wrap,
.bottom-wrap {
  background: rgba(251, 250, 248, 0.94);
  color: var(--text);
}

/* iOS/Android 모두에서 안전 영역 처리 */
:deep(ion-header),
:deep(ion-footer) {
  background: rgba(251, 250, 248, 0.94);
  box-shadow: none;
}

/* TopMenu가 항상 보이도록 별도 오버플로우 금지 */
.bottom-wrap {
  padding: 0 0 2px;
  border-top: 1px solid var(--panel-border);
  backdrop-filter: saturate(160%) blur(20px);
  -webkit-backdrop-filter: saturate(160%) blur(20px);
}
</style>
