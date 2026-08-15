
<!--  -->

<!-- src/components/04910_Page9_Admin/01400_ChatRoomsTable.vue -->
<template>
  <div class="card">
    <!-- ✅ 상단 헤더 -->
    <div class="head">
      <button class="back-btn" @click="goBack">←</button>
      <h3>01400 · 채팅방 목록</h3>
      <button class="btn" @click="load">⟳</button>
    </div>

    <!-- ✅ 상태 -->
    <div v-if="loading" class="note">불러오는 중...</div>
    <div v-if="error" class="error">{{ error }}</div>

    <!-- ✅ 테이블 -->
    <div class="table-wrap" v-if="!loading && rooms.length">
      <table class="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>참여자 수</th>
            <th>메시지 수</th>
            <th>갱신</th>
            <th>액션</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rooms" :key="r._id">
            <td>{{ r._id }}</td>
            <td>{{ r.participants?.length || 0 }}</td>
            <td>{{ r.messages?.length || 0 }}</td>
            <td>{{ r.updatedAt }}</td>
            <td>
              <button class="btn danger" @click="remove(r)">삭제</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="!loading && !rooms.length" class="note">데이터 없음</div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/shared/services/api'

const router = useRouter()
const loading = ref(false)
const error = ref('')
const rooms = ref([])

function goBack () {
  console.log('[ADMIN] 뒤로가기 클릭')
  router.back()
}

async function load () {
  loading.value = true; error.value = ''
  try {
    console.log('[ADMIN] GET /api/admin/chatrooms')
    const res = await api.get('/api/admin/chatrooms')
    const data = res.data
    rooms.value = data.rooms || []
  } catch (e) {
    console.error(e)
    const status = e?.response?.status
    error.value = status ? `조회 실패 (${status})` : '네트워크 오류'
  }
  finally { loading.value = false }
}

async function remove (room) {
  if (!confirm('삭제하시겠습니까?')) return
  try {
    await api.delete(`/api/admin/chatrooms/${room._id}`)
    load()
  } catch (e) { console.error(e); alert('삭제 실패') }
}

onMounted(load)
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

/* 상단 헤더 */
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
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
.btn.danger { border-color: #b00020 }

/* 상태 */
.note { color: #bbb; font-size: clamp(13px,3.5vw,15px); margin-top: 8px; }
.error { color: #ff6b6b; margin-top: 8px; }

/* 테이블 */
.table-wrap {
  overflow-x: auto;
  border: 1px solid #333;
  border-radius: 8px;
  margin-top: 10px;
}
.table {
  width: 100%;
  border-collapse: collapse;
  min-width: 600px;
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
tr:hover { background: #2a2a2a; cursor: pointer; }
</style>
