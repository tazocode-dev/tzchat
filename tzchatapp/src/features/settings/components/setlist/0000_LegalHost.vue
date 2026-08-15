<template>
  <!-- 부모(HomePage)의 헤더/탭을 그대로 쓰기 위해 IonHeader를 제거 -->
  <ion-page class="legal-host-page">
    <ion-content :fullscreen="true" class="ion-no-padding">
      <!-- 상단 내부 타이틀바(간단 버튼) - 필요 없으면 이 div 통째로 삭제해도 됩니다 -->
      <div class="legal-topbar">
        <button class="back-btn" @click="goBack" aria-label="뒤로가기">←</button>
        <div class="title">약관 및 정책</div>
        <div class="spacer" />
      </div>

      <!-- 서버의 /legal 또는 /legal/:slug 를 그대로 표시 -->
      <div class="iframe-wrap">
        <iframe
          :src="iframeSrc"
          class="legal-iframe"
          title="법적 문서"
          referrerpolicy="no-referrer"
        ></iframe>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { IonPage, IonContent } from '@ionic/vue'

const route = useRoute()
const router = useRouter()

// 같은 도메인에서 백엔드가 /legal 제공 중이면 빈 문자열 사용
const base = ''

const iframeSrc = computed(() => {
  const slug = route.params.slug as string | undefined
  return slug ? `${base}/legal/${encodeURIComponent(slug)}` : `${base}/legal`
})

function goBack() {
  router.back()
}
</script>

<style scoped>
/* 전체 영역을 정확히 채우기 위한 레이아웃 */
.legal-host-page,
.legal-host-page ion-content {
  --background: #0b0b0d; /* 테마에 맞춰 배경 지정(선택) */
  height: 100%;
}

.legal-topbar{
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 10px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  color: #f3f3f3;
}
.back-btn{
  background: transparent;
  border: 0;
  color: inherit;
  font-size: 18px;
  line-height: 1;
  padding: 6px 8px;
  cursor: pointer;
}
.title{
  font-weight: 800;
  font-size: 15px;
}
.spacer{ flex: 1; }

/* iframe이 남은 화면을 꽉 채우도록 flex로 배치 */
.iframe-wrap{
  position: relative;
  display: flex;
  flex-direction: column;
  height: calc(100% - 44px); /* 상단 바 높이만큼 제외 */
}
.legal-iframe{
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
}
</style>
