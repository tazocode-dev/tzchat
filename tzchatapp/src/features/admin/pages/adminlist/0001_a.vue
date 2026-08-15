
<!--  -->

<template>
  <div class="card">
    <!-- ✅ 상단 헤더 (뒤로가기 버튼 + 제목 + 점검하기 버튼) -->
    <div class="head">
      <button class="back-btn" @click="goBack">← 뒤로가기</button>
      <h3>00100 · 서버 연결 점검 (Heartbeat)</h3>
      <button class="btn" @click="checkHeartbeat">점검하기</button>
    </div>

    <!-- ✅ 상태 메시지 -->
    <div v-if="loading" class="note">점검 중...</div>
    <div v-if="errorText" class="error">{{ errorText }}</div>

    <!-- ✅ 결과 출력 -->
    <div v-if="lastResult" class="body">
      <div>ok: {{ lastResult.ok }}</div>
      <div>message: {{ lastResult.message }}</div>
      <div>serverTime: {{ lastResult.serverTime }}</div>
      <div>latency(ms): {{ lastLatency }}</div>
    </div>
  </div>
</template>

<script setup>
// Heartbeat 버튼 하나로 /api/admin/heartbeat 호출
// - 반드시 로그인 + role=master 계정이어야 200 OK (아니면 401/403)
// - 부모에게 latency(ms) 이벤트로 전달

import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/shared/services/api'

const router = useRouter()
const emit = defineEmits(['latency'])

const lastResult = ref(null)
const errorText = ref('')
const loading = ref(false)
const lastLatency = ref(null)

/** 뒤로가기 */
function goBack() {
  console.log('[ADMIN] 뒤로가기 버튼 클릭')
  router.back()
}

/** Heartbeat 체크 */
async function checkHeartbeat() {
  const t0 = Date.now()
  lastResult.value = null
  errorText.value = ''
  loading.value = true

  try {
    console.log('[ADMIN] call /api/admin/heartbeat ...')
    const res = await api.get('/api/admin/heartbeat')
    const ms = Date.now() - t0

    const data = res.data
    lastResult.value = data
    lastLatency.value = ms
    emit('latency', ms)
    console.log('[ADMIN] heartbeat success', { ms, data })
  } catch (e) {
    const ms = Date.now() - t0
    const status = e?.response?.status
    if (status) {
      console.warn('[ADMIN] heartbeat not ok', status)
      errorText.value = `heartbeat 실패 (status ${status})`
      lastLatency.value = ms
      emit('latency', ms)
    } else {
      console.error('[ADMIN] heartbeat error', e)
      errorText.value = '네트워크 오류'
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.card {
  border: 1px solid #444;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 12px;
  color: white; /* ✅ 글씨 기본 흰색 */
  background-color: #1e1e1e; /* 어두운 배경 */
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.back-btn {
  background: none;
  border: 1px solid #666;
  padding: 6px 10px;
  border-radius: 8px;
  color: white; /* ✅ 흰색 글씨 */
  cursor: pointer;
}
.btn {
  background: none;
  border: 1px solid #888;
  padding: 6px 10px;
  border-radius: 8px;
  color: white; /* ✅ 흰색 글씨 */
  cursor: pointer;
}
.btn:hover,
.back-btn:hover {
  background: #333;
}
.note {
  color: #bbb;
  font-size: 13px;
  margin-top: 8px;
}
.error {
  color: #ff6b6b;
  margin-top: 8px;
}
.body {
  margin-top: 8px;
  line-height: 1.6;
}
</style>
