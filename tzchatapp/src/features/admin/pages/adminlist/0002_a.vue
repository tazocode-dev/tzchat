<!--  -->

<template>
  <div class="card">
    <!-- ✅ 상단 헤더 -->
    <div class="head">
      <button class="back-btn" @click="goBack">← 뒤로가기</button>
      <h3>00300 · 회원 검색 / 00400 · 회원 목록 / 00500 · 유저 액션 / 00600 · 로그 뷰어 / 01000 · 권한/잠금 관리</h3>
      <button class="btn" @click="load">새로고침</button>
    </div>

    <!-- ✅ 검색 영역 -->
    <div class="row">
      <input
        class="input"
        type="text"
        v-model.trim="q"
        placeholder="아이디/닉네임/지역 등 포함 검색(클라이언트 필터)"
        @keyup.enter="apply"
      />
      <button class="btn" @click="apply">검색</button>
      <button class="btn" @click="reset">초기화</button>
    </div>
    <div class="hint">※ 현재는 클라이언트 측 필터(간단 contains)이며, 서버측 필터 API와도 쉽게 연동 가능</div>

    <!-- ✅ 목록 영역 -->
    <div v-if="loading" class="note">불러오는 중...</div>
    <div v-if="errorText" class="error">{{ errorText }}</div>

    <div class="table-wrap" v-if="!loading && users.length">
      <table class="table">
        <thead>
          <tr>
            <th>username</th>
            <th>nickname</th>
            <th>birthyear</th>
            <th>gender</th>
            <th>region1</th>
            <th>region2</th>
            <th>preference</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="u in filtered"
            :key="u._id"
            :class="{ selected: selectedUser?. _id === u._id }"
            @click="select(u)"
            title="클릭하면 유저 액션/권한 관리에 선택됩니다"
          >
            <td>{{ u.username }}</td>
            <td>{{ u.nickname }}</td>
            <td>{{ u.birthyear ?? '-' }}</td>
            <td>{{ u.gender ?? '-' }}</td>
            <td>{{ u.region1 ?? '-' }}</td>
            <td>{{ u.region2 ?? '-' }}</td>
            <td>{{ u.preference ?? '-' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="!loading && !users.length" class="note">데이터 없음</div>

    <!-- ✅ 유저 액션 영역 -->
    <div class="card sub-card">
      <div class="head">
        <h3>00500 · 유저 액션</h3>
      </div>

      <div v-if="!selectedUser" class="note">테이블에서 유저를 선택하세요.</div>

      <div v-else class="body">
        <div class="row row-kv">username<span>{{ selectedUser.username }}</span></div>
        <div class="row row-kv">nickname<span>{{ selectedUser.nickname }}</span></div>
        <div class="row row-kv">gender<span>{{ selectedUser.gender ?? '-' }}</span></div>
        <div class="row row-kv">birthyear<span>{{ selectedUser.birthyear ?? '-' }}</span></div>

        <div class="btns">
          <button class="btn warn" @click="forceLogout">강제 로그아웃 (TODO)</button>
          <button class="btn danger" @click="block">차단 (TODO)</button>
          <button class="btn" @click="unblock">차단 해제 (TODO)</button>
          <button class="btn" @click="promote">관리자 승격 (role=master) (TODO)</button>
          <button class="btn" @click="demote">일반 사용자로 (role=user) (TODO)</button>
        </div>

        <div class="hint">※ API가 아직 없는 항목은 TODO로 로그만 출력</div>
      </div>
    </div>

    <!-- ✅ 01000 · 권한/잠금 관리 -->
    <div class="card sub-card">
      <div class="head">
        <h3>01000 · 권한/잠금 관리</h3>
      </div>

      <div v-if="!selectedUser" class="note">유저를 선택하세요.</div>

      <div v-else class="body">
        <div class="row">현재 권한<span>{{ selectedUser.role }}</span></div>
        <div class="row">잠금 상태<span>{{ selectedUser.suspended ? 'ON' : 'OFF' }}</span></div>

        <div class="btns">
          <button class="btn" @click="setRole('master')">승격: master</button>
          <button class="btn" @click="setRole('user')">강등: user</button>
          <button class="btn warn" @click="setSuspend(true)">계정 잠금</button>
          <button class="btn" @click="setSuspend(false)">잠금 해제</button>
          <button class="btn danger" @click="forceLogoutFlag">강제 로그아웃(플래그)</button>
        </div>

        <div v-if="roleError" class="error">{{ roleError }}</div>
        <div v-if="roleInfo" class="note">{{ roleInfo }}</div>
      </div>
    </div>

    <!-- ✅ 00600 · 클라이언트 로그 뷰어 -->
    <div class="card sub-card">
      <div class="head">
        <h3>00600 · 클라이언트 로그 뷰어</h3>
        <button class="btn" @click="onClearLogs">지우기</button>
      </div>

      <div v-if="!logs || !logs.length" class="note">표시할 로그가 없습니다.</div>
      <div v-else class="list">
        <div v-for="(log, idx) in logs" :key="idx" class="line">
          <code class="ts">{{ log.at }}</code>
          <code class="lv" :class="'lv-' + (log.level || 'info')">{{ log.level }}</code>
          <span class="msg">{{ log.msg }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/shared/services/api'

const props = defineProps({
  logs: { type: Array, default: () => [] }
})
const emit = defineEmits(['clear','acted'])

const router = useRouter()
const q = ref('')
const users = ref([])
const errorText = ref('')
const loading = ref(false)
const selectedUser = ref(null)

// role/suspend 상태 메시지
const roleError = ref('')
const roleInfo = ref('')

function goBack(){ router.back() }
function apply(){ console.log('[ADMIN] Search apply',q.value) }
function reset(){ q.value=''; console.log('[ADMIN] Search reset') }

async function load(){
  loading.value=true; errorText.value=''
  try{
    const res=await api.get('/api/users')
    const data=res.data; users.value=data?.users||[]
  }catch(e){
    const status=e?.response?.status
    errorText.value = status ? `목록 실패(${status})` : '네트워크 오류'
  }
  finally{ loading.value=false }
}

function select(u){ selectedUser.value=u; console.log('[ADMIN] select',u?.username) }

const filtered=computed(()=>{
  const qq=(q.value||'').toLowerCase()
  if(!qq) return users.value
  return users.value.filter(u=>{
    const s=[u.username,u.nickname,u.region1,u.region2,u.gender,u.preference].filter(Boolean).join(' ').toLowerCase()
    return s.includes(qq)
  })
})
onMounted(load)

// 유저 액션 TODO
function ensure(){ if(!selectedUser.value){alert('유저를 먼저 선택하세요'); return false} return true }
function forceLogout(){ if(!ensure()) return; console.warn('[ADMIN] TODO forceLogout') }
function block(){ if(!ensure()) return; console.warn('[ADMIN] TODO block') }
function unblock(){ if(!ensure()) return; console.warn('[ADMIN] TODO unblock') }
function promote(){ if(!ensure()) return; console.warn('[ADMIN] TODO promote') }
function demote(){ if(!ensure()) return; console.warn('[ADMIN] TODO demote') }

// 01000 권한/잠금 관리
async function setRole(role){
  if(!selectedUser.value) return
  roleError.value=''; roleInfo.value=''
  try{
    await api.put(`/api/admin/users/${selectedUser.value._id}/role`,{role})
    roleInfo.value='권한 변경 완료'
    emit('acted',{action:'setRole',role})
  }catch(e){
    const status=e?.response?.status
    roleError.value = status ? `실패 (${status})` : '네트워크 오류'
  }
}
async function setSuspend(suspended){
  if(!selectedUser.value) return
  roleError.value=''; roleInfo.value=''
  try{
    await api.put(`/api/admin/users/${selectedUser.value._id}/suspend`,{suspended})
    roleInfo.value=`잠금 ${suspended?'ON':'OFF'} 완료`
    emit('acted',{action:'suspend',suspended})
  }catch(e){
    const status=e?.response?.status
    roleError.value = status ? `실패 (${status})` : '네트워크 오류'
  }
}
async function forceLogoutFlag(){
  if(!selectedUser.value) return
  roleError.value=''; roleInfo.value=''
  try{
    const res=await api.post(`/api/admin/users/${selectedUser.value._id}/force-logout`)
    const data=res.data; roleInfo.value=data.message||'강제 로그아웃 플래그 설정'
    emit('acted',{action:'forceLogout'})
  }catch(e){
    const status=e?.response?.status
    roleError.value = status ? `실패 (${status})` : '네트워크 오류'
  }
}

// 로그 지우기
function onClearLogs(){ emit('clear') }
</script>

<style scoped>
.card{border:1px solid #444;border-radius:10px;padding:12px;margin-bottom:12px;color:#fff;background:#1e1e1e}
.sub-card{margin-top:20px}
.head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}
.back-btn,.btn{background:none;border:1px solid #666;padding:8px 12px;border-radius:8px;color:#fff;cursor:pointer;font-size:clamp(14px,4vw,16px)}
.btn:hover,.back-btn:hover{background:#333}
.btn.warn{border-color:#aa7700}
.btn.danger{border-color:#b00020}
.row{display:grid;grid-template-columns:140px 1fr;gap:8px;margin:6px 0}
.row-kv{display:grid;grid-template-columns:140px 1fr;gap:8px;margin-bottom:6px}
.btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.table-wrap{overflow:auto;border:1px solid #333;border-radius:8px;margin-top:10px}
.table{width:100%;border-collapse:collapse;min-width:720px}
th,td{border-bottom:1px solid #2c2c2c;padding:8px 10px;text-align:left;color:#fff}
thead th{background:#252525;font-weight:700}
tr:hover{background:#2a2a2a;cursor:pointer}
tr.selected{background:#263342}
.note{color:#bbb;font-size:13px;margin-top:8px}
.error{color:#ff6b6b;margin-top:8px}
.hint{margin-top:4px;font-size:12px;color:#bbb}
.list{margin-top:8px;display:flex;flex-direction:column;gap:6px}
.line{display:flex;gap:8px;align-items:center;padding:6px 8px;border:1px solid #333;border-radius:6px;background:#161616}
.ts{color:#9aa0a6;font-family:ui-monospace}
.lv{color:#e0e0e0;font-weight:700;font-family:ui-monospace}
.lv-info{color:#8ab4f8}.lv-warn{color:#fbbc05}.lv-error{color:#ff6b6b}
.msg{color:#fff;word-break:break-all}
</style>
