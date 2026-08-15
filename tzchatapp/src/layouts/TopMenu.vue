<template>
  <div
    class="top-menu"
    role="tablist"
    :style="{ gridTemplateColumns: `repeat(${menuItems.length}, minmax(0, 1fr))` }"
  >
    <button
      v-for="item in menuItems"
      :key="item.name"
      :class="['menu-item', isActive(item.path)]"
      type="button"
      role="tab"
      :aria-current="isActive(item.path) ? 'page' : null"
      @click="goTo(item.path)"
    >
      <span class="icon-wrap" aria-hidden="true">
        <IonIcon :icon="item.icon" class="menu-icon" />

        <!-- ✅ 친구/채팅 뱃지 조건 (경로 직접 비교) -->
        <span
          v-if="item.path === '/home/3page' && badgeFriends"
          class="icon-badge"
          aria-label="새 친구 항목 있음"
        >{{ badgeFriends }}</span>

        <span
          v-if="item.path === '/home/4page' && badgeChat"
          class="icon-badge"
          aria-label="안읽은 채팅 있음"
        >{{ badgeChat > 99 ? '99+' : badgeChat }}</span>
      </span>

      <span class="menu-text">{{ item.name }}</span>
    </button>
  </div>
</template>

<script setup>
/**
 * TopMenu.vue
 * ✅ "홈 진입 체감 딜레이" 줄이기:
 * - onMounted에서 await 제거 (초기 렌더 블로킹 방지)
 * - /api/me는 캐시(localStorage) 우선 사용, 없을 때만 백그라운드 조회
 * - unread-total은 디바운스 + inFlight로 중복 호출 방지
 */
