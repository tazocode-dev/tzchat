
<!--  -->

<!-- src/components/04910_Page9_Admin/01300_ReportsTable.vue -->
<template>
  <div class="card">
    <!-- ✅ 상단 헤더 -->
    <div class="head">
      <button class="back-btn" @click="goBack">← 뒤로가기</button>
      <h3>01300 · 신고 관리</h3>
      <button class="btn" @click="load">새로고침</button>
    </div>

    <!-- ✅ 상태 -->
    <div v-if="loading" class="note">불러오는 중...</div>
    <div v-if="error" class="error">{{ error }}</div>

    <!-- ✅ 테이블 -->
    <div class="table-wrap" v-if="!loading && reports.length">
      <table class="table">
        <thead>
          <tr>
            <th>시간</th>
            <th>신고자</th>
            <th>피신고자</th>
            <th>사유</th>
            <th>상태</th>
            <th>액션</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in reports" :key="r._id">
            <td>{{ r.createdAt }}</td>
            <td>{{ r.reporter?.nickname || r.reporter?.username }}</td>
            <td>{{ r.reported?.nickname || r.reported?.username }}</td>
            <td>{{ r.reason }}</td>
            <td>{{ r.status }}</td>
            <td class="actions">
              <button class="btn" @click="setStatus(r,'warned')">경고</button>
              <button class="btn warn" @click="setStatus(r,'blocked')">차단</button>
              <button class="btn" @click="setStatus(r,'dismissed')">무시</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="!loading && !reports.length" class="note">신고 없음</div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/shared/services/api'

const router = useRouter()
const loading = ref(false)
const error = ref('')
const reports = ref([])

function goBack () {
  console.log('[ADMIN] 뒤로가기 클릭')
  router.back()
}

async function load () {
  loading.value = true; error.value = ''
  try {
    console.log('[ADMIN] GET /api/admin/reports')
    const res = await api.get('/api/admin/reports')
    const data = res.data
    reports.value = data.reports || []
  } catch (e) {
    console.error(e)
    const status = e?.response?.status
    error.value = status ? `조회 실패 (${status})` : '네트워크 오류'
  } finally { loading.value = false }
}

async function setStatus (rpt, status) {
  try {
    await api.put(`/api/admin/reports/${rpt._id}/status`, { status })
    load()
  } catch (e) { console.error(e); alert('변경 실패') }
}

onMounted(load)
</script>

<style scoped>
/* ✅ 다크 테마 + 흰색 글씨 + 모바일 대응 */
.card {
  border: 1px solid #444;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 12px;
  color: #fff;
  background-color: #1e1e1e;
}

/* 상단 헤더 */
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.head h3 {
  font-size: clamp(16px, 4vw, 18px);
  margin: 0;
  font-weight: 700;
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
.btn:hover { background: #333; }
.btn.warn { border-color:#aa7700 }

/* 상태 */
.note { color: #bbb; font-size: clamp(13px,3.5vw,15px); margin-top: 8px; }
.error { color: #ff6b6b; margin-top: 8px; }

/* 테이블 */
.table-wrap {
  overflow: auto;
  border: 1px solid #333;
  border-radius: 8px;
  margin-top: 10px;
}
.table {
  width: 100%;
  border-collapse: collapse;
  min-width: 720px;
}
th, td {
  border-bottom: 1px solid #2c2c2c;
  padding: 8px 10px;
  text-align: left;
  color: #fff;
  font-size: clamp(13px, 3.5vw, 15px);
}
thead th {
  background: #252525;
  font-weight: 700;
}
tr:hover { background:#2a2a2a; cursor:pointer; }

/* 액션 버튼 그룹 */
.actions { display:flex; gap:6px; flex-wrap:wrap; }
</style>
