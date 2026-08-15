<template>
  <main ref="adminPage" class="admin-page">
    <header class="admin-hero">
      <div>
        <p class="eyebrow">TZCHAT ADMIN</p>
        <h1>운영 관리자</h1>
        <p class="hero-copy">
          {{ administratorLabel }}님, 서비스 상태와 주요 운영 기능을 한곳에서 확인하세요.
        </p>
      </div>

      <button class="refresh-button" type="button" :disabled="loading" @click="loadDashboard">
        <IonIcon :icon="refreshOutline" aria-hidden="true" />
        {{ loading ? '확인 중' : '새로고침' }}
      </button>
    </header>

    <div v-if="errorMessage" class="notice-banner" role="alert">
      <IonIcon :icon="alertCircleOutline" aria-hidden="true" />
      <span>{{ errorMessage }}</span>
    </div>

    <section aria-labelledby="status-title">
      <div class="section-heading">
        <div>
          <p class="section-kicker">LIVE STATUS</p>
          <h2 id="status-title">서비스 현황</h2>
        </div>
        <span class="checked-at">{{ checkedAtLabel }}</span>
      </div>

      <div class="status-grid">
        <article class="status-card">
          <span class="status-icon status-icon--green">
            <IonIcon :icon="pulseOutline" aria-hidden="true" />
          </span>
          <div>
            <p class="status-label">API 서버</p>
            <strong>{{ heartbeat?.ok ? '정상' : loading ? '확인 중' : '확인 필요' }}</strong>
            <small>{{ heartbeat ? `가동 ${formatDuration(heartbeat.uptimeSec)}` : '응답 정보 없음' }}</small>
          </div>
        </article>

        <article class="status-card">
          <span class="status-icon status-icon--blue">
            <IonIcon :icon="serverOutline" aria-hidden="true" />
          </span>
          <div>
            <p class="status-label">데이터베이스</p>
            <strong>{{ dbStatus === 'ok' ? '정상' : loading ? '확인 중' : '확인 필요' }}</strong>
            <small>{{ dbStatus === 'ok' ? 'MongoDB 연결 확인' : '응답 정보 없음' }}</small>
          </div>
        </article>

        <article class="status-card">
          <span class="status-icon status-icon--gold">
            <IonIcon :icon="peopleOutline" aria-hidden="true" />
          </span>
          <div>
            <p class="status-label">현재 접속</p>
            <strong>{{ number(online?.onlineUsers?.length) }}명</strong>
            <small>소켓 {{ number(online?.sockets) }}개 · 활성 방 {{ number(online?.rooms?.length) }}개</small>
          </div>
        </article>

        <article class="status-card">
          <span class="status-icon status-icon--violet">
            <IonIcon :icon="readerOutline" aria-hidden="true" />
          </span>
          <div>
            <p class="status-label">운영 기록</p>
            <strong>{{ number(logs.length) }}건</strong>
            <small>최근 기록 최대 200건</small>
          </div>
        </article>
      </div>
    </section>

    <section class="operations" aria-labelledby="operations-title">
      <div class="section-heading">
        <div>
          <p class="section-kicker">OPERATIONS</p>
          <h2 id="operations-title">운영 기능</h2>
        </div>
      </div>

      <div class="operation-grid">
        <button
          v-for="item in operationItems"
          :key="item.path"
          class="operation-card"
          :class="{ 'operation-card--danger': item.danger }"
          type="button"
          @click="go(item.path)"
        >
          <span class="operation-icon">
            <IonIcon :icon="item.icon" aria-hidden="true" />
          </span>
          <span class="operation-copy">
            <strong>{{ item.title }}</strong>
            <small>{{ item.description }}</small>
          </span>
          <IonIcon :icon="chevronForwardOutline" class="operation-arrow" aria-hidden="true" />
        </button>
      </div>
    </section>

    <section class="activity-section" aria-labelledby="activity-title">
      <div class="section-heading">
        <div>
          <p class="section-kicker">AUDIT</p>
          <h2 id="activity-title">최근 운영 기록</h2>
        </div>
      </div>

      <div class="activity-card">
        <div v-if="loading && !logs.length" class="empty-state">운영 기록을 확인하고 있습니다.</div>
        <div v-else-if="!logs.length" class="empty-state">저장된 운영 기록이 없습니다.</div>
        <ul v-else class="activity-list">
          <li v-for="log in logs.slice(0, 6)" :key="log._id">
            <span class="activity-dot" />
            <div>
              <strong>{{ actionLabel(log.action) }}</strong>
              <p v-if="log.targetId">대상: {{ log.targetId }}</p>
            </div>
            <time>{{ formatDateTime(log.createdAt) }}</time>
          </li>
        </ul>
      </div>
    </section>

    <aside class="safety-note">
      <IonIcon :icon="shieldCheckmarkOutline" aria-hidden="true" />
      <div>
        <strong>중요 작업 전 확인</strong>
        <p>회원 일괄 전환처럼 되돌리기 어려운 작업은 미리보기와 데이터베이스 백업을 먼저 확인해 주세요.</p>
      </div>
    </aside>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { IonIcon } from '@ionic/vue'
