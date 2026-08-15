<!-- src/components/03050_pages/2_target_merge.vue -->
<template>
  <!-- ✅ 이 페이지는 HomeMain.vue(IonPage > IonHeader/IonContent/IonFooter)의
       router-view 안에서 렌더된다. 여기서 또 ion-page/ion-content를 만들면
       IonPage가 중첩되어(레이아웃 지침 §8 위반) 화면이 깨진다 — 일반 div로만 구성한다.
       (스크롤은 HomeMain.vue의 IonContent 하나가 전담) -->
  <div class="em-page">
    <!-- 페이지 내부 고정 헤더(스크롤 시에도 상단에 붙어있음) -->
    <div class="em-header-sticky">
      <EmergencySwitch
        :emergencyOn="emergencyStore.isActive"
        :hasSession="emergencyStore.hasSession"
        :formattedTime="formattedTime"
        :availability="emergencyStore.availability"
        :loading="emergencyStore.loading"
        :error="emergencyStore.error"
        @start="showStartConfirm = true"
        @visibility="onVisibilityChange"
      />
    </div>

    <Teleport to="body">
      <div v-if="showStartConfirm" class="reset-modal-overlay speed-start-overlay" @click.self="showStartConfirm = false">
        <div class="reset-modal-card speed-confirm" role="dialog" aria-modal="true" aria-labelledby="speed-confirm-title">
          <h3 id="speed-confirm-title">스피드 매칭을 시작할까요?</h3>
          <p class="reset-modal-text">
            시작한 시점부터 1시간 동안 진행됩니다.<br>
            잠시 숨겨도 종료 시각은 변경되지 않습니다.
          </p>
          <div class="reset-modal-actions">
            <button class="btn-cancel" type="button" @click="showStartConfirm = false">취소</button>
            <button class="btn-confirm" type="button" @click="confirmSpeedStart">1시간 시작</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ✅ 리스트 상단 스크롤 앵커 -->
    <div ref="listTop" style="height:1px;"></div>

    <!-- ===== 공통 리스트 컴포넌트 ===== -->
    <UserList
      :users="displayUsers"
      :isLoading="isLoading"
      :viewer-level="viewerLevel"
      :is-premium="isPremium"
      :emptyText="emergencyStore.isActive ? '현재 참여 중인 스피드 매칭 사용자가 없습니다.' : '조건에 맞는 사용자가 없습니다.'"
      @select="u => goToUserProfile(u?._id || u?.id)"
    />

    <!-- ✅ 새로운 친구 보기(리셋) -->
    <div v-if="displayUsers.length" class="reset-btn-wrap">
      <button
        type="button"
        @click="openResetConfirm"
        :disabled="reset.used >= reset.limit || isLoading"
        class="reset-action-card two-lines"
        aria-label="새로운 친구 보기"
      >
        <span class="line1">새로운 친구 보기 ({{ reset.used }}/{{ reset.limit }})</span>
        <span class="line2">(오전 11:00 리셋)</span>
      </button>
    </div>

    <!-- ✅ 확인/취소 모달 -->
    <Teleport to="body">
      <div
        v-if="showResetConfirm"
        class="reset-modal-overlay"
        @click.self="cancelReset"
      >
        <div
          class="reset-modal-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-title"
        >
          <h3 id="reset-title">새로운 친구 보기</h3>
          <p class="reset-modal-text">
            {{ emergencyStore.isActive ? '지금 보이는 스피드 매칭 목록이 바뀝니다. 진행할까요?' : '지금 보이는 7명이 바뀝니다. 진행할까요?' }}
          </p>
          <div class="reset-modal-actions">
            <button class="btn-confirm" type="button" @click="confirmReset">확인</button>
            <button class="btn-cancel"  type="button" @click="cancelReset">취소</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
