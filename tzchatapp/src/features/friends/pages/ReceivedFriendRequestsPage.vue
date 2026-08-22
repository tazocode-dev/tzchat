<!-- 받은 친구 신청 목록 -->
<!-- 받은 친구 신청 전용 페이지 - 중첩 안전 고정 헤더(A안 의미 유지: 헤더 고정 + 본문 스크롤은 상위가 담당) -->
<template>
  <!-- ✅ 단일 루트로 감싸서 프래그먼트 루트 제거 -->
  <div class="receive-only-page">
    <!-- ✅ 상단 고정 헤더: slot="fixed"로 상위 IonContent 위에 고정 
    <ion-header translucent="true" slot="fixed">
      <ion-toolbar>
        <div class="section-header" role="heading" aria-level="2">
          <ion-icon :icon="icons.mailOpenOutline" class="section-icon" aria-hidden="true" />
          <h3 class="section-title">
            받은 친구 신청
            <span class="count">({{ pendingCount }} / {{ receiveLimit }})</span>
          </h3>
        </div>
      </ion-toolbar>
    </ion-header>
    -->

    <!-- ✅ 본문: 상위 IonContent가 스크롤을 관리 -->
    <div class="section-header" role="heading" aria-level="2">
      <ion-icon :icon="icons.mailOpenOutline" class="section-icon" aria-hidden="true" />
      <h3 class="section-title">
        받은 일반 매칭 신청
        <span class="count">({{ pendingCount }} / {{ receiveLimit }})</span>
      </h3>
    </div>

    <div class="receive-only-wrapper">
      <UserList
        :key="usersKey"
        :users="users"
        :isLoading="isLoading"
        :viewer-level="viewerLevelResolved"
        :is-premium="isPremiumResolved"
        emptyText="받은 일반 매칭 신청이 없습니다."
        @select="u => goToUserProfile(u._id)"
      >
        <template #item-actions="{ user }">
          <ion-button
            size="default"
            color="primary"
            class="btn-gold-solid"
            :disabled="!reqByUserId[user._id] || isBusy(reqByUserId[user._id]?._id)"
            @click.stop="onIntroClick(reqByUserId[user._id])"
          >인사말</ion-button>

          <ion-button
            size="default"
            color="success"
            class="btn-gold-solid"
            :disabled="!reqByUserId[user._id] || isBusy(reqByUserId[user._id]?._id)"
            @click.stop="onAcceptClick(reqByUserId[user._id]?._id)"
          >수락</ion-button>

          <ion-button
            size="default"
            color="medium"
            class="btn-gold-outline"
            :disabled="!reqByUserId[user._id] || isBusy(reqByUserId[user._id]?._id)"
            @click.stop="onRejectClick(reqByUserId[user._id]?._id)"
          >거절</ion-button>

          <ion-button
            size="default"
            color="danger"
            class="btn-gold-outline"
            :disabled="!reqByUserId[user._id] || isBusy(reqByUserId[user._id]?._id)"
            @click.stop="onBlockClick(reqByUserId[user._id]?._id)"
          >차단</ion-button>
        </template>
      </UserList>

      <!-- ✅ 인사말 모달 -->
      <ion-modal :is-open="introModal.open" @didDismiss="closeIntro">
        <ion-header translucent>
          <ion-toolbar>
            <ion-title>인사말</ion-title>
            <ion-buttons slot="end">
              <ion-button @click="closeIntro">닫기</ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content class="ion-padding">
          <div class="intro-meta" v-if="introModal.req">
            <div class="intro-row">
              <span class="label">보낸 사람</span>
              <span class="value">{{ introFromName }}</span>
            </div>
            <div class="intro-row">
              <span class="label">요청 ID</span>
              <span class="value mono">{{ introModal.req._id }}</span>
            </div>
          </div>
          <div class="intro-block">
            <div class="intro-title">메시지</div>
            <div class="intro-text" v-if="introText" v-text="introText" />
            <div class="intro-empty" v-else>인사말 메시지가 없습니다.</div>
          </div>
          <div class="intro-actions">
            <ion-button expand="block" @click="copyIntro" :disabled="!introText">복사</ion-button>
            <ion-button expand="block" color="success" @click="acceptFromIntro" :disabled="!introModal.req || isBusy(introModal.req._id)">수락</ion-button>
            <ion-button expand="block" color="medium" @click="rejectFromIntro" :disabled="!introModal.req || isBusy(introModal.req._id)">거절</ion-button>
            <ion-button expand="block" color="danger" @click="blockFromIntro" :disabled="!introModal.req || isBusy(introModal.req._id)">차단</ion-button>
          </div>
        </ion-content>
      </ion-modal>

      <!-- ✅ Toast(오버레이) -->
      <ion-toast
        :is-open="toastState.open"
        :message="toastState.message"
        :color="toastState.color"
        duration="1600"
        position="top"
        @didDismiss="toastState.open = false"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/shared/services/api'
