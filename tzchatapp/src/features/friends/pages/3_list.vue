<!-- src/components/04310_Page3_list/FriendsTabsPage.vue -->
<template>
  <!-- ✅ 이 페이지는 HomeMain.vue(IonPage > IonHeader/IonContent/IonFooter)의
       router-view 안에서 렌더된다. 여기서 또 ion-page/ion-content를 만들면
       IonPage가 중첩되어(레이아웃 지침 §8 위반) 화면이 깨진다 — 일반 div로만 구성한다.
       (스크롤은 HomeMain.vue의 IonContent 하나가 전담) -->
  <div class="friends-page dark-scope">
    <!-- 상단 고정 탭 -->
    <div class="top-tabs-sticky">
      <ion-toolbar class="top-tabs" role="tablist" aria-label="목록 전환">
        <ion-segment :value="currentTab" @ionChange="onTabChange">
          <ion-segment-button value="premium" @click="markTabRead('premium')">
            <ion-label class="tab-label">
              스피드 결과
              <span v-if="tabHasNew('premium')" class="tab-new-badge" aria-label="새 스피드 결과 있음">N</span>
            </ion-label>
          </ion-segment-button>
          <ion-segment-button value="received" @click="markTabRead('received')">
            <ion-label class="tab-label">
              받은신청
              <span v-if="tabHasNew('received')" class="tab-new-badge" aria-label="새로 받은 신청 있음">N</span>
            </ion-label>
          </ion-segment-button>

          <ion-segment-button value="sent">
            <ion-label>보낸신청</ion-label>
          </ion-segment-button>

          <ion-segment-button value="friends" @click="markTabRead('friends')">
            <ion-label class="tab-label">
              친구리스트
              <span v-if="tabHasNew('friends')" class="tab-new-badge" aria-label="친구 목록 변경 있음">N</span>
            </ion-label>
          </ion-segment-button>

          <ion-segment-button value="blocks" @click="markTabRead('blocks')">
            <ion-label class="tab-label">
              차단리스트
              <span v-if="tabHasNew('blocks')" class="tab-new-badge" aria-label="차단 목록 변경 있음">N</span>
            </ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </div>

    <div class="page-container fl-scope" role="region" aria-label="탭 페이지 영역">
      <component
        :is="currentView"
        :viewer-level="viewerLevel"
        :is-premium="isPremium"
        @open-receive="openReceive"
        @close-receive="closeReceive"
      />

      <!-- ✅ 하단에 받은신청 패널(슬라이드 업) -->
      <transition name="slide-up">
        <section
          v-if="receiveUser"
          class="receive-panel"
          role="dialog"
          aria-label="받은신청 상세"
        >
          <header class="receive-head">
            <h3>받은 신청</h3>
            <button type="button" class="btn-close" @click="closeReceive" aria-label="닫기">×</button>
          </header>

          <!-- ⬇ 상세 패널 컴포넌트 -->
          <ReceivePanel
            :user="receiveUser"
            :viewer-level="viewerLevel"
            :is-premium="isPremium"
            @close="closeReceive"
          />
        </section>
      </transition>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  IonToolbar,
  IonSegment, IonSegmentButton, IonLabel
} from '@ionic/vue'
import { api } from '@/shared/services/api'
import { useRoute } from 'vue-router'

// 탭별 페이지
import PremiumPage  from '@/features/friends/pages/Page_Premium.vue'
import ReceivedPage from '@/features/friends/pages/Page_Receive.vue'
import SentPage     from '@/features/friends/pages/Page_Send.vue'
import FriendsPage  from '@/features/friends/pages/Page_Friend.vue'
import BlocksPage   from '@/features/friends/pages/Page_Block.vue'

// 받은신청 상세 패널
import ReceivePanel from '@/shared/components/UserList.vue'

const currentTab = ref('received')
const route = useRoute()
const notificationCategories = ref({
  friendRequests: false,
  speedResults: false,
  friends: false,
  blocks: false,
})
const tabCategory = {
  premium: 'speedResults',
  received: 'friendRequests',
  friends: 'friends',
  blocks: 'blocks',
}

const applyNotificationState = (data = {}) => {
  notificationCategories.value = {
    friendRequests: Boolean(data?.categories?.friendRequests),
    speedResults: Boolean(data?.categories?.speedResults),
    friends: Boolean(data?.categories?.friends),
    blocks: Boolean(data?.categories?.blocks),
  }
}

const onNotificationState = (event) => applyNotificationState(event?.detail)
const tabHasNew = (tab) => Boolean(notificationCategories.value[tabCategory[tab]])

const publishNotificationState = (data) => {
  try { window.dispatchEvent(new CustomEvent('notifications:state', { detail: data })) } catch {}
}

const refreshNotificationState = async () => {
  try {
    const { data } = await api.get('/api/notifications/status')
    applyNotificationState(data)
    publishNotificationState(data)
  } catch (e) {
    console.warn('[friends] 알림 상태 조회 실패:', e?.message || e)
  }
}

const markTabRead = async (tab) => {
  const category = tabCategory[tab]
  if (!category || !notificationCategories.value[category]) return
  notificationCategories.value = { ...notificationCategories.value, [category]: false }
  try {
    const { data } = await api.put(`/api/notifications/${category}/read`)
    applyNotificationState(data)
    publishNotificationState(data)
  } catch (e) {
    console.warn('[friends] 알림 확인 처리 실패:', e?.message || e)
    await refreshNotificationState()
  }
}