/* -----------------------------------------------------------
   통합 Emergency/Target 페이지 (A안: ion-header + ion-content)
   - 초기 딜레이 감소 최적화:
     1) 현재 모드 목록만 먼저 로드, 나머지는 idle
     2) 스피드 매칭 헤더 lazy-load
     3) 소켓 init도 mount 직후가 아닌, 첫 렌더 뒤로
----------------------------------------------------------- */
import { ref, onMounted, onBeforeUnmount, nextTick, computed, defineAsyncComponent, watch } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/shared/services/api'
import UserList from '@/shared/components/UserList.vue'
import { applyTotalFilterPremium } from '@/features/search/filters/Filter/Total_Filter_premium'
import { applyTotalFilterNormal } from '@/features/search/filters/Filter/Total_Filter_normal'
import { applyDistributedSelection } from '@/features/search/filters/Logic/distribution'
import { connectSocket, getSocket } from '@/shared/services/socket'
import { useEmergencyStore } from '@/shared/stores/emergency'

/** ✅ lazy-load (초기 번들/파싱 감소) */
const EmergencySwitch = defineAsyncComponent(() => import('@/features/search/components/emergencySwitch.vue'))

/* ===== 공통 상태 ===== */
const isLoading = ref(true)
const router = useRouter()
const emergencyStore = useEmergencyStore()

const viewerLevel = ref('')
const isPremium = ref(false)
const currentUser = ref({})
const viewerId = ref('')

/* 제외 세트 */
const excludeIds = ref(new Set())

/* 리스트 상단 앵커 (스크롤은 HomeMain.vue의 IonContent가 전담하므로 앵커 기준으로 스크롤한다) */
const listTop = ref(null)

/* ===== Emergency 모드 상태 =====
   isActive/remainingSeconds/activatedAt/원본 목록은 모두 emergencyStore가 단일 관리한다.
   (이전에는 emergencyOn ref와 currentUser.value.emergency.*가 각각 따로 있어 손으로 동기화했었다) */
const showStartConfirm = ref(false)

const emergencyUsers = ref([])     // 화면 표시(선정 결과) — store.rawList를 필터링한 결과

/* 스피드 매칭 후보에는 본인을 포함하지 않는다. */
const INCLUDE_ME_WHEN_ON = false
const APPLY_FILTERS_TO_ME = false

/* ===== Target(일반 추천) 모드 상태 ===== */
const rawServerList = ref([])      // 검색/추천 원본
const targetUsers = ref([])        // 화면 표시(선정 결과)

/* ===== 표시용 합성 ===== */
const displayUsers = computed(() => emergencyStore.isActive ? emergencyUsers.value : targetUsers.value)