import UserList from '@/shared/components/UserList.vue'
import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonContent,
  IonButton, IonIcon, IonModal, IonToast
} from '@ionic/vue'
import { mailOpenOutline } from 'ionicons/icons'

/* ===== props / emits ===== */
const props = defineProps({
  viewerLevel: { type: [String], default: '' },
  isPremium:   { type: [Boolean, String], default: false },
})
const emit = defineEmits(['openReceive', 'closeReceive'])

/* ===== 상수/라우터 ===== */
const receiveLimit = ref(20)
const router = useRouter()
const icons = { mailOpenOutline }

/* ===== 상태 ===== */
const users = ref([])
const isLoading = ref(true)
const receivedRequests = ref([])

/* 프리미엄 표시: props 우선, 없으면 API fallback */
const _viewerLevel = ref(String(props.viewerLevel || ''))
const _isPremium   = ref(
  typeof props.isPremium === 'string'
    ? ['true','1','yes','y','프리미엄회원','premium','premium_member','prem'].includes(String(props.isPremium).toLowerCase())
    : Boolean(props.isPremium)
)
const viewerLevelResolved = computed(() => _viewerLevel.value || '')
const isPremiumResolved   = computed(() => !!_isPremium.value)

/* 배지 브로드캐스트 */
function updateBadge() {
  const hasNew = (receivedRequests.value?.length || 0) > 0
  try { window.dispatchEvent(new CustomEvent('friends:state', { detail: { hasNew } })) } catch {}
}
function onRequestState() { updateBadge() }

/* 인사말(모달) */
const introModal = ref({ open: false, req: null })
const introText = computed(() => {
  const r = introModal.value.req
  return r?.intro ?? r?.message ?? r?.note ?? r?.memo ?? ''
})
const introFromName = computed(() => {
  const r = introModal.value.req
  const u = (r && typeof r.from === 'object') ? r.from : null
  return u?.nickname || u?.name || u?.username || u?._id || '알 수 없음'
})

/* 유틸 */
const uniq = (arr = []) => Array.from(new Set(arr.map(String)))
function toTS(v){ if(!v) return 0; try{ const t=new Date(v).getTime(); return Number.isFinite(t)?t:0 }catch{return 0} }
function sortByRecent(list){
  return [...list].sort((a,b)=>{
    const aTS=toTS(a.last_login||a.lastLogin||a.updatedAt||a.createdAt)
    const bTS=toTS(b.last_login||b.lastLogin||b.updatedAt||b.createdAt)
    return bTS-aTS
  })
}
function normalizeUser(u = {}){
  const r1 = u.region1 ?? u.region1Name ?? u.regionName1 ?? u.city1 ?? u.area1 ?? (Array.isArray(u.region)?u.region[0]:undefined) ?? '/'
  const r2 = u.region2 ?? u.region2Name ?? u.regionName2 ?? u.city2 ?? u.area2 ?? (Array.isArray(u.region)?u.region[1]:undefined) ?? '/'
  const pref = u.preference ?? u.preferenceText ?? u.pref ?? u.trait ?? u.feature ?? (Array.isArray(u.tags)?u.tags.join(', '):undefined) ?? '-'
  const lastLogin = u.last_login || u.lastLogin || u.updatedAt || u.createdAt
  return { ...u, region1:r1, region2:r2, preference:pref, last_login:lastLogin }
}

/* 네비게이션 */
const goToUserProfile = (userId) => { if (userId) router.push(`/home/user/${userId}`) }

/* 받은신청 파싱 */
function extractPendingRequests(data){
  const arr = Array.isArray(data)?data
           : (Array.isArray(data?.requests)?data.requests
           : (Array.isArray(data?.pending)?data.pending:[]))
  const reqs = (arr||[]).filter(r=>r&&typeof r==='object')
  return reqs.filter(r => (r.status ?? 'pending') === 'pending')
}
function extractSenderIdsFromAny(data){
  const pendingReqs = extractPendingRequests(data)
  const ids1 = pendingReqs.map(r => (typeof r.from==='object'?r.from?._id:r.from)).filter(Boolean).map(String)
  const idList =
    (Array.isArray(data?.pendingIds) && data.pendingIds) ||
    (Array.isArray(data?.ids) && data.ids) ||
    (Array.isArray(data) && typeof data[0] !== 'object' && data) || []
  const ids2 = idList.map(String)
  return uniq([...ids1, ...ids2])
}