import {
  alertCircleOutline,
  chevronForwardOutline,
  createOutline,
  documentTextOutline,
  peopleOutline,
  pulseOutline,
  readerOutline,
  refreshOutline,
  repeatOutline,
  serverOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons'
import api from '@/shared/services/api'
import { useUserStore } from '@/shared/stores/user'

type Heartbeat = {
  ok: boolean
  uptimeSec: number
  serverTime: string
  memory?: { rss?: number; heapUsed?: number }
}

type OnlineStatus = {
  sockets: number
  onlineUsers: unknown[]
  rooms: unknown[]
}

type AdminLog = {
  _id: string
  action?: string
  targetId?: string
  createdAt?: string
}

const router = useRouter()
const userStore = useUserStore()
const adminPage = ref<HTMLElement | null>(null)
const scrollStorageKey = 'tzchat:admin-dashboard-scroll-top'

const heartbeat = ref<Heartbeat | null>(null)
const dbStatus = ref<'idle' | 'ok' | 'error'>('idle')
const online = ref<OnlineStatus | null>(null)
const logs = ref<AdminLog[]>([])
const loading = ref(false)
const errorMessage = ref('')
const checkedAt = ref<Date | null>(null)

const administratorLabel = computed(() =>
  userStore.user?.nickname || userStore.user?.username || '관리자'
)

const checkedAtLabel = computed(() => {
  if (!checkedAt.value) return '아직 확인하지 않음'
  return `${checkedAt.value.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })} 기준`
})

const operationItems = [
  {
    title: '회원 확인',
    description: '가입 회원을 검색하고 공개 프로필을 확인합니다.',
    path: '/home/admin/members',
    icon: peopleOutline,
  },
  {
    title: '공지 관리',
    description: '서비스 공지를 작성하고 공개 상태를 관리합니다.',
    path: '/home/admin/notices',
    icon: createOutline,
  },
  {
    title: '약관·정책',
    description: '현재 문서를 확인하고 새 버전을 발행합니다.',
    path: '/home/legals/v2',
    icon: documentTextOutline,
  },
  {
    title: '베타회원 전환',
    description: '대상 수를 미리 본 뒤 일반회원으로 일괄 전환합니다.',
    path: '/home/admin/migration',
    icon: repeatOutline,
    danger: true,
  },
]

async function go(path: string) {
  const content = adminPage.value?.closest('ion-content') as (HTMLElement & {
    getScrollElement?: () => Promise<HTMLElement>
  }) | null
  const scrollElement = await content?.getScrollElement?.()
  sessionStorage.setItem(scrollStorageKey, String(scrollElement?.scrollTop ?? 0))
  router.push(path)
}

async function restoreScrollPosition() {
  const dashboardScrollTop = Number(sessionStorage.getItem(scrollStorageKey) || 0)
  if (dashboardScrollTop <= 0) return
  await nextTick()
  requestAnimationFrame(async () => {
    const content = adminPage.value?.closest('ion-content') as (HTMLElement & {
      getScrollElement?: () => Promise<HTMLElement>
    }) | null
    const scrollElement = await content?.getScrollElement?.()
    scrollElement?.scrollTo({ top: dashboardScrollTop, behavior: 'auto' })
    sessionStorage.removeItem(scrollStorageKey)
  })
}

function number(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed.toLocaleString('ko-KR') : '0'
}

function formatDuration(seconds: number) {
  const totalMinutes = Math.max(0, Math.floor(Number(seconds || 0) / 60))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days) return `${days}일 ${hours}시간`
  if (hours) return `${hours}시간 ${minutes}분`
  return `${minutes}분`
}