/* ===== 타이머 포맷 ===== */
const formattedTime = computed(() => {
  const sec = emergencyStore.remainingSeconds
  if (sec <= 0) return ''
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}시간 ${m}분 ${s}초`
  if (m > 0) return `${m}분 ${s}초`
  return `${s}초`
})

/* ===== 백그라운드 유틸 (첫 렌더 방해 금지) ===== */
function runInBackground(fn, delayMs = 0) {
  const ric = window.requestIdleCallback
  if (typeof ric === 'function') {
    ric(() => fn(), { timeout: 1200 })
    return
  }
  setTimeout(fn, delayMs)
}

/* ===== 유틸 ===== */
function goToUserProfile(userId) {
  if (!userId) return
  const id = String(userId)
  const targetPath = emergencyStore.isActive ? `/home/speeduser/${id}` : `/home/user/${id}`
  router.push(targetPath)
}

function blurActive() {
  try {
    const el = document.activeElement
    if (el && typeof el.blur === 'function') el.blur()
  } catch {}
}

function scrollToTopSmooth() {
  // 스크롤 컨테이너는 HomeMain.vue의 IonContent 하나뿐이므로, 앵커로 스크롤한다.
  if (listTop.value && typeof listTop.value.scrollIntoView === 'function') {
    blurActive()
    listTop.value.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }

  try {
    blurActive()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch {}
}

/** 안전 ID 정규화 */
function normId(v) {
  if (!v) return ''
  if (typeof v === 'string' || typeof v === 'number') return String(v)
  try {
    if (typeof v.toString === 'function') {
      const s = v.toString()
      if (s && s !== '[object Object]' && /^[0-9a-fA-F]{24}$/.test(s)) return s
    }
  } catch {}
  if (v && typeof v.$oid === 'string') return v.$oid
  const cand = v._id || v.id || v.userId || v.user_id || v.ownerId || v.owner ||
               v.accountId || v.account || v.targetId || v.otherId || v.peerId
  return cand ? String(cand) : ''
}
function toIdList(src) {
  const arr = Array.isArray(src) ? src : []
  return arr.map(normId).filter(Boolean)
}
function extractOtherIdsFromRequests(list, myId) {
  const arr = Array.isArray(list) ? list : []
  const out = []
  for (const r of arr) {
    const candidates = [
      r?.from, r?.to,
      r?.requester, r?.recipient,
      r?.sender, r?.receiver,
      r?.userId, r?.otherId, r?.targetId, r?.peerId,
      r?.fromUser, r?.toUser, r?.owner, r?.user,
    ]
    const ids = candidates.map(normId).filter(Boolean).filter(id => !myId || id !== myId)
    if (ids.length) out.push(ids[0])
  }
  return out
}

function buildExcludeIdsSet({
  me = {},
  friends = [], blocks = [],
  sent = [], recv = [],
  chats = []
} = {}) {
  const set = new Set()

  ;[
    me.friendlist, me.friends, friends
  ].forEach(list => toIdList(list).forEach(id => set.add(id)))

  ;[
    me.blocklist, me.blocks, blocks
  ].forEach(list => toIdList(list).forEach(id => set.add(id)))

  const myId = normId(me)

  ;[
    me.pendingSent, me.requests?.sent, me.friendRequests?.sent, me.sentRequests, sent
  ].forEach(list => {
    toIdList(list).forEach(id => set.add(id))
    extractOtherIdsFromRequests(list, myId).forEach(id => set.add(id))
  })

  ;[
    me.pendingRecv, me.pendingReceived, me.requests?.received, me.friendRequests?.received, me.receivedRequests, recv
  ].forEach(list => {
    toIdList(list).forEach(id => set.add(id))
    extractOtherIdsFromRequests(list, myId).forEach(id => set.add(id))
  })

  ;[
    me.chatUserIds, me.recentChatUserIds, me._relations?.chatUserIds, me.chatPartners, me._relations?.chatPartners, chats
  ].forEach(list => toIdList(list).forEach(id => set.add(id)))

  if (myId) set.add(myId)
  return set
}

function yyyymmddKST(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit'
  })
  const parts = fmt.formatToParts(date).reduce((o,p)=>{ o[p.type]=p.value; return o }, {})
  return `${parts.year}${parts.month}${parts.day}`
}

/* ===== Emergency 활성 판정 ===== */
function isEmergencyActive(u) {
  try {
    const em = u?.emergency || {}
    if (typeof em.remainingSeconds === 'number') {
      return em.isActive === true && em.remainingSeconds > 0
    }
    if (em.isActive && em.expiresAt) {
      return new Date(em.expiresAt).getTime() > Date.now()
    }
    if (em.isActive && em.activatedAt) {
      return Date.now() - new Date(em.activatedAt).getTime() < 60 * 60 * 1000
    }
    return false
  } catch { return false }
}

/* ===== 🔁 통합 리셋 상태 ===== */
const reset = ref({ used: 0, idx: 0, limit: 20, seedDay: '' })

function loadResetState() {
  const day = yyyymmddKST()
  reset.value.seedDay = day
  const key = `unified:${viewerId.value || 'anon'}:${day}`
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}')
    reset.value.used = Number(saved.used || 0)
    reset.value.idx  = Number(saved.idx  || 0)
  } catch {
    reset.value.used = 0
    reset.value.idx  = 0
  }
}
function saveResetState() {
  const key = `unified:${viewerId.value || 'anon'}:${reset.value.seedDay}`
  localStorage.setItem(key, JSON.stringify({ used: reset.value.used, idx: reset.value.idx }))
}

/* ===== 분산선정 ===== */
function recomputeEmergency() {
  const me = currentUser.value
  let baseList = Array.isArray(emergencyStore.rawList) ? emergencyStore.rawList.filter(isEmergencyActive) : []
  baseList = baseList.filter(u => u && u._id && !excludeIds.value.has(String(u._id)))

  const extra = Array.from(excludeIds.value)

  const selected = applyDistributedSelection(baseList, me, {
    seedDay: reset.value.seedDay,
    viewerId: viewerId.value,
    resetIndex: reset.value.idx,
    excludeIdsSet: excludeIds.value,
    applyTotalFilter: (list, meArg) =>
      (APPLY_FILTERS_TO_ME && isEmergencyActive(meArg))
        ? list
        : applyTotalFilterPremium(list, meArg, { log: false, extraExcludeIds: extra }),
  })

  if (INCLUDE_ME_WHEN_ON && emergencyStore.isActive && emergencyStore.remainingSeconds > 0) {
    const withoutMe = selected.filter(u => String(u._id) !== String(me._id))
    emergencyUsers.value = [me, ...withoutMe].slice(0, 7)
  } else {
    emergencyUsers.value = selected
  }
}

function recomputeTarget() {
  const me = currentUser.value
  const extra = Array.from(excludeIds.value)

  const selected = applyDistributedSelection(rawServerList.value, me, {
    seedDay: reset.value.seedDay,
    viewerId: viewerId.value,
    resetIndex: reset.value.idx,
    excludeIdsSet: excludeIds.value,
    applyTotalFilter: (list, meArg) =>
      applyTotalFilterNormal(list, meArg, { log: false, extraExcludeIds: extra })
  })
  targetUsers.value = selected
}

/* ===== API ===== */
async function fetchRelations() {
  try {
    const [meRes, friendsRes, blocksRes, sentRes, recvRes, chatsRes] = await Promise.all([
      api.get('/api/me'),
      api.get('/api/friends'),
      api.get('/api/blocks'),
      api.get('/api/friend-requests/sent?matchType=all'),
      api.get('/api/friend-requests/received?matchType=all'),
      api.get('/api/chatrooms/partners'),
    ])

    const me = meRes?.data?.user || {}
    currentUser.value = { ...currentUser.value, ...me }

    const myId = normId(me)
    const friends = friendsRes?.data?.ids ?? friendsRes?.data ?? []
    const blocks  = blocksRes?.data?.ids  ?? blocksRes?.data  ?? []

    const sentRaw = sentRes?.data?.pendingIds ?? sentRes?.data?.ids ?? sentRes?.data?.list ?? sentRes?.data ?? []
    const recvRaw = recvRes?.data?.pendingIds ?? recvRes?.data?.ids ?? recvRes?.data?.list ?? recvRes?.data ?? []

    const sentIds = [
      ...toIdList(sentRaw),
      ...extractOtherIdsFromRequests(sentRaw, myId),
    ]
    const recvIds = [
      ...toIdList(recvRaw),
      ...extractOtherIdsFromRequests(recvRaw, myId),
    ]

    const chatUserIds = chatsRes?.data?.ids ?? chatsRes?.data ?? []

    excludeIds.value = buildExcludeIdsSet({
      me, friends, blocks,
      sent: sentIds,
      recv: recvIds,
      chats: chatUserIds
    })

    currentUser.value = {
      ...currentUser.value,
      chatUserIds,
      pendingSent: sentIds,
      pendingRecv: recvIds,
      friends,
      blocks
    }
  } catch (e) {
    console.error('❌ 관계 로딩 실패:', e)
    excludeIds.value = new Set()
  }
}

async function fetchEmergencyUsers() {
  await emergencyStore.fetchList()
  recomputeEmergency()
}

let speedRefreshTimer = null
function syncSpeedRefreshTimer() {
  if (speedRefreshTimer) {
    clearInterval(speedRefreshTimer)
    speedRefreshTimer = null
  }
  if (emergencyStore.isActive) {
    speedRefreshTimer = setInterval(() => {
      fetchEmergencyUsers().catch(() => {})
    }, 15_000)
  }
}
watch(() => emergencyStore.isActive, syncSpeedRefreshTimer)

async function fetchTargetUsers() {
  try {
    const me = currentUser.value
    const regionFilter = me?.search_regions || []
    const res = await api.post('/api/search/users', { regions: regionFilter })
    rawServerList.value = (res.data || []).map(u => ({ ...u, _id: String(u._id ?? u.id ?? '') }))
    recomputeTarget()
  } catch (e) {
    console.error('❌ 추천 목록 로딩 실패:', e)
  }
}

/* ===== 스피드 매칭 시작/잠시 숨김 ===== */
async function confirmSpeedStart() {
  showStartConfirm.value = false
  await updateEmergencyState(true)
}

async function onVisibilityChange(next) {
  await updateEmergencyState(next)
}

async function updateEmergencyState(newState) {
  try {
    // ✅ 상태 변경/카운트다운은 emergencyStore가 전담한다(서버 응답 기준, 단일 진실 공급원).
    if (newState) await emergencyStore.turnOn()
    else await emergencyStore.turnOff()

    // ✅ 모드에 맞는 목록만 즉시 갱신
    if (emergencyStore.isActive) {
      await fetchEmergencyUsers()
      // target 목록은 급하지 않으니 idle로
      runInBackground(() => { fetchTargetUsers().catch(()=>{}) }, 0)
    } else {
      await fetchTargetUsers()
      runInBackground(() => { fetchEmergencyUsers().catch(()=>{}) }, 0)
    }
    syncSpeedRefreshTimer()

    await nextTick()
    scrollToTopSmooth()
  } catch (err) {
    console.error('❌ 상태 변경 실패:', err)
  }
}

/* ===== 소켓 ===== */
const socketRef = ref(null)
const sockHandlers = {
  connect: null,
  disconnect: null,
  connect_error: null,
  users_refresh: null,
  users_patch: null,
  users_last_login: null,
}

function initSocket() {
  try {
    const s = getSocket() || connectSocket()
    socketRef.value = s

    // ✅ 'subscribe'/room:'emergency' 및 emergency:refresh/userOn/userOff는 백엔드가
    //    한 번도 emit한 적 없는 죽은 이벤트였다(긴급 목록 갱신은 실제로 REST 폴링으로만 동작).
    //    users:* 계열(1_alluser.vue와 공유되는 일반 추천 목록 실시간 갱신)은 그대로 유지한다.
    sockHandlers.connect = () => {
      try {
        s.emit('users:join', { scope: 'list' })
      } catch {}
    }
    sockHandlers.disconnect = () => {}
    sockHandlers.connect_error = (err) => console.error('❌ [Socket] connect_error:', err?.message || err)

    sockHandlers.users_refresh = (payload) => {
      rawServerList.value = (payload || []).map(u => ({ ...u, _id: String(u._id ?? u.id ?? '') }))
      recomputeTarget()
    }
    sockHandlers.users_patch = (u) => {
      if (!u || !u._id) return
      const nu = { ...u, _id: String(u._id) }
      if (excludeIds.value.has(nu._id)) return
      const idx = rawServerList.value.findIndex(x => x._id === nu._id)
      if (idx >= 0) rawServerList.value[idx] = { ...rawServerList.value[idx], ...nu }
      else rawServerList.value.push(nu)
      recomputeTarget()
    }
    sockHandlers.users_last_login = ({ userId, last_login }) => {
      const idx = rawServerList.value.findIndex(x => x._id === String(userId))
      if (idx >= 0) {
        rawServerList.value[idx] = { ...rawServerList.value[idx], last_login }
        recomputeTarget()
      }
    }

    s.on('connect', sockHandlers.connect)
    s.on('disconnect', sockHandlers.disconnect)
    s.on('connect_error', sockHandlers.connect_error)

    s.on('users:refresh',      sockHandlers.users_refresh)
    s.on('users:patch',        sockHandlers.users_patch)
    s.on('users:last_login',   sockHandlers.users_last_login)

    // 만약 이미 connect 상태라면 바로 subscribe
    try {
      if (s.connected) sockHandlers.connect()
    } catch {}
  } catch (e) {
    console.error('❌ [socket] 초기화 실패:', e)
  }
}

function cleanupSocket() {
  try {
    const s = getSocket()
    if (!s) return
    try { s.emit('users:leave', { scope: 'list' }) } catch {}

    if (sockHandlers.connect)          s.off('connect', sockHandlers.connect)
    if (sockHandlers.disconnect)       s.off('disconnect', sockHandlers.disconnect)
    if (sockHandlers.connect_error)    s.off('connect_error', sockHandlers.connect_error)

    if (sockHandlers.users_refresh)     s.off('users:refresh',     sockHandlers.users_refresh)
    if (sockHandlers.users_patch)       s.off('users:patch',       sockHandlers.users_patch)
    if (sockHandlers.users_last_login)  s.off('users:last_login',  sockHandlers.users_last_login)
  } catch (e) {
    console.error('❌ 소켓 정리 실패:', e)
  } finally {
    socketRef.value = null
  }
}

/* ===== 카운트다운 =====
   emergencyStore.startCountdown()/stopCountdown()으로 이전됨(고정 만료 시각 기준, 드리프트 방지). */

/* ===== 리셋 ===== */
const showResetConfirm = ref(false)
function openResetConfirm() {
  if (reset.value.used >= reset.value.limit || isLoading.value) return
  showResetConfirm.value = true
}
function cancelReset() { showResetConfirm.value = false }

async function confirmReset() {
  showResetConfirm.value = false
  if (reset.value.used >= reset.value.limit) return
  reset.value.used += 1
  reset.value.idx  += 1
  saveResetState()

  if (emergencyStore.isActive) recomputeEmergency()
  else recomputeTarget()

  await nextTick()
  scrollToTopSmooth()
}

/* ===== 초기화 ===== */
onMounted(async () => {
  try {
    // ✅ 1) me 먼저
    const me = (await api.get('/api/me')).data.user
    currentUser.value = me
    viewerId.value = String(me?._id || '')
    // ✅ 긴급모드(ON/OFF+남은시간)는 항상 서버 값(/api/me)을 기준으로 store에 동기화한다.
    emergencyStore.bootstrapFromMe(me?.emergency)

    const levelFromApi = me?.user_level || me?.level || me?.membership || ''
    viewerLevel.value = String(levelFromApi || '').trim()
    const premiumBool = me?.isPremium ?? me?.premium ?? (viewerLevel.value === '프리미엄회원')
    isPremium.value = Boolean(premiumBool)

    // ✅ 2) 리셋/관계
    loadResetState()
    await fetchRelations()

    // ✅ 3) 현재 모드에 필요한 목록만 "즉시"
    if (emergencyStore.isActive) {
      await fetchEmergencyUsers()
      // 일반 추천은 급하지 않으니 idle
      runInBackground(() => { fetchTargetUsers().catch(()=>{}) }, 0)
    } else {
      await fetchTargetUsers()
      runInBackground(() => { fetchEmergencyUsers().catch(()=>{}) }, 0)
    }
    syncSpeedRefreshTimer()

    // ✅ 5) 소켓은 첫 화면 뜬 다음 idle에서 연결/구독
    runInBackground(() => { initSocket() }, 0)

  } catch (err) {
    console.error('❌ 초기 로딩 실패:', err)
  } finally {
    isLoading.value = false
  }
})

onBeforeUnmount(() => {
  // 페이지를 벗어나도 서버의 긴급모드 활성 상태 자체는 유지된다 — 로컬 카운트다운 tick만 멈춘다.
  // (다음 진입 시 onMounted → bootstrapFromMe가 서버 값 기준으로 다시 복원한다)
  emergencyStore.dispose()
  if (speedRefreshTimer) clearInterval(speedRefreshTimer)
  cleanupSocket()
})
</script>

<style scoped>
.em-page {
  width: min(100%, 720px);
  margin: 0 auto;
  background: transparent;
  color: var(--text);
  padding: 0 2px 16px;
}

.em-header-sticky {
  position: sticky;
  top: -1px;
  z-index: 6;
  margin: -1px -12px 12px;
  padding: 9px 12px 8px;
  background: rgba(247, 245, 242, 0.92);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.reset-btn-wrap {
  margin-top: 16px;
  display: flex;
  justify-content: center;
  padding: 0 0 16px;
}

.reset-action-card {
  width: 100%;
  min-height: 66px;
  padding: 12px 16px;
  border-radius: 18px;
  border: 1px solid #d9c8ad;
  background: linear-gradient(135deg, #fffaf1, #fff);
  color: var(--gold-strong);
  box-shadow: var(--shadow-xs);
  cursor: pointer;
}

.reset-action-card:disabled {
  opacity: .48;
  cursor: not-allowed;
}

.reset-modal-overlay{
  position: fixed;
  inset: 0;
  z-index: 20000;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100dvh;
  padding: max(20px, var(--safe-top)) max(20px, var(--safe-right)) max(20px, var(--safe-bottom)) max(20px, var(--safe-left));
  overflow-y: auto;
  background: rgba(36,33,31,.42);
  backdrop-filter: blur(4px);
  overscroll-behavior: contain;
}
.reset-modal-card{
  width: min(88vw, 420px);
  max-height: calc(100dvh - var(--safe-top) - var(--safe-bottom) - 40px);
  overflow-y: auto;
  background:var(--panel); color:var(--text); border:1px solid var(--panel-border);
  border-radius:22px; padding:22px;
  box-shadow: var(--shadow-md);
}
.reset-modal-card h3 { margin: 0; color: var(--text-strong); font-size: 19px; letter-spacing: -.03em; }
.reset-modal-text{ margin: 10px 0 20px; color:var(--text-dim); font-size: 14px; line-height: 1.55; }
.reset-modal-actions{ display:flex; gap:10px; justify-content:flex-end; }
.btn-confirm, .btn-cancel{
  min-width: 76px; min-height: 42px; padding:8px 14px; border-radius:12px;
  border:1px solid var(--panel-border); background:var(--panel-soft); color:var(--text); cursor:pointer;
}
.btn-confirm{ background:var(--gold); color:#fff; border-color:var(--gold); }
.btn-confirm:focus, .btn-cancel:focus{ outline:none; box-shadow:var(--focus-ring); }

/* 두 줄 표시 강제 */
.reset-action-card.two-lines {
  display: block;
  white-space: normal !important;
}

/* 각 줄 스타일 */
.reset-action-card.two-lines .line1 {
  font-size: 14px;
  font-weight: 800;
}
.reset-action-card.two-lines .line2 {
  margin-top: 2px;
  color: var(--text-faint);
  font-size: 10px;
}

/* 방어 */
.reset-action-card.two-lines * {
  white-space: normal !important;
  display: block;
  line-height: 1.45;
}
</style>
