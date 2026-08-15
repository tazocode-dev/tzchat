<template>
  <div class="home-page" aria-label="홈 레이아웃">
    <!-- 각 레이아웃이 router-view를 가지므로 현재 경로에 맞는 한쪽만 마운트한다. -->
    <div v-if="!isChatRoute" class="view-host">
      <HomeMain />
    </div>

    <div v-else class="view-host">
      <HomeChat />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import HomeMain from './HomeMain.vue'
import HomeChat from './HomeChat.vue'

const route = useRoute()

const isChatRoute = computed(() => {
  const meta = route.meta || {}
  if (meta.noChrome === true || meta.chat === true) return true
  const p = (route.path || '').toLowerCase()
  return (
    p.startsWith('/home/chat') ||
    p.includes('/home/chatroom') ||
    p.includes('/home/room/')
  )
})
</script>

<style scoped>
.home-page {
  height: 100dvh;
  min-height: 0;
  display: block;
  background: var(--bg);
}

/* 두 뷰 모두 부모 높이를 꽉 채우도록 */
.view-host {
  height: 100%;
  min-height: 0;
}
</style>
