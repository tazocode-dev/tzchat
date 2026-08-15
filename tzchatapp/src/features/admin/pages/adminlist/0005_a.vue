
<!--  -->

<!-- src/components/04910_Page9_Admin/00800_OnlineStatusCard.vue -->
<template>
  <div class="card">
    <!-- ✅ 상단 헤더: 뒤로가기 + 제목 + 새로고침 -->
    <div class="head">
      <button class="back-btn" @click="goBack" aria-label="뒤로가기">←</button>
      <h3>00800 · 온라인/방 현황</h3>
      <button class="btn" @click="refresh" aria-label="새로고침">⟳</button>
    </div>

    <!-- ✅ 상태 표시 -->
    <div v-if="loading" class="note">불러오는 중...</div>
    <div v-if="error" class="error">{{ error }}</div>

    <!-- ✅ 본문 -->
    <div v-if="data" class="body">
      <div class="row">
        소켓 수<span>{{ data.sockets }}</span>
      </div>
      <div class="row">
        온라인 유저<span>{{ data.onlineUsers.length }}</span>
      </div>

      <div class="row">
        방 현황
        <div class="rooms">
          <div
            v-for="r in data.rooms"
            :key="r.roomId"
            class="badge"
            :title="`roomId: ${r.roomId}, count: ${r.count}`"
          >
            {{ r.roomId }} ({{ r.count }})
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// ▷ 유지사항: API 로직 그대로, 콘솔 로그 강화
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/shared/services/api'

const router = useRouter()

const loading = ref(false)
const error = ref('')
const data = ref(null)

/** 뒤로가기 */
function goBack() {
  console.log('[ADMIN] 뒤로가기 클릭')
  router.back()
}

/** 현황 새로고침 */
async function refresh() {
  loading.value = true
  error.value = ''
  try {
    console.log('[ADMIN] GET /api/admin/online')
    const res = await api.get('/api/admin/online')
    const json = res.data
    data.value = json
    console.log('[ADMIN] online status loaded', {
      sockets: json?.sockets,
      onlineUsers: json?.onlineUsers?.length,
      rooms: json?.rooms?.length
    })
  } catch (e) {
    const status = e?.response?.status
    if (status) {
      console.warn('[ADMIN] /api/admin/online not ok:', status)
      error.value = `조회 실패 (${status})`
    } else {
      console.error('[ADMIN] online status error', e)
      error.value = '네트워크 오류'
    }
  } finally {
    loading.value = false
  }
}

onMounted(refresh)
</script>

<style scoped>
/* ✅ 다크 테마 + 흰색 글씨 + 모바일 최적화 */
.card{
  border:1px solid #444;
  border-radius:12px;
  padding:14px;
  margin-bottom:12px;
  color:#fff;                   /* 기본 텍스트 흰색 */
  background-color:#1e1e1e;    /* 다크 배경 */
}

/* 상단 영역 */
.head{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:8px;
  margin-bottom:12px;
}
.head h3{
  font-size:clamp(16px, 4vw, 18px);
  font-weight:700;
  margin:0;
}

.back-btn,
.btn{
  background:none;
  border:1px solid #666;
  padding:8px 12px;            /* 터치 영역 확보 */
  border-radius:8px;
  color:#fff;
  font-size:clamp(14px, 4vw, 16px);
  cursor:pointer;
  line-height:1;
}
.back-btn:hover,
.btn:hover{ background:#333; }

/* 상태 텍스트 */
.note{ color:#bbb; font-size:clamp(13px, 3.5vw, 15px); margin-top:8px; }
.error{ color:#ff6b6b; margin-top:8px; }

/* 본문/행 레이아웃 */
.body{ margin-top:8px; }
.row{
  display:grid;
  grid-template-columns: 140px 1fr;
  gap:8px;
  margin:8px 0;
}
.row > b{
  color:#bbb;
  font-weight:700;
  font-size:clamp(13px, 3.5vw, 15px);
}
.row > span{
  color:#fff;
  font-size:clamp(14px, 3.8vw, 16px);
}

/* 방 뱃지 리스트 */
.rooms{
  display:flex;
  gap:8px;
  flex-wrap:wrap;
}
.badge{
  border:1px solid #444;
  border-radius:999px;
  padding:6px 10px;
  font-size:clamp(12px, 3.2vw, 14px);
  color:#fff;
  background:#2a2a2a;
  white-space:nowrap;           /* 한 뱃지 내부 줄바꿈 방지 */
}
.badge:hover{ background:#333; }

/* 초소형 화면 대응(≤360px): 라벨-값 1열 변환로직 */
@media (max-width: 360px) {
  .row{
    grid-template-columns: 1fr;
  }
}
</style>