import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { IonIcon } from '@ionic/vue'
import api from '@/shared/services/api'
import { connectSocket, getSocket } from '@/shared/services/socket'
import { useUserStore } from '@/shared/stores/user'
import {
  peopleOutline,
  chatbubblesOutline,
  personCircleOutline,
  diamondOutline,
  flaskOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const DEBUG_NOTIFICATIONS = import.meta.env.DEV && import.meta.env.VITE_NOTIFICATION_DEBUG === 'true'

const baseMenuItems = [
  { name: '매칭', path: '/home/targetpage', icon: diamondOutline },
  { name: '친구', path: '/home/3page', icon: peopleOutline },
  { name: '채팅', path: '/home/4page', icon: chatbubblesOutline },
  { name: '프로필', path: '/home/6page', icon: personCircleOutline },
]
const menuItems = computed(() => [
  ...baseMenuItems,
  ...(userStore.isMaster
    ? [
        { name: '관리자', path: '/home/admin', icon: shieldCheckmarkOutline },
        { name: '테스트', path: '/home/admin-test', icon: flaskOutline },
      ]
    : []),
])

const goTo = (path) => router.push(path)
const isActive = (path) => (
  route.path === path || (path === '/home/admin' && route.path.startsWith('/home/admin/'))
    ? 'active'
    : ''
)

/* ===== 상태 ===== */
const notificationState = ref({
  chatUnreadTotal: 0,
  categories: {
    friendRequests: false,
    speedResults: false,
    friends: false,
    blocks: false,
  },
})
const badgeFriends = computed(() => Object.values(notificationState.value.categories).filter(Boolean).length)
const badgeChat = computed(() => Math.max(0, Number(notificationState.value.chatUnreadTotal || 0)))
const myId = ref(null)
let socket = null

// ✅ 내 아이디 캐시 키 (TopMenu가 /me를 매번 치지 않도록)
const MYID_KEY = 'TZCHAT_MY_ID'

const applyNotificationState = (data = {}) => {
  notificationState.value = {
    chatUnreadTotal: Number(data?.chatUnreadTotal || 0),
    categories: {
      friendRequests: Boolean(data?.categories?.friendRequests),
      speedResults: Boolean(data?.categories?.speedResults),
      friends: Boolean(data?.categories?.friends),
      blocks: Boolean(data?.categories?.blocks),
    },
  }
}

const publishNotificationState = () => {
  try {
    window.dispatchEvent(new CustomEvent('notifications:state', {
      detail: JSON.parse(JSON.stringify(notificationState.value)),
    }))
  } catch {}
}

const onNotificationStateRequest = () => publishNotificationState()
const onNotificationState = (event) => applyNotificationState(event?.detail)

/* ===== 채팅 탭: 총 미읽음 조회 (디바운스 + 중복방지) ===== */
let unreadTimer = null
let unreadInFlight = false
let unreadQueued = false

const refreshChatBadgeNow = async (label = 'init') => {
  if (unreadInFlight) {
    unreadQueued = true
    return
  }
  unreadInFlight = true
  unreadQueued = false

  try {
    const res = await api.get('/api/notifications/status')
    applyNotificationState(res?.data)
    publishNotificationState()
    if (DEBUG_NOTIFICATIONS) {
      console.log(`[TopMenu] refreshNotifications(${label})`, notificationState.value)
    }
  } catch (e) {
    console.warn('[TopMenu] refreshChatBadge 실패:', e)
  } finally {
    unreadInFlight = false
    if (unreadQueued) {
      // 큐가 있으면 한번 더
      unreadQueued = false
      refreshChatBadgeNow('queued')
    }
  }
}

const refreshChatBadge = (label = 'init', delayMs = 150) => {
  if (unreadTimer) clearTimeout(unreadTimer)
  unreadTimer = setTimeout(() => {
    unreadTimer = null
    refreshChatBadgeNow(label)
  }, delayMs)
}

/* ===== 소켓 핸들러 ===== */
const hConnect = () => {
  if (DEBUG_NOTIFICATIONS) console.log('[TopMenu] socket connected:', socket?.id)
  if (myId.value) socket.emit('join', { userId: myId.value })
  // ✅ 기다리지 말고 백그라운드로 갱신
  refreshChatBadge('socket-connect', 0)
}

// 서버가 송신자·수신자 개인 방에 모두 보내므로 사용자별 서버 상태를 다시 조회한다.
const hFriendReq = () => refreshChatBadge('friend-request-created', 0)

const hFriendStateChanged = () => refreshChatBadge('friend-state-changed', 0)
const hNotificationsChanged = () => refreshChatBadge('notifications-changed', 0)

const hRoomsBadge = (payload) => {
  if (DEBUG_NOTIFICATIONS) console.log('[TopMenu] socket chatrooms:badge:', payload)
  refreshChatBadge('socket-badge', 0)
}
const hRoomsUpdated = (payload) => {
  if (DEBUG_NOTIFICATIONS) console.log('[TopMenu] socket chatrooms:updated:', payload)
  refreshChatBadge('socket-updated', 0)
}
const hChatMsg = () => {
  if (DEBUG_NOTIFICATIONS) console.log('[TopMenu] socket chatMessage(compat): refresh')
  refreshChatBadge('socket-chatMessage', 0)
}
const hNativePush = () => refreshChatBadge('native-push', 0)

/* ===== 소켓 바인딩 ===== */
function bindSocket() {
  if (!socket) return
  socket.off('connect', hConnect)
  socket.off('friendRequest:created', hFriendReq)
  socket.off('friendRequest:accepted', hFriendStateChanged)
  socket.off('friendRequest:rejected', hFriendStateChanged)
  socket.off('friendRequest:cancelled', hFriendStateChanged)
  socket.off('block:created', hFriendStateChanged)
  socket.off('notifications:changed', hNotificationsChanged)
  socket.off('chatrooms:badge', hRoomsBadge)
  socket.off('chatrooms:updated', hRoomsUpdated)
  socket.off('chatMessage', hChatMsg)

  socket.on('connect', hConnect)
  socket.on('friendRequest:created', hFriendReq)
  socket.on('friendRequest:accepted', hFriendStateChanged)
  socket.on('friendRequest:rejected', hFriendStateChanged)
  socket.on('friendRequest:cancelled', hFriendStateChanged)
  socket.on('block:created', hFriendStateChanged)
  socket.on('notifications:changed', hNotificationsChanged)
  socket.on('chatrooms:badge', hRoomsBadge)
  socket.on('chatrooms:updated', hRoomsUpdated)
  socket.on('chatMessage', hChatMsg)
}

/* ===== 라우트 변화 반응 ===== */
watch(() => route.path, (p) => {
  if (p === '/home/4page') {
    // 채팅탭 진입 시 즉시 갱신 (디바운스 안에서 처리)
    refreshChatBadge('route-enter-chat', 100)
  }
  if (p === '/home/3page') refreshChatBadge('route-enter-friends', 0)
})

/* ===== 내 아이디 빠른 로드 (캐시 우선) ===== */
function loadMyIdFromCache() {
  try {
    const v = localStorage.getItem(MYID_KEY)
    if (v && v.trim()) return v.trim()
  } catch {}
  return null
}

/* ===== /api/me 는 필요할 때만 "백그라운드"로 ===== */
async function fetchMyIdInBackground() {
  try {
    const me = await api.get('/api/me')
    if (me.data?.user) userStore.setUser(me.data.user)
    const id = me.data?.user?._id || null
    if (id) {
      myId.value = id
      try { localStorage.setItem(MYID_KEY, String(id)) } catch {}

      // 소켓이 이미 연결돼 있으면 join 한번 더
      if (socket && socket.connected) {
        socket.emit('join', { userId: myId.value })
      }
    }
  } catch (e) {
    console.warn('[TopMenu] /me 실패', e)
  }
}

/* ===== 마운트 ===== */
onMounted(() => {
  window.addEventListener('notifications:requestState', onNotificationStateRequest)
  window.addEventListener('notifications:state', onNotificationState)
  window.addEventListener('notifications:pushReceived', hNativePush)

  // 3) 내 ID는 캐시 우선
  const storeId = userStore.user?._id || null
  const cachedId = loadMyIdFromCache()
  if (storeId || cachedId) myId.value = storeId || cachedId
  else fetchMyIdInBackground() // ✅ await 금지

  // 라우터에서 인증 정보를 이미 조회한 경우 캐시를 재사용하고,
  // 직접 마운트된 경우에만 백그라운드로 권한을 보완한다.
  userStore.bootstrapAuth({ silent: true }).then(() => {
    const authenticatedId = userStore.user?._id
    if (!authenticatedId) return
    myId.value = String(authenticatedId)
    try { localStorage.setItem(MYID_KEY, myId.value) } catch {}
    if (socket?.connected) socket.emit('join', { userId: myId.value })
  }).catch(() => {})

  // 4) 소켓 연결/바인딩
  socket = getSocket() || connectSocket()
  bindSocket()

  // 5) unread 갱신도 "백그라운드" (await 금지)
  refreshChatBadge('mounted', 0)
})

onUnmounted(() => {
  window.removeEventListener('notifications:requestState', onNotificationStateRequest)
  window.removeEventListener('notifications:state', onNotificationState)
  window.removeEventListener('notifications:pushReceived', hNativePush)

  if (unreadTimer) {
    clearTimeout(unreadTimer)
    unreadTimer = null
  }

  if (socket) {
    socket.off('connect', hConnect)
    socket.off('friendRequest:created', hFriendReq)
    socket.off('friendRequest:accepted', hFriendStateChanged)
    socket.off('friendRequest:rejected', hFriendStateChanged)
    socket.off('friendRequest:cancelled', hFriendStateChanged)
    socket.off('block:created', hFriendStateChanged)
    socket.off('notifications:changed', hNotificationsChanged)
    socket.off('chatrooms:badge', hRoomsBadge)
    socket.off('chatrooms:updated', hRoomsUpdated)
    socket.off('chatMessage', hChatMsg)
  }
  // 공용 소켓은 전역 재사용 → disconnect 하지 않음
})
</script>

<style scoped>
.top-menu {
  display: grid;
  gap: 2px;
  background: transparent;
  padding: 5px 8px 3px;
  text-align: center;
  color: var(--text);
  overflow: visible;
}

.menu-item {
  appearance: none;
  border: 0;
  background: transparent;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 54px;
  min-width: 0;
  padding: 5px 0 4px;
  border-radius: 14px;
  cursor: pointer;
  color: var(--text-dim);
  user-select: none;
  -webkit-tap-highlight-color: rgba(173, 125, 50, 0.08);
  transition: color .18s, transform .12s, background .18s;
}
.menu-item:active { transform: scale(0.96); }

.icon-wrap { position: relative; display: inline-block; line-height: 1; }
.menu-icon { display: block; font-size: 21px; line-height: 1; margin-bottom: 5px; }

.icon-badge {
  position: absolute;
  top: -3px;
  right: -6px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--danger);
  border: 2px solid #fff;
  box-sizing: border-box;
  color: #fff;
  font-size: 9px;
  font-weight: 900;
  line-height: 12px;
  text-align: center;
  pointer-events: none;
}

.menu-text {
  display: block;
  max-width: 100%;
  font-size: 11px; line-height: 1; letter-spacing: -.1px; color: var(--text-dim);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.menu-item.active,
.menu-item.active .menu-icon,
.menu-item.active .menu-text {
  color: var(--gold-strong); font-weight: 750;
}

.menu-item.active {
  background: var(--gold-soft);
}

.menu-item:focus-visible { outline: none; box-shadow: var(--focus-ring); }

@media (max-width: 420px) {
  .top-menu { gap: 0; padding-inline: 4px; }
  .menu-item { border-radius: 11px; padding-inline: 1px; }
  .menu-text { font-size: 10px; letter-spacing: -.25px; }
}

@media (max-width: 360px) {
  .top-menu { padding-inline: 2px; }
  .menu-item { min-height: 51px; padding: 4px 0; }
  .menu-icon { font-size: 20px; margin-bottom: 3px; }
  .menu-text { font-size: 9px; }
}
</style>
