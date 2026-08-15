<!-- src/components/.../MainPage.vue -->
<template>
  <div class="main-page" :class="{ 'main-page--full-route': isFullPageRoute }">
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const isFullPageRoute = computed(() => {
  const path = String(route.path || '')
  return path.startsWith('/home/setting/')
})
</script>

<style scoped>
.main-page {
  /* ✅ IonContent(부모)가 스크롤을 담당하므로, 자식은 “딱 맞게”만 채운다 */
  flex: 1 1 auto;     /* ✅ 부모가 flex일 때 가장 안전 */
  min-height: 0;      /* ✅ 이게 없으면 자식이 커져서 스크롤/레이아웃 꼬임 원인 */

  position: relative;
  box-sizing: border-box;

  /* ✅ 여기서 스크롤 만들지 않기 (IonContent 단일 스크롤 유지) */
  overflow: hidden;

  /* 테마/패딩 */
  background-color: var(--bg);
  padding: 12px;
}

/* 자체 IonHeader/IonContent를 가진 설정·법적 안내 하위 페이지의 기준 영역 */
.main-page--full-route {
  height: 100%;
  padding: 0;
}

/* (옵션) 모바일 최소 패딩 유지 */
@media (max-width: 360px) {
  .main-page { padding: 8px; }
  .main-page--full-route { padding: 0; }
}
</style>
