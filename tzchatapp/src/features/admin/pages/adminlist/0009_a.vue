
<!--  -->

<!-- src/components/04910_Page9_Admin/01500_SystemConfig.vue -->
<template>
  <div class="card">
    <!-- ✅ 상단 헤더 -->
    <div class="head">
      <button class="back-btn" @click="goBack">←</button>
      <h3>01500 · 시스템 설정</h3>
      <button class="btn" @click="load">⟳</button>
    </div>

    <!-- ✅ 편집 영역 -->
    <div class="row">
      <input class="input" v-model="editKey" placeholder="KEY (예: EMERGENCY_DURATION)" />
      <input class="input" v-model="editValue" placeholder="VALUE (문자/숫자/JSON)" />
      <button class="btn" @click="save">저장</button>
    </div>

    <!-- ✅ 상태 -->
    <div v-if="loading" class="note">불러오는 중...</div>
    <div v-if="error" class="error">{{ error }}</div>

    <!-- ✅ 테이블 -->
    <div class="table-wrap" v-if="!loading && items.length">
      <table class="table">
        <thead>
          <tr>
            <th>KEY</th><th>VALUE</th><th>수정</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="it in items" :key="it._id">
            <td>{{ it.key }}</td>
            <td><code>{{ stringify(it.value) }}</code></td>
            <td>
              <button class="btn" @click="pick(it)">편집</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="!loading && !items.length" class="note">항목 없음</div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/shared/services/api'

const router = useRouter()
const items = ref([])
const loading = ref(false)
const error = ref('')
const editKey = ref('')
const editValue = ref('')

function goBack () {
  console.log('[ADMIN] 뒤로가기 클릭')
  router.back()
}

function stringify (v) { try { return JSON.stringify(v) } catch { return String(v) } }

async function load () {
  loading.value = true; error.value = ''
  try {
    console.log('[ADMIN] GET /api/admin/config')
    const res = await api.get('/api/admin/config')
    const data = res.data
    items.value = data.items || []
  } catch (e) {
    console.error(e)
    const status = e?.response?.status
    error.value = status ? `조회 실패 (${status})` : '네트워크 오류'
  }
  finally { loading.value = false }
}

function pick (it) {
  editKey.value = it.key
  editValue.value = stringify(it.value)
}

async function save () {
  if (!editKey.value) return alert('KEY를 입력하세요')
  try {
    let val
    try { val = JSON.parse(editValue.value) } catch { val = editValue.value }
    await api.put(`/api/admin/config/${encodeURIComponent(editKey.value)}`, { value: val })
    editKey.value = ''; editValue.value = ''
    load()
  } catch (e) { console.error(e); alert('저장 실패') }
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

/* 헤더 */
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

/* 입력 행 */
.row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 10px 0;
  flex-wrap: wrap;
}
.input {
  flex: 1;
  border: 1px solid #555;
  border-radius: 8px;
  padding: 8px;
  color: #fff;
  background: #121212;
  font-size: clamp(14px, 3.8vw, 16px);
}
.input::placeholder { color: #999; }

/* 상태 */
.note { color: #bbb; font-size: clamp(13px, 3.5vw, 15px); margin-top: 8px; }
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

code { word-break: break-all; color: #8ab4f8; }
</style>
