
<!--  -->

<!-- src/components/04910_Page9_Admin/00700_StatsSummary.vue -->
<template>
  <div class="card">
    <!-- ✅ 상단 헤더 -->
    <div class="head">
      <button class="back-btn" @click="goBack">←</button>
      <h3>00700 · 통계 요약</h3>
      <button class="btn" @click="refresh">⟳</button>
    </div>

    <!-- ✅ 상태 -->
    <div v-if="loading" class="note">불러오는 중...</div>
    <div v-if="errorText" class="error">{{ errorText }}</div>

    <!-- ✅ 통계 카드 -->
    <div class="grid" v-if="!loading">
      <div class="stat">오늘 가입<span>{{ stats.todayJoin }}</span></div>
      <div class="stat">주간 가입<span>{{ stats.weekJoin }}</span></div>
      <div class="stat">긴급 매칭 ON<span>{{ stats.emergencyOn }}</span></div>
      <div class="stat">총 회원<span>{{ stats.totalUsers }}</span></div>
    </div>

    <div class="hint">※ 현재는 더미 데이터. adminRouter에 통계 API 추가하면 연동 즉시 가능</div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const loading = ref(false)
const errorText = ref('')
const stats = ref({
  todayJoin: '-',
  weekJoin: '-',
  emergencyOn: '-',
  totalUsers: '-',
})

function goBack() {
  console.log('[ADMIN] 뒤로가기 클릭')
  router.back()
}

async function refresh() {
  loading.value = true
  errorText.value = ''
  try {
    console.log('[ADMIN] Stats refresh (dummy)')
    // TODO: 실제 API 연동 시 아래 주석 해제
    // const r = await fetch('/api/admin/stats', { credentials: 'include' })
    // if (!r.ok) { errorText.value = `통계 조회 실패 (status ${r.status})`; return }
    // stats.value = await r.json()

    // 더미 데이터
    await new Promise(r => setTimeout(r, 300))
    stats.value = {
      todayJoin: 3,
      weekJoin: 21,
      emergencyOn: 1,
      totalUsers: 128,
    }
  } catch (e) {
    console.error('[ADMIN] Stats error', e)
    errorText.value = '네트워크 오류'
  } finally {
    loading.value = false
  }
}

refresh()
</script>

<style scoped>
/* ✅ 다크 테마 + 모바일 최적화 */
.card {
  border: 1px solid #444;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 12px;
  color: #fff;
  background-color: #1e1e1e;
}

/* 상단 영역 */
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}
.head h3 {
  font-size: clamp(16px, 4vw, 18px);
  font-weight: 700;
  margin: 0;
}

.back-btn,
.btn {
  background: none;
  border: 1px solid #666;
  padding: 8px 12px;
  border-radius: 8px;
  color: #fff;
  font-size: clamp(14px, 4vw, 16px);
  cursor: pointer;
}
.back-btn:hover,
.btn:hover {
  background: #333;
}

.note { color: #bbb; font-size: clamp(13px, 3.5vw, 15px); margin-top: 8px; }
.error { color: #ff6b6b; margin-top: 8px; }

/* 통계 카드 그리드 */
.grid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.stat {
  border: 1px solid #333;
  border-radius: 10px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #2a2a2a;
  text-align: center;
}
.stat > b {
  color: #bbb;
  font-size: clamp(13px, 3.5vw, 15px);
}
.stat > span {
  color: #fff;
  font-size: clamp(18px, 5vw, 22px);
  font-weight: 700;
}

/* 작은 화면(≤480px) → 2열, 초소형(≤360px) → 1열 */
@media (max-width: 480px) {
  .grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 360px) {
  .grid { grid-template-columns: 1fr; }
}

.hint {
  margin-top: 10px;
  font-size: clamp(12px, 3vw, 14px);
  color: #888;
  text-align: center;
}
</style>