/* 사용자 조회 */
async function fetchUsersByIdsStrict(ids=[]){
  if(!ids.length) return []
  let bulkList=[]
  try{
    const res=await api.post('/api/search/users',{ids})
    bulkList = Array.isArray(res?.data?.users)?res.data.users
             : (Array.isArray(res?.data)?res.data:[])
  }catch(e){
    console.warn('[receive] bulk search failed, fallback per-id:', e?.message||e)
  }
  if(Array.isArray(bulkList)&&bulkList.length){
    const set=new Set(ids.map(String))
    const filtered=bulkList.filter(u=>u&&set.has(String(u._id)))
    if(filtered.length===ids.length) return filtered
  }
  const results=await Promise.all(ids.map(async id=>{
    try{ const r=await api.get(`/api/users/${id}`); return r?.data?.user||r?.data||null }catch{ return null }
  }))
  return results.filter(Boolean)
}

/* 카운트/리렌더 키 */
const pendingCount = computed(()=>receivedRequests.value.length)
const usersKey = computed(()=>{
  const ids = users.value.map(u=>u._id).join(',')
  return `${ids}|${pendingCount.value}`
})

/* userId → request */
const reqByUserId = computed(()=>{
  const m=Object.create(null)
  for(const r of receivedRequests.value){
    const uid = typeof r?.from==='object'?r.from?._id:r?.from
    if(uid) m[String(uid)] = r
  }
  return m
})

/* busy */
const busy = ref({})
const isBusy = (reqId)=>!!reqId && !!busy.value[String(reqId)]
async function withBusy(reqId, fn){
  if(!reqId) return
  const key=String(reqId)
  busy.value={...busy.value,[key]:true}
  try{ await fn?.() } finally{
    const next={...busy.value}; delete next[key]; busy.value=next
  }
}

/* 후처리 */
function removeRequestLocally(id){
  if(!id) return
  const mapping=reqByUserId.value
  const uid=Object.keys(mapping).find(k=>mapping[k]?._id===id)
  if(uid){ users.value = users.value.filter(u=>String(u._id)!==String(uid)) }
  receivedRequests.value = receivedRequests.value.filter(x=>x._id!==id)
  updateBadge()
}

/* Toast */
const toastState = ref({ open:false, message:'', color:'dark' })
function toast(message='', color='dark'){
  toastState.value={ open:true, message, color }
  setTimeout(()=> (toastState.value.open=false), 1600)
}

/* 서버 액션 */
async function acceptFriendRequest(id){
  if(!id) return
  await withBusy(id, async ()=>{
    await api.put(`/api/friend-request/${id}/accept`,{})
    removeRequestLocally(id)
    toast('친구로 수락했습니다.')
  })
}
async function rejectFriendRequest(id){
  if(!id) return
  await withBusy(id, async ()=>{
    await api.put(`/api/friend-request/${id}/reject`,{})
    removeRequestLocally(id)
    toast('요청을 거절했습니다.')
  })
}
async function blockFriendRequest(id){
  if(!id) return
  await withBusy(id, async ()=>{
    await api.put(`/api/friend-request/${id}/block`,{})
    removeRequestLocally(id)
    toast('해당 사용자를 차단했습니다.')
  })
}

/* 버튼 핸들러 */
const onIntroClick  = (requestObj)=>{ introModal.value={ open:true, req: requestObj||null } }
const onAcceptClick = (payload)=>acceptFriendRequest(typeof payload==='string'?payload:payload?._id)
const onRejectClick = (payload)=>rejectFriendRequest(typeof payload==='string'?payload:payload?._id)
const onBlockClick  = (payload)=>blockFriendRequest(typeof payload==='string'?payload:payload?._id)

/* 인사말 모달 */
function closeIntro(){ introModal.value={ open:false, req:null } }
async function copyIntro(){
  try{ await navigator.clipboard.writeText(introText.value||''); toast('인사말을 복사했습니다.') }
  catch{ toast('복사에 실패했습니다.','danger') }
}
function acceptFromIntro(){ if(introModal.value.req) onAcceptClick(introModal.value.req._id) }
function rejectFromIntro(){ if(introModal.value.req) onRejectClick(introModal.value.req._id) }
function blockFromIntro(){ if(introModal.value.req) onBlockClick(introModal.value.req._id) }