function formatDateTime(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function actionLabel(action?: string) {
  const labels: Record<string, string> = {
    promote: '권한 변경',
    block: '회원 차단',
    deleteRoom: '채팅방 삭제',
    noticeCreate: '공지 작성',
    noticeUpdate: '공지 수정',
    noticeDelete: '공지 삭제',
  }
  return labels[String(action || '')] || action || '운영 작업'
}

async function loadDashboard() {
  if (loading.value) return
  loading.value = true
  errorMessage.value = ''

  const [heartbeatResult, dbResult, onlineResult, logsResult] = await Promise.allSettled([
    api.get('/api/admin/heartbeat'),
    api.get('/api/admin/db-ping'),
    api.get('/api/admin/online'),
    api.get('/api/admin/logs'),
  ])

  if (heartbeatResult.status === 'fulfilled') {
    heartbeat.value = heartbeatResult.value.data
  } else {
    heartbeat.value = null
  }

  dbStatus.value = dbResult.status === 'fulfilled' && dbResult.value.data?.ok ? 'ok' : 'error'

  if (onlineResult.status === 'fulfilled') {
    const data = onlineResult.value.data
    online.value = {
      sockets: Number(data?.sockets || 0),
      onlineUsers: Array.isArray(data?.onlineUsers) ? data.onlineUsers : [],
      rooms: Array.isArray(data?.rooms) ? data.rooms : [],
    }
  } else {
    online.value = null
  }

  logs.value = logsResult.status === 'fulfilled' && Array.isArray(logsResult.value.data?.logs)
    ? logsResult.value.data.logs
    : []

  const failedCount = [heartbeatResult, dbResult, onlineResult, logsResult]
    .filter((result) => result.status === 'rejected').length
  if (failedCount) {
    errorMessage.value = `일부 운영 정보(${failedCount}개)를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.`
  }

  checkedAt.value = new Date()
  loading.value = false
}

onMounted(async () => {
  await loadDashboard()
  await restoreScrollPosition()
})
</script>

<style scoped>
.admin-page {
  width: min(100%, 940px);
  margin: 0 auto;
  padding: 22px 16px 34px;
  color: var(--text);
}

.admin-hero {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 24px;
  overflow: hidden;
  border: 1px solid #dacbae;
  border-radius: 24px;
  background:
    radial-gradient(circle at 90% 10%, rgba(187, 140, 60, .18), transparent 34%),
    linear-gradient(145deg, #fffdf8 0%, #f5efe5 100%);
  box-shadow: 0 14px 34px rgba(62, 47, 27, .08);
}

.eyebrow,
.section-kicker {
  margin: 0 0 5px;
  color: var(--gold-strong);
  font-size: 10px;
  font-weight: 850;
  letter-spacing: .16em;
}

.admin-hero h1,
.section-heading h2 {
  margin: 0;
  color: var(--text);
  font-weight: 850;
  letter-spacing: -.035em;
}

.admin-hero h1 { font-size: clamp(25px, 6vw, 34px); }
.hero-copy {
  max-width: 560px;
  margin: 8px 0 0;
  color: var(--text-dim);
  font-size: 14px;
  line-height: 1.55;
}

.refresh-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 40px;
  padding: 0 13px;
  border: 1px solid #d7c5a4;
  border-radius: 12px;
  background: rgba(255, 255, 255, .8);
  color: var(--gold-strong);
  font-weight: 800;
  cursor: pointer;
}
.refresh-button:disabled { cursor: wait; opacity: .65; }

.notice-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 11px 13px;
  border: 1px solid #efd5a7;
  border-radius: 13px;
  background: #fff8e9;
  color: #78541f;
  font-size: 13px;
}