const onTabChange = (ev) => {
  const val = ev?.detail?.value
  if (!val) return
  currentTab.value = val
  closeReceive()
}
const openRequestedTab = (tab) => {
  if (Object.hasOwn(viewMap, tab)) currentTab.value = tab
}
const onOpenTab = (event) => openRequestedTab(event?.detail?.tab)

const viewMap = {
  premium:  PremiumPage,
  received: ReceivedPage,
  sent:     SentPage,
  friends:  FriendsPage,
  blocks:   BlocksPage,
}
const currentView = computed(() => viewMap[currentTab.value] || ReceivedPage)

const receiveUser = ref(null)
const openReceive = (user) => { receiveUser.value = user || null }
const closeReceive = () => { receiveUser.value = null }

/* ✅ 프리미엄 가림 로직 전달용 상태 */
const viewerLevel = ref('')  // '일반회원' | '라이트회원' | '프리미엄회원' 등
const isPremium   = ref(false)

onMounted(async () => {
  window.addEventListener('notifications:state', onNotificationState)
  window.addEventListener('friends:openTab', onOpenTab)
  openRequestedTab(String(route.query.tab || ''))
  try {
    window.dispatchEvent(new CustomEvent('notifications:requestState'))
  } catch {}
  refreshNotificationState()

  try {
    const me = (await api.get('/api/me')).data?.user || {}
    const levelFromApi =
      me?.level ||
      me?.user_level ||
      me?.membership ||
      ''
    viewerLevel.value = String(levelFromApi || '').trim()

    const premiumBool =
      me?.isPremium ?? me?.premium ??
      (String(levelFromApi || '').trim() === '프리미엄회원')
    isPremium.value = Boolean(premiumBool)
  } catch (e) {
    // 서버 실패 시 로컬 스토리지 폴백
    const lv = (localStorage.getItem('user_level') || localStorage.getItem('level') || '').trim().toLowerCase()
    viewerLevel.value = lv
    const boolish = (localStorage.getItem('isPremium') || '').trim().toLowerCase()
    isPremium.value =
      ['프리미엄회원', 'premium', 'premium_member', 'prem'].includes(lv) ||
      ['true','1','yes','y'].includes(boolish)
  }
})

onUnmounted(() => {
  window.removeEventListener('notifications:state', onNotificationState)
  window.removeEventListener('friends:openTab', onOpenTab)
})
</script>

<style scoped>
.dark-scope {
  background: transparent !important;
  color: var(--text);
}

:global(.dark-scope ion-list) {
  --background: transparent !important;
  background: transparent !important;
}
:global(.dark-scope ion-item) {
  --background: transparent !important;
  --background-focused: var(--panel-soft) !important;
  --background-hover: var(--panel-soft) !important;
  --background-activated: #eee8df !important;
}

.top-tabs-sticky {
  position: sticky;
  top: -1px;
  z-index: 6;
  margin: -1px -12px 12px;
  padding: 9px 12px 8px;
  background: rgba(247, 245, 242, 0.92);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}
.top-tabs {
  --background: transparent;
  padding: 0;
  border: 0;
}
.top-tabs :deep(ion-segment) {
  --background: #ebe6df;
  --indicator-color: #fff;
  --color: var(--text-dim);
  --color-checked: var(--text-strong);
  min-height: 46px;
  padding: 4px;
  border: 0;
  border-radius: 15px;
  display: flex;
  flex-wrap: nowrap;
  justify-content: space-between;
  overflow-x: auto;
}
.top-tabs :deep(ion-segment-button) {
  flex: 1 1 25%;
  min-width: 64px;
  min-height: 38px;
  --padding-start: 0;
  --padding-end: 0;
  margin: 0;
  border-radius: 11px;
}
.top-tabs :deep(ion-segment-button ion-label) {
  color: inherit;
  font-size: clamp(10.5px, 2.2vw, 12px);
  font-weight: 700;
  white-space: nowrap;
  text-align: center;
}
.top-tabs :deep(.tab-label) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.tab-new-badge {
  flex: 0 0 auto;
  display: inline-grid;
  place-items: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--danger);
  color: #fff;
  font-size: 8px;
  font-weight: 900;
  line-height: 1;
  box-shadow: 0 0 0 1px #fff;
}
.top-tabs :deep(ion-segment-button.segment-button-checked) {
  background: #fff !important;
  color: var(--text-strong) !important;
  font-weight: 800;
  box-shadow: 0 3px 10px rgba(43, 35, 28, 0.08);
}
.top-tabs :deep(ion-segment-button.segment-button-checked ion-label) {
  color: var(--text-strong) !important;
}

.page-container {
  width: min(100%, 720px);
  margin: 0 auto;
  padding: 0 2px 16px;
  position: relative;
}

.receive-panel {
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: 20px;
  margin-top: 12px;
  padding: 14px;
  box-shadow: var(--shadow-md);
}
.receive-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.receive-head h3 {
  color: var(--text-strong);
  font-size: 16px;
  font-weight: 800;
  margin: 0;
}
.btn-close {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--panel-soft);
  border: none;
  color: var(--text-dim);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

/* slide-up transition */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all .18s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.card {
  background: var(--panel);
  border: 1px solid var(--panel-border);
  border-radius: 18px;
  padding: 14px;
  box-shadow: var(--shadow-sm);
  position: relative;
}

@media (max-width: 380px) {
  .top-tabs :deep(ion-segment-button) { min-width: 58px; }
  .top-tabs :deep(ion-segment-button ion-label) { font-size: 10px; }
}
</style>
