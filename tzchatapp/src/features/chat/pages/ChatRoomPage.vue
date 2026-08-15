<template>
  <ion-page>
    <!-- 상단 고정 헤더 -->
    <ion-header :translucent="true">
      <ion-toolbar class="chat-toolbar">
        <div class="chatroom-header" @click="closeEmojiIfOpen">
          <span class="chat-title" @click="goToPartnerProfile">
            <strong>{{ partnerNickname }}</strong>
            <small>대화 중</small>
          </span>
          <ion-button size="small" fill="clear" @click="goBack" aria-label="뒤로가기">
            <span aria-hidden="true">‹</span>
            뒤로
          </ion-button>
        </div>
      </ion-toolbar>
    </ion-header>

    <!-- 본문: 메시지 스크롤 + 하단 입력창(플로우) -->
    <ion-content class="chat-content">
      <div class="chatroom-container">
        <!-- 메시지 리스트 (내부 스크롤 전담) -->
        <div
          class="chat-messages"
          ref="chatScroll"
          @scroll.passive="scheduleMarkAsRead(250)"
          @click="closeEmojiIfOpen"
        >
          <div
            v-for="item in displayItems"
            :key="item._id"
            class="message-row"
            :class="{ mine: item.type==='message' && isMine(item) }"
          >
            <!-- 날짜 구분선 -->
            <template v-if="item.type === 'divider'">
              <div class="date-divider" role="separator" :aria-label="`타임라인 ${item.label}`">
                <span class="date-chip">{{ item.label }}</span>
              </div>
            </template>

            <!-- 내 메시지 -->
            <template v-else-if="isMine(item)">
              <div class="my-message">
                <div class="bubble-row mine-row">
                  <span
                    v-if="item._meta?.showTime && !isReadByPartner(item)"
                    class="read-flag"
                    aria-label="상대가 아직 읽지 않음"
                  >안읽음</span>

                  <span v-if="item._meta?.showTime" class="time right-time">{{ formatTime(item.createdAt) }}</span>

                  <div class="bubble my-bubble">
                    <template v-if="item.imageUrl">
                      <img
                        :src="getImageUrl(item.imageUrl)"
                        class="chat-image"
                        @click="openImage(getImageUrl(item.imageUrl))"
                      />
                    </template>
                    <template v-else>
                      {{ item.content }}
                    </template>
                  </div>
                </div>
              </div>
            </template>

            <!-- 상대 메시지 -->
            <template v-else>
              <div class="other-message">
                <div
                  v-if="item._meta?.showAvatarName"
                  class="avatar-col"
                  @click="goToPartnerProfile"
                  role="button"
                  aria-label="상대 프로필 보기"
                >
                  <ProfilePhotoViewer
                    v-if="partnerId"
                    :userId="partnerId"
                    :gender="partnerGender"
                    :size="AVATAR_SIZE"
                  />
                  <div v-else class="avatar-fallback">{{ partnerNickname.charAt(0) || '상' }}</div>
                </div>
                <div v-else class="avatar-spacer" />

                <div class="content-col">
                  <div class="name-line" v-if="item._meta?.showAvatarName">
                    <span class="name" @click="goToPartnerProfile">{{ partnerNickname }}</span>
                  </div>

                  <div class="bubble-row">
                    <div class="bubble other-bubble">
                      <template v-if="item.imageUrl">
                        <img
                          :src="getImageUrl(item.imageUrl)"
                          class="chat-image"
                          @click="openImage(getImageUrl(item.imageUrl))"
                        />
                      </template>
                      <template v-else>
                        {{ item.content }}
                      </template>
                    </div>

                    <span v-if="item._meta?.showTime" class="time right-time">{{ formatTime(item.createdAt) }}</span>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- 하단 입력창 -->
        <div class="chat-input-wrapper" ref="composerWrapperRef">
          <div v-if="showEmoji" class="emoji-picker-wrapper" @click.stop>
            <emoji-picker @emoji-click="insertEmoji"></emoji-picker>
          </div>

          <div class="chat-input" @click.stop>
            <ion-button size="small" fill="outline" class="icon-btn" @click="triggerFileInput" aria-label="파일 첨부">📎</ion-button>
            <input type="file" accept="image/*" ref="fileInput" style="display: none" @change="uploadImage" />

            <ion-button size="small" fill="outline" class="icon-btn" @click="toggleEmoji" aria-label="이모지 선택">😊</ion-button>

            <textarea
              ref="textareaRef"
              v-model="newMessage"
              placeholder="메시지를 입력하세요"
              @keydown="handleKeydown"
              @input="autoResizeComposer"
              @compositionstart="isComposing = true"
              @compositionend="handleCompositionEnd"
              rows="1"
              autocomplete="off"
              autocorrect="on"
              spellcheck="true"
            ></textarea>

            <ion-button
              size="small"
              color="primary"
              aria-label="전송"
              @mousedown.prevent
              @touchstart.prevent
              @click="sendMessage"
            >전송</ion-button>
          </div>
        </div>
      </div>

      <Teleport to="body">
        <!-- 이미지 확대 팝업 -->
        <transition name="fade">
          <div
            v-if="enlargedImage"
            class="image-modal"
            role="dialog"
            aria-modal="true"
            aria-label="이미지 보기"
            tabindex="-1"
            @click.self="closeImageModal"
            @keyup.esc="closeImageModal"
          >
            <div class="image-wrapper">
              <button class="close-button" @click="closeImageModal" aria-label="닫기">×</button>
              <img :src="enlargedImage" class="modal-image" @click.stop />
            </div>
          </div>
        </transition>
      </Teleport>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch, computed } from 'vue'
