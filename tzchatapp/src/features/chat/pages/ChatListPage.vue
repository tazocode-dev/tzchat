<template>
  <!-- ✅ 이 페이지는 HomeMain.vue(IonPage > IonHeader/IonContent/IonFooter)의
       router-view 안에서 렌더된다. 여기서 또 ion-page/ion-content를 만들면
       IonPage가 중첩되어(레이아웃 지침 §8 위반) 화면이 깨진다 — 일반 div로만 구성한다.
       (스크롤은 HomeMain.vue의 IonContent 하나가 전담) -->
  <div class="friends-page dark-scope">
      <div class="page-container fl-scope" role="region" aria-label="채팅방 리스트 영역">
        <div class="container">
          <header class="page-heading">
            <div>
              <p>CONVERSATIONS</p>
              <h1>채팅</h1>
            </div>
            <span class="room-count">{{ chatRooms.length }}개</span>
          </header>

          <ion-list v-if="chatRooms.length">
            <ion-item
              v-for="room in chatRooms"
              :key="room._id"
              button
              class="chat-item"
              @click="onItemClick(room._id)"
              @touchstart.passive="onPressStart(room._id, $event)"
              @touchend.passive="onPressEnd"
              @touchcancel.passive="onPressEnd"
              @touchmove.passive="onPressCancelMove"
              @mousedown.left="onPressStart(room._id, $event)"
              @mouseup.left="onPressEnd"
              @mouseleave="onPressEnd"
            >
              <!-- ⬇️ 좌측: 상대방 대표사진 -->
              <div class="list-avatar lead-start" slot="start">
                <ProfilePhotoViewer
                  v-if="getPartner(room.participants)?._id"
                  :userId="getPartner(room.participants)._id"
                  :gender="getPartner(room.participants).gender || ''"
                  :size="64"
                />
                <div v-else class="fallback-avatar" aria-hidden="true"></div>
              </div>

              <ion-label class="black-text">
                <h3 class="title">
                  <span class="nickname">{{ getPartnerNickname(room.participants) }}</span>
                  <span
                    v-if="room.unreadCount > 0"
                    class="badge-new"
                    :aria-label="`안읽은 메시지 ${room.unreadCount}개`"
                  >{{ room.unreadCount > 99 ? '99+' : room.unreadCount }}</span>
                </h3>
                <p class="meta">{{ getPreview(room) }}</p>
              </ion-label>

              <ion-note slot="end" class="date-note" :aria-label="`최근 날짜 ${formatLastDate(room)}`">
                {{ formatLastDate(room) }}
              </ion-note>

              <!-- 길게누름 액션: 내 목록에서 삭제/취소 버튼 -->
              <div v-if="longPressRoomId === room._id" class="item-actions" @click.stop>
                <button
                  type="button"
                  class="btn-delete"
                  @click.stop="confirmAndDelete(room._id)"
                  aria-label="채팅방 삭제"
                >
                  삭제
                </button>
                <button type="button" class="btn-cancel" @click.stop="hideActions" aria-label="닫기">
                  취소
                </button>
              </div>
            </ion-item>
          </ion-list>

          <ion-text color="medium" v-else>
            <div class="empty-state">
              <span aria-hidden="true">···</span>
              <strong>아직 시작한 대화가 없습니다</strong>
              <p>친구의 프로필에서 편안하게 첫 인사를 건네보세요.</p>
            </div>
          </ion-text>
        </div>
      </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { IonList, IonItem, IonLabel, IonText, IonNote } from '@ionic/vue'
import { useRouter } from 'vue-router'
import { api } from '@/shared/services/api'
import ProfilePhotoViewer from '@/shared/components/ProfilePhotoViewer.vue'
import { connectSocket, getSocket } from '@/shared/services/socket'

const router = useRouter()

const myId = ref('')
const chatRooms = ref([])

/* ─────────────────────────────────────────────
   롱프레스(길게누름) 상태/로직
───────────────────────────────────────────── */
const longPressTimer = ref(null)
const longPressDelay = 600 // ms
const longPressRoomId = ref(null)
const skipNextClick = ref(false)
const pressStartXY = ref({ x: 0, y: 0 })