/* 초기 로딩 */
onMounted(async ()=>{
  emit('openReceive') // 부모 리스너 허용
  window.addEventListener('friends:requestState', onRequestState)
  try{
    isLoading.value=true
    // 뷰어 등급/프리미엄 (props → API 순서로 보정)
    try{
      const me=(await api.get('/api/me')).data?.user||{}
      const levelFromApi = me?.level || me?.user_level || me?.membership || ''
      if(!_viewerLevel.value) _viewerLevel.value = String(levelFromApi||'').trim()
      const premiumBool = me?.isPremium ?? me?.premium ?? (_viewerLevel.value==='프리미엄회원')
      // props가 false로 왔더라도 API가 true면 true로 승격
      _isPremium.value = _isPremium.value || Boolean(premiumBool)
    }catch{
      if(!_viewerLevel.value){
        const lv=(localStorage.getItem('user_level')||localStorage.getItem('level')||'').trim().toLowerCase()
        _viewerLevel.value=lv
      }
      if(!_isPremium.value){
        const boolish=(localStorage.getItem('isPremium')||'').trim().toLowerCase()
        _isPremium.value=['프리미엄회원','premium','premium_member','prem'].includes(_viewerLevel.value)
                          || ['true','1','yes','y'].includes(boolish)
      }
    }

    const res = await api.get('/api/friend-requests/received')
    const pendingReqs = extractPendingRequests(res?.data)
    receivedRequests.value = pendingReqs

    const senderIds = extractSenderIdsFromAny(res?.data)
    if(!senderIds.length){ users.value=[]; updateBadge(); return }

    const raw = await fetchUsersByIdsStrict(senderIds)
    const set = new Set(senderIds.map(String))
    const strictFinal = raw.filter(u=>u && set.has(String(u._id)))
    users.value = sortByRecent(strictFinal.map(normalizeUser))
  }catch(e){
    console.error('❌ 받은신청 전용 리스트 로딩 실패:', e)
    users.value=[]; receivedRequests.value=[]
    toast('받은 일반 매칭 신청을 불러오지 못했습니다.','danger')
  }finally{
    isLoading.value=false
    updateBadge()
  }
})
onUnmounted(()=>{
  emit('closeReceive') // 부모 리스너 허용
  window.removeEventListener('friends:requestState', onRequestState)
})
watch(()=>receivedRequests.value.length, ()=>updateBadge())
</script>

<style scoped>
/* 페이지 루트 */
.receive-only-page{
  background: transparent;
  color: var(--text);
}

/* 상단 헤더 카드 */
.section-header{
  display:flex; align-items:center; gap:10px;
  padding:12px 14px; margin:0 0 12px;
  border:1px solid var(--panel-border);
  background:var(--panel); border-radius:16px;
  box-shadow:var(--shadow-xs);
}
.section-title{
  display:flex; align-items:center; gap:8px;
  margin:0; color:var(--text-strong); font-weight:800; font-size:15px;
}
.section-icon{ font-size:18px; color:var(--gold); }
.count{ font-weight:800; color:var(--gold); }

/* 페이지 배경/텍스트 */
.receive-only-wrapper{
  color:var(--text);
  background:transparent;
  /* 고정 헤더 만큼 내려놓기 (오타 수정: px → 8px) */
  padding-top: calc(8px + var(--safe-top));

  /* 세로 가운데 정렬 방지: 항상 위에서부터 시작 */
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: stretch;

  /* 부모가 flex 컨테이너여도 꽉 채워서 위로 붙게 */
  min-height: 100%;
  width: 100%;
  margin: 0;
}

/* 액션 버튼 스타일 */
.btn-gold-solid,
.btn-gold-outline {
  --height: 18px;
  --border-radius: 12px;
  --padding-start: 1px;
  --padding-end: 1px;
  --padding-top: 0;
  --padding-bottom: 0;
  font-size: 12px;
  font-weight: 800;
  min-width: 65px;
  min-height: 30px;
  --background: linear-gradient(135deg, var(--gold), var(--gold-strong));
  --color: #fff;
}
.btn-gold-outline {
  --background: transparent;
  --color: var(--gold-strong);
  border: 1px solid #d8c5a5;
}
:deep(.actions-bar){ display:flex; flex-wrap:wrap; justify-content:center; gap:8px; }

/* 인사말 모달 */
.intro-meta{ display:grid; gap:6px; margin-bottom:12px; }
.intro-row{ display:flex; justify-content:space-between; gap:10px; font-size:12px; color:var(--text-dim); }
.intro-row .label{ color:var(--text-faint); }
.intro-row .value{ font-weight:700; }
.mono{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono","Courier New", monospace; }
.intro-block{ background:var(--panel-soft); border:1px solid var(--panel-border); border-radius:12px; padding:12px; }
.intro-title{ font-weight:800; color:var(--gold); margin-bottom:6px; }
.intro-text{ white-space:pre-wrap; line-height:1.5; }
.intro-empty{ color:var(--text-faint); }
.intro-actions{ display:grid; gap:8px; margin-top:14px; }
</style>