import { IonPage, IonHeader, IonToolbar, IonContent, IonButton } from '@ionic/vue'
import { Keyboard } from '@capacitor/keyboard'
import { useRoute, useRouter } from 'vue-router'
import axios from '@/shared/services/api'
import { connectSocket } from '@/shared/services/socket'
import ProfilePhotoViewer from '@/shared/components/ProfilePhotoViewer.vue'

const route = useRoute()
const router = useRouter()

const roomId = String(route.params.id || '')
let socket = null

const myId = ref('')
const partnerId = ref('')
const partnerNickname = ref('상대방')
const partnerGender = ref('')

const AVATAR_SIZE = 40

const messages = ref([])
const newMessage = ref('')
const chatScroll = ref(null)
const textareaRef = ref(null)
const composerWrapperRef = ref(null)
const showEmoji = ref(false)
const fileInput = ref(null)
const enlargedImage = ref('')
const isComposing = ref(false)

// ===== 유틸 =====
const pad2 = (n)=> String(n).padStart(2,'0')
const minuteKey = (d) => { const t=new Date(d); return `${t.getFullYear()}-${pad2(t.getMonth()+1)}-${pad2(t.getDate())} ${pad2(t.getHours())}:${pad2(t.getMinutes())}` }
const toLocalYMD = (d) => { const t=new Date(d); return `${t.getFullYear()}-${pad2(t.getMonth()+1)}-${pad2(t.getDate())}` }
const formatKDate = (d) => new Date(d).toLocaleDateString(undefined, { month: 'long', day: 'numeric', weekday: 'long' })
const formatTime=(iso)=> new Date(iso).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})

// ===== 포커스 =====
const focusComposer = async (delay = 0) => {
  await nextTick()
  window.setTimeout(() => {
    const el = textareaRef.value
    if (el) {
      el.focus()
      const len = el.value?.length ?? 0
      if (typeof el.setSelectionRange === 'function') el.setSelectionRange(len, len)
    }
  }, delay)
}

// 판별
const isMine = (msg)=> !!(msg?.sender && (msg.sender._id===myId.value || msg.sender===myId.value))
const isReadByPartner = (msg)=> partnerId.value && (msg?.readBy||[]).some(id=>String(id)===String(partnerId.value))

// ===== 렌더 배열 =====
const displayItems = computed(() => {
  const out = []
  let lastYmd = null
  const list = messages.value
  const sameMinute = (a,b)=> a && b && (minuteKey(a.createdAt||a._id)===minuteKey(b.createdAt||b._id))

  for (let i=0; i<list.length; i++){
    const m = list[i]
    const created = m.createdAt || m._id
    const ymd = toLocalYMD(created)

    if (ymd !== lastYmd) {
      out.push({_id:`divider-${ymd}`, type:'divider', label:formatKDate(created)})
      lastYmd = ymd
    }

    const prev = list[i-1]
    const next = list[i+1]
    const meta = {}

    if (isMine(m)) {
      const nextMine = next && isMine(next)
      const groupWithNext = nextMine && sameMinute(m,next)
      meta.showTime = !groupWithNext
    } else {
      const prevOther = prev && !isMine(prev)
      const nextOther = next && !isMine(next)
      const groupWithPrev = prevOther && sameMinute(prev,m)
      const groupWithNext = nextOther && sameMinute(m,next)
      meta.showAvatarName = !groupWithPrev
      meta.showTime = !groupWithNext
    }

    out.push({ ...m, type:'message', _meta: meta })
  }
  return out
})

