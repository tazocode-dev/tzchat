<template>
  <div class="main-chat">
    <router-view />
  </div>
</template>

<style scoped>
/**
 * 부모(HomeChat)가 height:100%를 이미 보장하므로
 * 여기서는 100%로만 채워서 dvh 재계산 비용을 피한다.
 */
.main-chat {
  position: relative;
  height: 100%;
  min-height: 0;

  display: flex;
  flex-direction: column;

  overflow: hidden; /* 스크롤은 하위(ChatRoomPage 등)에서 */
  background-color: var(--bg);
}
</style>