section { margin-top: 28px; }
.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
  padding: 0 2px;
}
.section-heading h2 { font-size: 20px; }
.checked-at { color: var(--text-dim); font-size: 12px; }

.status-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.status-card {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--panel-border);
  border-radius: 18px;
  background: var(--panel-2);
  box-shadow: 0 5px 18px rgba(51, 43, 34, .045);
}
.status-icon {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  font-size: 18px;
}
.status-icon--green { background: #eaf7ef; color: #247a49; }
.status-icon--blue { background: #edf4fb; color: #356f9f; }
.status-icon--gold { background: var(--gold-soft); color: var(--gold-strong); }
.status-icon--violet { background: #f2edfa; color: #7559a0; }
.status-card > div { min-width: 0; }
.status-label { margin: 0 0 4px; color: var(--text-dim); font-size: 11px; font-weight: 700; }
.status-card strong { display: block; color: var(--text); font-size: 19px; line-height: 1.25; }
.status-card small { display: block; margin-top: 4px; overflow: hidden; color: var(--text-dim); font-size: 10px; line-height: 1.35; text-overflow: ellipsis; }

.operation-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.operation-card {
  appearance: none;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 13px;
  min-width: 0;
  padding: 17px;
  border: 1px solid var(--panel-border);
  border-radius: 18px;
  background: var(--panel-2);
  color: var(--text);
  text-align: left;
  cursor: pointer;
  transition: border-color .16s, transform .12s, box-shadow .16s;
}
.operation-card:hover,
.operation-card:focus-visible {
  border-color: #d4bd94;
  box-shadow: 0 8px 22px rgba(53, 42, 29, .07);
  outline: none;
}
.operation-card:active { transform: scale(.985); }
.operation-card--danger { border-color: #ead8d3; }
.operation-card--danger .operation-icon { background: #fff0ed; color: #b34e3a; }
.operation-icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 14px;
  background: var(--gold-soft);
  color: var(--gold-strong);
  font-size: 20px;
}
.operation-copy { min-width: 0; }
.operation-copy strong { display: block; font-size: 14px; }
.operation-copy small { display: block; margin-top: 4px; color: var(--text-dim); font-size: 11px; line-height: 1.45; }
.operation-arrow { color: var(--text-dim); font-size: 17px; }

.activity-card {
  overflow: hidden;
  border: 1px solid var(--panel-border);
  border-radius: 18px;
  background: var(--panel-2);
}
.activity-list { margin: 0; padding: 0; list-style: none; }
.activity-list li {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 11px;
  padding: 13px 16px;
  border-bottom: 1px solid var(--panel-border);
}
.activity-list li:last-child { border-bottom: 0; }
.activity-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--gold); }
.activity-list strong { font-size: 13px; }
.activity-list p { margin: 2px 0 0; color: var(--text-dim); font-size: 10px; }
.activity-list time { color: var(--text-dim); font-size: 10px; white-space: nowrap; }
.empty-state { padding: 24px 16px; color: var(--text-dim); font-size: 13px; text-align: center; }

.safety-note {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  margin-top: 22px;
  padding: 15px 16px;
  border-radius: 16px;
  background: #f1eee9;
  color: var(--text-dim);
}
.safety-note > ion-icon { flex: 0 0 auto; margin-top: 1px; color: var(--gold-strong); font-size: 19px; }
.safety-note strong { display: block; color: var(--text); font-size: 12px; }
.safety-note p { margin: 4px 0 0; font-size: 11px; line-height: 1.5; }

@media (max-width: 760px) {
  .status-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 520px) {
  .admin-page { padding: 14px 12px 28px; }
  .admin-hero { display: block; padding: 20px; border-radius: 21px; }
  .refresh-button { margin-top: 16px; }
  .status-grid,
  .operation-grid { grid-template-columns: 1fr; }
  .status-card { align-items: center; }
  .activity-list li { grid-template-columns: auto 1fr; }
  .activity-list time { grid-column: 2; }
}
</style>