// 이미지/모달
const openImage = (url)=>{ enlargedImage.value=url; requestAnimationFrame(()=>document.querySelector('.image-modal')?.focus()) }
const closeImageModal = ()=>{ enlargedImage.value='' }

// ✅ 이미지 URL 생성
const getImageUrl = (path) => {
  if (!path) return ''
  const s = String(path).trim()

  // 공통 API client(@/shared/services/api)의 런타임 baseURL을 그대로 사용한다.
  const mediaBase = String(axios?.defaults?.baseURL || '').replace(/\/+$/, '')

  if (/^https?:\/\//i.test(s)) {
    try {
      const parsed = new URL(s)
      const isLocalUpload = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)
        && parsed.pathname.startsWith('/uploads/')
      if (isLocalUpload) return `${mediaBase}${parsed.pathname}${parsed.search}${parsed.hash}`
    } catch {}
    return s
  }

  const p = s.startsWith('/') ? s : `/${s}`
  return `${mediaBase}${p}`
}

// ===== scrollToBottom: "1회 예약" =====
let scrollRaf = 0
const requestScrollToBottom = () => {
  if (scrollRaf) return
  scrollRaf = requestAnimationFrame(async () => {
    scrollRaf = 0
    await nextTick()
    const el = chatScroll.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

// 데이터 로딩
const loadMessages = async ()=> {
  const res = await axios.get(`/api/chatrooms/${roomId}`)
  messages.value = res.data.messages || []
  myId.value = res.data.myId
  const partner = res.data.participants?.find?.(p=>String(p._id)!==String(myId.value))
  partnerNickname.value = partner?.nickname || '상대방'
  partnerId.value = partner?._id || ''
  partnerGender.value = partner?.gender || ''
  await nextTick()
  requestScrollToBottom()
  scheduleMarkAsRead()
}

// 전송
const sendMessage = async ()=> {
  const content=newMessage.value.trim()
  if(!content) return
  const res = await axios.post(`/api/chatrooms/${roomId}/message`,{content,type:'text'})
  newMessage.value=''
  pushMessageSafe({...res.data,createdAt:res.data.createdAt||new Date().toISOString()})
  showEmoji.value = false
  requestScrollToBottom()
  await focusComposer(0)
}

// 업로드
const MAX_SIZE=10*1024*1024
const ACCEPTED=['image/png','image/jpeg','image/webp','image/gif']
const validateImage=(f)=>ACCEPTED.includes(f.type)&&f.size<=MAX_SIZE
const uploadImage=async(e)=>{
  const file=e.target.files?.[0]; if(!file) return
  if(!validateImage(file)){ e.target.value=''; return }
  const formData=new FormData(); formData.append('image',file)
  const up=await axios.post(`/api/chatrooms/${roomId}/upload-image`,formData,{headers:{'Content-Type':'multipart/form-data'},withCredentials:true})
  const relativePath=up.data?.relativePath||up.data?.imageUrl
  const msg=await axios.post(`/api/chatrooms/${roomId}/message`,{content:relativePath,type:'image'},{withCredentials:true})
  pushMessageSafe({...msg.data,createdAt:msg.data.createdAt||new Date().toISOString()})
  e.target.value=''
  showEmoji.value = false
  requestScrollToBottom()
  await focusComposer(0)
}

// 붙여넣기
const onPaste=async(e)=>{
  const items=e.clipboardData?.items||[]
  for(const it of items){
    if(it.kind==='file'){
      const f=it.getAsFile()
      if(f && validateImage(f)){
        const form=new FormData(); form.append('image',f)
        const up=await axios.post(`/api/chatrooms/${roomId}/upload-image`,form,{headers:{'Content-Type':'multipart/form-data'},withCredentials:true})
        const relativePath=up.data?.relativePath||up.data?.imageUrl
        const msg=await axios.post(`/api/chatrooms/${roomId}/message`,{content:relativePath,type:'image'},{withCredentials:true})
        pushMessageSafe({...msg.data,createdAt:msg.data.createdAt||new Date().toISOString()})
        showEmoji.value = false
        requestScrollToBottom()
        await focusComposer(0)
        e.preventDefault()
        break
      }
    }
  }
}

const closeEmojiIfOpen = async ()=> {
  if(showEmoji.value){
    showEmoji.value=false
    await focusComposer(0)
  }
}

const toggleEmoji = ()=> {
  showEmoji.value = !showEmoji.value
  if (showEmoji.value) {
    requestAnimationFrame(autoResizeComposer)
  } else {
    requestAnimationFrame(() => textareaRef.value?.focus())
  }
}

const handleCompositionEnd = () => {
  isComposing.value = false
  requestAnimationFrame(autoResizeComposer)
}

const handleKeydown=(e)=>{
  // 한글 조합 중 Enter는 글자 확정 키이므로 메시지를 전송하지 않는다.
  if (isComposing.value || e.isComposing || e.keyCode === 229) return
  if(e.key==='Enter' && !e.shiftKey){
    e.preventDefault()
    sendMessage()
  }
}

const triggerFileInput=()=>fileInput.value?.click()

const insertEmoji=(ev)=>{
  const emoji=ev?.detail?.unicode||''
  if(emoji){
    newMessage.value+=emoji
    requestAnimationFrame(()=>textareaRef.value?.focus())
    autoResizeComposer()
  }
}

// 읽음 처리
let readTimer=null
const scheduleMarkAsRead=(delay=200)=>{ if(readTimer) clearTimeout(readTimer); readTimer=setTimeout(markAsReadNow,delay) }
const markAsReadNow=async()=>{ try{
  if(!roomId||!myId.value) return
  const r=await axios.put(`/api/chatrooms/${roomId}/read`)
  const ids=r?.data?.updatedMessageIds||[]
  if(!ids.length) return
  for(const m of messages.value){
    if(ids.includes(m._id)){
      const arr=m.readBy||[]
      if(!arr.includes(myId.value)) m.readBy=[...arr,myId.value]
    }
  }
}catch(e){} }

// 중복 방지
const seenMsgIds=new Set()
const pushMessageSafe=(m)=>{
  const id=m?._id
  if(!id||seenMsgIds.has(id)) return
  seenMsgIds.add(id)
  messages.value.push(m)
  if(seenMsgIds.size>1000){
    const fid=messages.value[0]?._id
    if(fid) seenMsgIds.delete(fid)
  }
}

// ===== [키보드] =====
let removeKeyboardListeners = null
let vv = null
let baseVh = 0
let kbOpen = false
let lastKb = -1

const setCssVar = (name, value) => document.documentElement.style.setProperty(name, value)

const COMPOSER_MAX_CLOSED = 120
const COMPOSER_MAX_OPEN_RATIO = 0.33

const getComposerMaxPx = () => {
  const vh = Number(getComputedStyle(document.documentElement).getPropertyValue('--vh').replace('px','')) || window.innerHeight
  return kbOpen ? Math.round(vh * COMPOSER_MAX_OPEN_RATIO) : COMPOSER_MAX_CLOSED
}

// textarea 자동 리사이즈 (+ 최대 높이 제한) + 입력창 높이 반영
const autoResizeComposer = () => {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  const line = Math.max(32, Math.min(el.scrollHeight, getComposerMaxPx()))
  el.style.height = line + 'px'
  updateComposerHeight()
}

// 입력창 wrapper 실제 높이를 CSS 변수로 반영
const updateComposerHeight = () => {
  const wrap = composerWrapperRef.value
  if (!wrap) return
  const h = Math.round(wrap.getBoundingClientRect().height)
  setCssVar('--composer-h', `${h}px`)
}

// ✅ 키보드 상태 업데이트: "변화 있을 때만"
const updateKeyboardState = (kbHeightPx = 0) => {
  const nextOpen = kbHeightPx > 0
  const nextKb = nextOpen ? kbHeightPx : 0

  if (nextKb === lastKb && nextOpen === kbOpen) return
  lastKb = nextKb
  kbOpen = nextOpen

  setCssVar('--kb', kbOpen ? `${nextKb}px` : '0px')
  setCssVar('--composer-max', `${getComposerMaxPx()}px`)

  updateComposerHeight()
  requestScrollToBottom()
}

// visualViewport 기반
const handleViewportResize = () => {
  if (!vv) return
  const current = Math.round(vv.height)
  setCssVar('--vh', `${current}px`)

  const SLOP = 8
  const kbHeight = Math.max(0, Math.round(baseVh - current) + SLOP)
  updateKeyboardState(kbHeight)
}

const onSocketChatMessage = (msg) => {
  const message = msg?.message || msg
  const inSameRoom =
    msg?.roomId === roomId ||
    msg?.chatRoom === roomId ||
    msg?.chatRoom?._id === roomId ||
    message?.chatRoom === roomId ||
    message?.chatRoom?._id === roomId
  if (!inSameRoom) return
  if (!message.createdAt) message.createdAt = new Date().toISOString()
  pushMessageSafe(message)
  requestScrollToBottom()
  if (!isMine(message)) scheduleMarkAsRead(250)
}

const onSocketMessagesRead = ({ roomId: rid, readerId, messageIds } = {}) => {
  if (String(rid) !== String(roomId)) return
  if (!readerId || !Array.isArray(messageIds) || !messageIds.length) return
  for (const m of messages.value) {
    if (!isMine(m)) continue
    if (!messageIds.includes(m._id)) continue
    const arr = m.readBy || []
    if (!arr.includes(readerId)) m.readBy = [...arr, readerId]
  }
}

onMounted(async()=>{
  socket=connectSocket()
  window.addEventListener('paste', onPaste)
  await loadMessages()

  setCssVar('--kb','0px')
  setCssVar('--composer-max','110px')
  setCssVar('--vh', `${window.innerHeight}px`)
  updateComposerHeight()

  try {
    await Keyboard.setResizeMode({ mode: 'native' })
    await Keyboard.setScroll({ isDisabled: true })
  } catch (e) {}

  if (window.visualViewport) {
    vv = window.visualViewport
    baseVh = Math.round(vv.height)
    vv.addEventListener('resize', handleViewportResize)
    vv.addEventListener('scroll', handleViewportResize)
  } else {
    baseVh = window.innerHeight
    const onResize = () => {
      setCssVar('--vh', `${window.innerHeight}px`)
      const kbHeight = Math.max(0, baseVh - window.innerHeight)
      updateKeyboardState(kbHeight)
    }
    window.addEventListener('resize', onResize)
  }

  try {
    const listeners = []
    listeners.push(await Keyboard.addListener('keyboardWillShow', ({ keyboardHeight }) => {
      updateKeyboardState(Math.round(keyboardHeight || 0))
    }))
    listeners.push(await Keyboard.addListener('keyboardWillHide', () => {
      updateKeyboardState(0)
    }))
    listeners.push(await Keyboard.addListener('keyboardDidShow', ({ keyboardHeight }) => {
      updateKeyboardState(Math.round(keyboardHeight || 0))
    }))
    listeners.push(await Keyboard.addListener('keyboardDidHide', () => {
      updateKeyboardState(0)
    }))
    removeKeyboardListeners = () => listeners.forEach(l => l?.remove?.())
  } catch (e) {}

  socket.emit('joinRoom',roomId)
  socket.on('chatMessage', onSocketChatMessage)
  socket.on('messagesRead', onSocketMessagesRead)
})

onUnmounted(() => {
  window.removeEventListener('paste', onPaste)
  if (vv) {
    vv.removeEventListener('resize', handleViewportResize)
    vv.removeEventListener('scroll', handleViewportResize)
  }
  removeKeyboardListeners?.()
  if (readTimer) clearTimeout(readTimer)
  readTimer = null
  if (scrollRaf) cancelAnimationFrame(scrollRaf)
  scrollRaf = 0

  if (socket) {
    socket.off('chatMessage', onSocketChatMessage)
    socket.off('messagesRead', onSocketMessagesRead)
    socket.emit('leaveRoom', roomId)
  }

  setCssVar('--kb','0px')
  setCssVar('--composer-max','110px')
})

// 내 메시지 작성이나 상대의 읽음 표시 변경은 내 미읽음 처리 조건이 아니다.
// 최초 로딩과 실제 상대 메시지 수신 때만 scheduleMarkAsRead를 호출한다.
watch(messages,()=>{ requestScrollToBottom() },{deep:true})
watch(showEmoji, async ()=>{ await nextTick(); updateComposerHeight(); requestScrollToBottom() })

// 네비게이션
const goBack=()=>router.push('/home/4page')
const goToPartnerProfile=()=>{ if(partnerId.value) router.push(`/home/user/${partnerId.value}`) }
</script>

<style scoped>
:deep(ion-header){ padding-top:0 !important; --ion-safe-area-top:0px; }
:deep(ion-toolbar){ --padding-top:0 !important; --min-height:58px; }

.chat-content {
  --padding-top: 0px;
  --padding-bottom: 0px;
  display: flex;
  flex-direction: column;
  height: auto;
  flex: 1;
  background: var(--page-bg, #f4f0ea);
}

.chatroom-container{
  display:flex; flex-direction:column;
  height:100%; min-height:100%;
  width:100%;
  overflow:hidden;

  --gold-500:var(--gold); --gold-400:#bd914c;
  --color-text:var(--text); --color-muted:var(--text-faint);
  --page-bg:#f4f0ea; --section-bg:#f4f0ea;
  --bubble-other:#ffffff; --bubble-me:#e8d7b8;
  --radius:16px; --radius-lg:20px;
  --gap-xxs:4px; --gap-xs:7px; --gap-sm:7px; --gap-md:12px;
  --fz-base:14px; --fz-time:10px; --fz-title:15px;
}

.chat-toolbar{
  --background: rgba(255,255,255,.94);
  --border-color: var(--panel-border);
  --min-height: 58px;
  border-bottom: 1px solid var(--panel-border);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}
.chatroom-header {
  display:flex; align-items:center; gap:var(--gap-sm);
  min-height:58px; padding: 7px 14px;
  background:transparent;
  box-sizing:border-box;
}
.chatroom-header ion-button{
  --padding-start:11px; --padding-end:11px; --border-radius:12px; --color:var(--gold-strong);
  --background:var(--panel-soft); --border-color:var(--panel-border);
  min-height:38px; font-size:13px; font-weight:800; margin-left:auto;
}
.chatroom-header ion-button span{ font-size:22px; line-height:1; margin-right:2px; }
.chat-title{
  display:flex;
  flex-direction:column;
  gap:2px;
  color:var(--text-strong);
  cursor:pointer;
  margin-left:2px;
}
.chat-title strong{ font-size:16px; line-height:1.25; letter-spacing:-.025em; }
.chat-title small{ color:var(--text-faint); font-size:10px; font-weight:650; }

.chat-messages{
  flex:1 1 0; min-height:0;
  overflow:auto; -webkit-overflow-scrolling:touch;
  padding: 18px 12px 8px;
  background:var(--section-bg);
  scrollbar-gutter:stable;
  overscroll-behavior: contain;
  touch-action: manipulation;
}

.message-row{ margin-bottom:var(--gap-xs); }

.other-message,.my-message{ display:flex; gap:var(--gap-xxs); }
.my-message{ width:100%; justify-content:flex-end; align-items:flex-end; }
.other-message{ justify-content:flex-start; align-items:flex-start; }

.avatar-col,
.avatar-spacer{
  width:var(--avatar-size, 40px); min-width:var(--avatar-size, 40px); height:var(--avatar-size, 40px);
  margin-right:6px; margin-top:var(--avatar-offset-y, 8px);
}
.avatar-col{
  display:flex; align-items:center; justify-content:center;
  border-radius:var(--avatar-radius, 50%); overflow:hidden;
  border:1px solid var(--panel-border); background:var(--panel-soft);
  cursor:pointer;
}
.avatar-fallback{ width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:var(--panel-soft); color:var(--gold-strong); font-weight:800; font-size:12px; }
.avatar-col :deep(.viewer-host){ width:100%; height:100%; }
.avatar-col :deep(.avatar){ width:100%!important; height:100%!important; object-fit:cover; border-radius:0!important; box-shadow:none!important; pointer-events:none; }

.content-col{ display:flex; flex-direction:column; max-width:min(78%,560px); }
.name-line{ margin:0 0 2px 4px; }
.name{ font-size:11px; color:var(--text-dim); letter-spacing:-.01em; user-select:none; }
.name:hover{ text-decoration:underline; cursor:pointer; }

.bubble-row{ display:flex; align-items:flex-end; gap:6px; }
.bubble-row.mine-row{ justify-content:flex-end; }
.bubble{
  max-width:100%; padding:9px 12px; border-radius:var(--radius);
  background-color:#fff; color:var(--color-text);
  word-break:break-word; white-space:pre-wrap;
  font-size:var(--fz-base); line-height:1.4;
  box-shadow:0 5px 14px rgba(43,35,28,.05); border:1px solid rgba(90,75,62,.08);
}
.other-bubble{ background:var(--bubble-other); border-bottom-left-radius:5px; }
.my-bubble{ background:var(--bubble-me); border-color:#dec79e; border-bottom-right-radius:5px; }

.chat-image{ max-width:150px; max-height:150px; border-radius:10px; cursor:pointer; display:block; box-shadow:0 1px 0 rgba(0,0,0,0.06); border:1px solid rgba(0,0,0,0.06); }

.time{ font-size:var(--fz-time); color:var(--text-faint); white-space:nowrap; user-select:none; }
.right-time{ align-self:flex-end; margin:0 0 2px 2px; }
.read-flag{
  font-size:var(--fz-time); color:#a23d43; background:#fff3f3; border:1px solid #efc9cb;
  border-radius:999px; padding:2px 6px; margin-left:4px; line-height:1.3; user-select:none;
}

.date-divider{
  display:flex; align-items:center; justify-content:center; margin:14px 0;
}
.date-chip{
  font-size:10px; color:var(--text-dim); background:rgba(255,255,255,.7);
  border:1px solid var(--panel-border); border-radius:999px; padding:5px 10px; line-height:1.2;
}

/* 앱 루트가 기기 safe-area를 처리하므로 입력창 아래에 고정 여백을 중복으로 두지 않는다. */
.chat-input-wrapper {
  position: sticky;
  bottom: 0;
  z-index: 3;
  background: var(--page-bg);
  border-top: 1px solid var(--panel-border);
  padding-bottom: 0;
}

.chat-input{
  display:grid; grid-template-columns:auto auto 1fr auto; align-items:end; gap:var(--gap-sm);
  padding:10px 12px;
  background:var(--page-bg); box-sizing:border-box;
}

.chat-input ion-button.icon-btn{ --padding-start:4px; --padding-end:4px; width:40px; min-width:40px; font-size:16px; --border-color:var(--panel-border); --background:#fff; --background-hover:var(--panel-soft); }
.chat-input ion-button[fill="outline"]{ --border-color:var(--panel-border); --color:var(--text-dim); --background:#fff; --background-hover:var(--panel-soft); --border-radius:13px; min-height:40px; font-size:13px; border:1px solid var(--panel-border); }
.chat-input ion-button[color="primary"]{ --background:var(--gold); --color:#fff; --border-radius:13px; min-height:40px; font-weight:800; }

.chat-input textarea{
  flex:1 1 auto; padding:9px 11px; border:1px solid var(--panel-border)!important; border-radius:13px; margin:0;
  font-size:var(--fz-base); background:#ffffff!important; color:var(--text)!important; resize:none; line-height:1.4;
  min-height:40px;
  max-height: var(--composer-max, 110px);
  box-shadow:0 0 0 2px rgba(212,175,55,0.08);
}
.chat-input textarea::placeholder{ color:var(--text-faint)!important; }
.chat-input textarea:focus{ outline:none; box-shadow:0 0 0 3px var(--gold-soft)!important; border-color:var(--gold-500)!important; }

.emoji-picker-wrapper{
  position:absolute; left:var(--gap-md);
  bottom: calc(100% + 8px);
  z-index:999; background:#fff; border:1px solid var(--panel-border);
  border-radius:var(--radius-lg); overflow:hidden; box-shadow:var(--shadow-md);
}

.image-modal{
  position: fixed; inset: 0; z-index: 9999;
  display:flex; align-items:center; justify-content:center;
  background: rgba(0,0,0,.72);
}
.image-wrapper{
  position: relative; max-width: 92vw; max-height: 82vh;
  display:flex; align-items:center; justify-content:center;
}
.modal-image{
  max-width: 100%; max-height: 100%; border-radius: 18px;
  box-shadow: 0 10px 30px rgba(0,0,0,.5);
}
.close-button{
  position:absolute; top:-10px; right:-10px; width:32px; height:32px;
  border:none; border-radius:50%; background:#24211f; color:#fff; font-size:20px;
  display:flex; align-items:center; justify-content:center; cursor:pointer;
}

@media (max-width: 360px) {
  .chat-input { gap: 5px; padding-inline: 8px; }
  .chat-input ion-button.icon-btn { width: 36px; min-width: 36px; }
  .chat-input ion-button[fill="outline"] { min-height: 38px; }
  .chat-input ion-button[color="primary"] { min-height: 38px; }
}
</style>