const onPressStart = (roomId, ev) => {
  const point =
    ev?.touches && ev.touches[0]
      ? { x: ev.touches[0].clientX, y: ev.touches[0].clientY }
      : { x: ev.clientX ?? 0, y: ev.clientY ?? 0 }
  pressStartXY.value = point

  clearTimeout(longPressTimer.value)
  longPressTimer.value = setTimeout(() => {
    longPressRoomId.value = roomId
    skipNextClick.value = true
  }, longPressDelay)
}

const onPressEnd = () => {
  clearTimeout(longPressTimer.value)
  longPressTimer.value = null
}

const onPressCancelMove = (ev) => {
  const t = ev?.touches?.[0]
  if (!t) return
  const dx = Math.abs(t.clientX - pressStartXY.value.x)
  const dy = Math.abs(t.clientY - pressStartXY.value.y)
  if (dx > 10 || dy > 10) onPressEnd()
}

const hideActions = () => {
  longPressRoomId.value = null
  skipNextClick.value = false
}

const onItemClick = (roomId) => {
  if (skipNextClick.value || longPressRoomId.value) {
    skipNextClick.value = false
    return
  }
  goToChat(roomId)
}

/* ─────────────────────────────────────────────
   날짜 포맷: MM-DD
───────────────────────────────────────────── */
const getRoomTime = (r) => r?.lastMessage?.createdAt || r?.updatedAt || null
const formatLastDate = (room) => {
  const t = getRoomTime(room)
  if (!t) return ''
  const d = new Date(t)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}-${dd}`
}

/* ─────────────────────────────────────────────
   응답 정규화 + 정렬
───────────────────────────────────────────── */
const normalizeRooms = (data) => {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.rooms)) return data.rooms
  if (Array.isArray(data?.chatRooms)) return data.chatRooms
  if (Array.isArray(data?.data)) return data.data
  return []
}

const sortRoomsDesc = (rooms) => {
  return rooms.sort((a, b) => {
    const at = getRoomTime(a)
    const bt = getRoomTime(b)
    return new Date(bt || 0) - new Date(at || 0)
  })
}

/* ─────────────────────────────────────────────
   화면 표시 유틸
───────────────────────────────────────────── */
const getPartner = (participants = []) => {
  const my = String(myId.value || '')
  const other =
    participants.find((p) => typeof p === 'object' && p && String(p._id) !== my) ||
    (Array.isArray(participants) && participants.length === 2
      ? typeof participants[0] === 'object'
        ? participants.find((p) => String(p._id) !== my)
        : null
      : null)
  return other && typeof other === 'object' ? other : null
}

const getPartnerNickname = (participants = []) => {
  const other = getPartner(participants)
  return other?.nickname || '(알 수 없음)'
}

const getPreview = (room) => {
  const last = room?.lastMessage
  if (!last) return '메시지가 없습니다.'
  if (last.content && last.content.trim().length > 0) return last.content
  if (last.imageUrl) return '[사진]'
  return '메시지가 없습니다.'
}

/* ─────────────────────────────────────────────
   API 로드
───────────────────────────────────────────── */
let loading = false

const loadMe = async () => {
  try {
    const meRes = await api.get('/api/me')
    myId.value = meRes.data?.user?._id || meRes.data?._id || ''
  } catch (err) {
    console.error('❌ /me 실패', { status: err?.response?.status })
    myId.value = ''
  }
}

const loadChatRooms = async () => {
  if (loading) return
  loading = true
  try {
    const roomRes = await api.get('/api/chatrooms')
    const raw = normalizeRooms(roomRes.data)
    const mapped = raw.map((r) => ({
      ...r,
      unreadCount: Number(r.unreadCount || 0),
      lastMessage: r.lastMessage || null,
    }))
    chatRooms.value = sortRoomsDesc(mapped)
  } catch (err) {
    console.error('❌ 채팅방 목록 불러오기 실패', { status: err?.response?.status })
    chatRooms.value = []
  } finally {
    loading = false
  }
}

const loadMeAndRooms = async () => {
  const startedAt = performance.now()
  try {
    await loadMe()
    await loadChatRooms()
  } finally {
    if (import.meta.env.DEV) {
      console.log(`[LOAD] chatlist: ${(performance.now() - startedAt).toFixed(2)} ms`)
    }
  }
}

/* ─────────────────────────────────────────────
   삭제
───────────────────────────────────────────── */
const confirmAndDelete = async (roomId) => {
  try {
    const ok = window.confirm(
      '내 채팅 목록에서 삭제하시겠습니까?\n\n상대방의 대화는 유지되며, 새 메시지가 오면 그 시점부터 다시 보입니다.'
    )
    if (!ok) return
    await api.delete(`/api/chatrooms/${roomId}`)
    chatRooms.value = chatRooms.value.filter((r) => r._id !== roomId)
    hideActions()
  } catch (err) {
    console.error('❌ 채팅방 삭제 실패', { status: err?.response?.status })
    alert('삭제에 실패했습니다.')
  }
}

/* ─────────────────────────────────────────────
   이동
───────────────────────────────────────────── */
const goToChat = (roomId) => {
  if (!roomId) return
  const room = chatRooms.value.find((r) => r._id === roomId)
  if (room) room.unreadCount = 0 // 낙관적 UI
  router.push(`/home/chat/${roomId}`)
}

/* ─────────────────────────────────────────────
   소켓
   ✅ 이 페이지에서는 "연결 유지"가 핵심
   - disconnect 하지 말고, 이벤트만 해제
───────────────────────────────────────────── */
let offFns = []

const initSocket = () => {
  // 이미 앱 전역에서 사용 중이어도 안전하게 보장
  const socket = getSocket() || connectSocket()

  const onConnect = () => {
    if (myId.value) socket.emit('join', { userId: myId.value })
  }

  const reload = () => {
    // 연타 방지: 로딩 중이면 스킵
    loadChatRooms().catch(() => {})
  }

  socket.on('connect', onConnect)
  socket.on('chatrooms:badge', reload)
  socket.on('chatrooms:updated', reload)
  socket.on('chatMessage', reload)

  offFns = [
    () => socket.off('connect', onConnect),
    () => socket.off('chatrooms:badge', reload),
    () => socket.off('chatrooms:updated', reload),
    () => socket.off('chatMessage', reload),
  ]
}

/* ─────────────────────────────────────────────
   바깥 클릭 시 액션 닫기
───────────────────────────────────────────── */
const onDocClick = (e) => {
  // 액션이 열려있을 때만 처리
  if (!longPressRoomId.value) return
  const target = e.target
  // 액션 영역 클릭이면 무시
  if (target?.closest?.('.item-actions')) return
  hideActions()
}

/* ─────────────────────────────────────────────
   라이프사이클
───────────────────────────────────────────── */
onMounted(async () => {
  await loadMeAndRooms()
  initSocket()
  document.addEventListener('click', onDocClick, { passive: true })
})

onBeforeUnmount(() => {
  offFns.forEach((fn) => {
    try { fn() } catch {}
  })
  offFns = []

  // ✅ 절대 disconnect 하지 않음 (전환 딜레이 원인)
  // const socket = getSocket()
  // socket?.disconnect()

  document.removeEventListener('click', onDocClick)
  hideActions()
})
</script>

<style scoped>
.dark-scope { background: transparent !important; color: var(--text); }

:global(.dark-scope ion-list) { --background: transparent !important; background: transparent !important; }
:global(.dark-scope ion-item) {
  --background-focused: var(--panel-soft) !important;
  --background-hover: var(--panel-soft) !important;
  --background-activated: #eee8df !important;
}

.page-container { padding: 0; position: relative; }

.container {
  max-width: 720px;
  margin: 0 auto;
  padding: 6px 2px calc(18px + var(--safe-bottom));
  box-sizing: border-box;
}

.page-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin: 6px 2px 18px;
}

.page-heading p {
  margin: 0 0 4px;
  color: var(--gold);
  font-size: 10px;
  font-weight: 850;
  letter-spacing: .14em;
}

.page-heading h1 {
  margin: 0;
  color: var(--text-strong);
  font-size: 27px;
  line-height: 1.15;
  letter-spacing: -.045em;
}

.room-count {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--panel-soft);
  color: var(--text-dim);
  font-size: 11px;
  font-weight: 750;
}

ion-list {
  display: grid;
  gap: 10px;
  background: transparent;
}

ion-item {
  --background: var(--panel);
  --color: var(--text);
  --padding-start: 14px;
  --inner-padding-end: 14px;
  --min-height: 92px;
  --inner-border-width: 0;
  color: var(--text);
}

.chat-item {
  margin: 0;
  border: 1px solid var(--panel-border);
  border-radius: 19px;
  --background: var(--panel);
  --inner-border-width: 0;
  position: relative;
  overflow: hidden;
  box-shadow: var(--shadow-xs);
}

.date-note {
  align-self: flex-start;
  margin-top: 20px;
  color: var(--text-faint);
  font-size: 10px;
  margin-left: 8px;
  min-width: 48px;
  text-align: right;
}

.list-avatar {
  width: 62px;
  height: 62px;
  min-width: 62px;
  margin-right: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 20px;
  overflow: hidden;
  border: 1px solid var(--panel-border);
  background: var(--panel-soft);
}
.fallback-avatar {
  width: 100%;
  height: 100%;
  opacity: 0.3;
  background: linear-gradient(135deg, #333, #222);
  border-radius: 19px;
}
.list-avatar :deep(.viewer-host) { width: 100%; height: 100%; }
.list-avatar :deep(.avatar) {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover;
  border-radius: 19px !important;
  box-shadow: none !important;
  pointer-events: none;
}

.black-text { color: var(--text); }
.title {
  color: var(--text);
  font-size: 15px;
  font-weight: 800;
  margin: 0 0 6px;
  line-height: 1.28;
  display: flex;
  align-items: center;
  gap: 6px;
}
.nickname { font-weight: 800; letter-spacing: -0.02em; }
.meta {
  color: var(--text-dim);
  font-size: 12.5px;
  margin: 2px 0 0;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge-new {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--danger);
  color: #fff;
  font-size: 10px;
  font-weight: 900;
  line-height: 18px;
  text-align: center;
}

/* ──────────────────────────────
   길게누름 액션 버튼 (삭제/취소)
────────────────────────────── */
.item-actions {
  position: absolute;
  right: 8px;
  top: 8px;
  display: flex;
  gap: 8px;
  z-index: 2;
  pointer-events: auto;
}

.btn-delete,
.btn-cancel {
  appearance: none;
  border: 1px solid var(--panel-border);
  padding: 6px 10px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 800;
  height: 40px;
  width: 70px;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
}

.btn-delete {
  background: var(--danger);
  color: #fff;
  border-color: var(--danger);
}
.btn-delete:active { transform: translateY(1px); filter: brightness(0.95); }

.btn-cancel {
  background: var(--panel-soft);
  color: var(--text);
}
.btn-cancel:active { transform: translateY(1px); filter: brightness(1.05); }

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 280px;
  padding: 32px 20px;
  border: 1px dashed #d7cec3;
  border-radius: 22px;
  background: rgba(255, 255, 255, .52);
  text-align: center;
}

.empty-state > span {
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  margin-bottom: 15px;
  border-radius: 18px;
  background: var(--panel-soft);
  color: var(--gold);
  font-size: 22px;
  font-weight: 900;
  letter-spacing: 3px;
}

.empty-state strong { color: var(--text-strong); font-size: 15px; }
.empty-state p { max-width: 260px; margin: 8px 0 0; color: var(--text-dim); font-size: 12px; line-height: 1.55; }

@media (max-width: 380px) {
  .btn-delete, .btn-cancel { padding: 5px 8px; font-size: 12px; }
  .chat-item { border-radius: 17px; }
  ion-item { --padding-start: 10px; --inner-padding-end: 10px; }
  .list-avatar { width: 56px; height: 56px; min-width: 56px; border-radius: 17px; }
  .list-avatar :deep(.avatar) { border-radius: 16px !important; }
}
</style>
