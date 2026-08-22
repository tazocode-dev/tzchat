<!-- 차단 사용자 목록 -->
<!-- 차단 리스트 - 중첩 안전 고정 헤더 버전 (ion-header slot="fixed" + 상위 IonContent 스크롤) -->
<template>
  <!-- ✅ 상단 고정 헤더: 상위 IonContent 위에 고정
  <ion-header translucent="true" slot="fixed">
    <ion-toolbar class="section-toolbar" role="heading" aria-level="2">
      <div class="section-header">
        <ion-icon :icon="icons.closeCircleOutline" class="section-icon danger" aria-hidden="true" />
        <h3 class="section-title">
          차단 리스트
          <span class="count">({{ blocksCount }})</span>
        </h3>
      </div>
    </ion-toolbar>
  </ion-header>
  -->

  <div class="section-header">
    <ion-icon :icon="icons.closeCircleOutline" class="section-icon danger" aria-hidden="true" />
    <h3 class="section-title">
      차단 리스트
      <span class="count">({{ blocksCount }})</span>
    </h3>
  </div>

  <!-- ✅ 본문: 상위 IonContent가 스크롤 담당 -->
  <div class="blocks-only-wrapper">
    <!-- 공통 리스트 + 하단 액션(차단 해제) -->
    <UserList
      :users="users"
      :isLoading="isLoading"
      :viewer-level="viewerLevel"
      :is-premium="isPremium"
      emptyText="차단한 친구가 없습니다."
      @select="u => goToUserProfile(u._id)"
    >
      <template #item-actions="{ user }">
        <ion-button
          size="small"
          color="medium"
          class="btn-gold-outline"
          @click.stop="onUnblockClick(user._id)"
        >차단해제</ion-button>
      </template>
    </UserList>
  </div>
</template>

<script setup>
/* -----------------------------------------------------------
   Blocks List (헤더 카운트 + 공통 UserList + 차단해제)
   - 중첩 안전 버전: ion-page/ion-content 미사용
   - 헤더는 <ion-header slot="fixed">, 스크롤은 상위 IonContent
   - 항상 id를 추출해 재조회하여 전체 필드 확보
   - friendRouter 경로 기준: DELETE /api/block/:id
   - ✅ 부모에서 넘긴 props/이벤트를 명시 선언하여
     "Extraneous non-props / non-emits" 경고 제거
----------------------------------------------------------- */
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/shared/services/api'
import UserList from '@/shared/components/UserList.vue'
import { IonHeader, IonToolbar, IonButton, IonIcon } from '@ionic/vue'
import { closeCircleOutline } from 'ionicons/icons'

/** ✅ 부모가 넘기는 속성/이벤트를 명시 선언 */
const props = defineProps({
  // 부모에서 kebab-case로 넘김: viewer-level → viewerLevel 매핑됨
  viewerLevel: { type: String, default: undefined },
  isPremium:   { type: Boolean, default: undefined },
})
const emit = defineEmits(['openReceive', 'closeReceive'])

const router = useRouter()
const icons = { closeCircleOutline }

/* 상태 */
const users = ref([])      // 화면 표시용: 차단한 유저 객체들
const isLoading = ref(true)

/* ✅ 프리미엄 가림 로직 전달용(내부 표준 상태) */
const viewerLevel = ref('')   // '일반회원' | '라이트회원' | '프리미엄회원' 등
const isPremium   = ref(false)

/* 유틸 */
const uniq = (arr = []) => Array.from(new Set(arr.map(String)))
function toTS(v){ if(!v) return 0; try{const t=new Date(v).getTime();return Number.isFinite(t)?t:0}catch{ return 0 } }
function sortByRecent(list){
  return [...list].sort((a,b)=>{
    const aTS=toTS(a.last_login||a.lastLogin||a.updatedAt||a.createdAt)
    const bTS=toTS(b.last_login||b.lastLogin||b.updatedAt||b.createdAt)
    return bTS-aTS
  })
}
/** UserList 정규화 */
function normalizeUser(u={}){
  const r1=u.region1 ?? u.region1Name ?? u.regionName1 ?? u.city1 ?? u.area1 ?? (Array.isArray(u.region)?u.region[0]:undefined) ?? '/'
  const r2=u.region2 ?? u.region2Name ?? u.regionName2 ?? u.city2 ?? u.area2 ?? (Array.isArray(u.region)?u.region[1]:undefined) ?? '/'
  const pref=u.preference ?? u.preferenceText ?? u.pref ?? u.trait ?? u.feature ?? (Array.isArray(u.tags)?u.tags.join(', '):undefined) ?? '-'
  const lastLogin=u.last_login || u.lastLogin || u.updatedAt || u.createdAt
  return { ...u, region1:r1, region2:r2, preference:pref, last_login:lastLogin }
}

/* 네비게이션 */
const goToUserProfile = (userId) => { if (!userId) return; router.push(`/home/user/${userId}`) }

