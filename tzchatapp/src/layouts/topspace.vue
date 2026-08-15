<template>
  <!-- 빈칸: 홈 버튼, 제스처 영역 피하기 용 -->
  <div class="space" :style="{ height: height }" aria-hidden="true"></div>
</template>

<script setup>
// ✅ props: height (기본값 '80px')
defineProps({
  height: {
    type: String,
    default: '80px'
  }
})
</script>

<style scoped>
.space {
  width: 100%;
  background: var(--bg);
  pointer-events: none; /* 클릭 등 상호작용 막음 */
}
</style>
