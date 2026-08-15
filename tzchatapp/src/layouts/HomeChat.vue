<!-- src/components/.../HomeChat.vue -->
<template>
  <div class="home-chat-root" aria-label="채팅 레이아웃">
    <!-- 채팅 전용: 단일 영역. 내부(MainChat)가 스크롤/키보드 인셋을 직접 관리 -->
    <MainChat class="main-area" />
  </div>
</template>

<script setup>
import MainChat from './MainChat.vue'
</script>

<style scoped>
/**
 * HomePage.vue에서 이미 height:100dvh를 잡고 있음
 * 여기서는 "자식이 부모를 꽉 채우고, 추가 스크롤을 만들지 않는 것"이 핵심
 */
.home-chat-root {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  color: var(--text);
  overflow: hidden; /* ✅ 루트 스크롤 금지 */
}

/**
 * ✅ 기존 TopSpace(6vh) 대체
 * - iOS safe-area + 약간의 고정 padding
 * - Android에서도 키보드 올라올 때 vh처럼 흔들리지 않음
 */
/* MainChat이 부모를 꽉 채우고, 자체적으로 스크롤/인셋 제어 */
.main-area {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden; /* ✅ 스크롤은 MainChat/ChatroomPage 내부에서만 */
  overscroll-behavior: contain;
}
</style>