/* /api/blocks 응답 파싱: ids 배열/객체 배열 모두 대응 */
function extractBlockIds(data){
  if (Array.isArray(data) && data.length){
    if (typeof data[0] === 'object' && data[0]?._id){
      return uniq(data.map(x=>x?._id).filter(Boolean).map(String))
    }
    if (typeof data[0] !== 'object'){
      return uniq(data.map(String))
    }
  }
  if (Array.isArray(data?.ids)) return uniq(data.ids.map(String))
  return []
}

/* 사용자 조회: bulk → 개별, 최종 id 필터 */
async function fetchUsersByIdsStrict(ids=[]){
  if(!ids.length) return []
  let bulkList=[]
  try{
    const res=await api.post('/api/search/users',{ ids })
    bulkList = Array.isArray(res?.data?.users) ? res.data.users
             : (Array.isArray(res?.data) ? res.data : [])
  }catch(e){ console.warn('[blocks] bulk failed; fallback per-id:', e?.message||e) }

  if(Array.isArray(bulkList) && bulkList.length){
    const set=new Set(ids.map(String))
    const filtered=bulkList.filter(u=>u && set.has(String(u._id)))
    if(filtered.length===ids.length) return filtered
  }

  const per=await Promise.all(ids.map(async id=>{
    try{
      const r=await api.get(`/api/users/${id}`)
      return r?.data?.user || r?.data || null
    }catch{ return null }
  }))
  return per.filter(Boolean)
}

/* 헤더 카운트 */
const blocksCount = computed(()=> users.value.length)

/* 차단 해제 */
async function unblock(userId){
  if(!userId) return
  await api.delete(`/api/block/${userId}`) // friendRouter 기준
  users.value = users.value.filter(u=> String(u._id)!==String(userId))
}
const onUnblockClick = (userId) => unblock(userId)

/* ✅ props → 내부 상태 반영 (실시간 반영) */
watch(() => props.viewerLevel, (v) => {
  if (v !== undefined) viewerLevel.value = String(v || '').trim()
}, { immediate: true })
watch(() => props.isPremium, (v) => {
  if (v !== undefined) isPremium.value = Boolean(v)
}, { immediate: true })

/* 초기 로딩 */
onMounted(async ()=>{
  try{
    isLoading.value=true

    // ✅ props가 주어지지 않은 항목만 API/로컬에서 보완 설정
    if (props.viewerLevel === undefined || props.isPremium === undefined){
      try {
        const me = (await api.get('/api/me')).data?.user || {}
        const levelFromApi = me?.level || me?.user_level || me?.membership || ''
        if (props.viewerLevel === undefined) {
          viewerLevel.value = String(levelFromApi || '').trim()
        }
        if (props.isPremium === undefined) {
          const premiumBool =
            me?.isPremium ?? me?.premium ?? (String(levelFromApi || '').trim() === '프리미엄회원')
          isPremium.value = Boolean(premiumBool)
        }
      } catch {
        const lvLocal = (localStorage.getItem('user_level') || localStorage.getItem('level') || '').trim().toLowerCase()
        if (props.viewerLevel === undefined) viewerLevel.value = lvLocal
        if (props.isPremium === undefined) {
          const boolish = (localStorage.getItem('isPremium') || '').trim().toLowerCase()
          isPremium.value =
            ['프리미엄회원','premium','premium_member','prem'].includes(lvLocal) ||
            ['true','1','yes','y'].includes(boolish)
        }
      }
    }

    const res=await api.get('/api/blocks')

    // ✅ 항상 ids를 추출해 정식 조회로 전체 필드 확보
    const blockIds = extractBlockIds(res?.data)
    if (!blockIds.length){ users.value=[]; return }

    const raw = await fetchUsersByIdsStrict(blockIds)
    const set = new Set(blockIds.map(String))
    const strictFinal = raw.filter(u=>u && set.has(String(u._id)))
    users.value = sortByRecent(strictFinal.map(normalizeUser))
  }catch(e){
    console.error('❌ 차단 리스트 로딩 실패:', e)
    users.value=[]
  }finally{
    isLoading.value=false
  }
})
</script>

<style scoped>
/* ✅ 고정 헤더(툴바) */
.section-toolbar{
  --background: transparent;
  border-bottom: 0;
}
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
.section-icon.danger{ color:#ff6b6b; }
.count{ font-weight:800; color:var(--gold); }

/* ✅ 본문 래퍼: 헤더 높이만큼 내려 위쪽 정렬 고정 */
.blocks-only-wrapper{
  color:var(--text);
  background:transparent;

  /* 툴바 기본 56px + 안전영역 */
  padding-top: calc(0px + var(--safe-top));

  /* 상위 컨테이너가 flex여도 가운데 정렬 방지 */
  display:flex; flex-direction:column; justify-content:flex-start; align-items:stretch;

  min-height: 100%;
  width: 100%;
}

/* 버튼 공통 톤 */
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

/* UserList 내부 액션 바 정렬 */
:deep(.actions-bar) {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 8px;
}
</style>
