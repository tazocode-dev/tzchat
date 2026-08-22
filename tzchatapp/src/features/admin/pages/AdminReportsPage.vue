<template>
  <main class="reports-page">
    <header class="page-header">
      <div>
        <button type="button" class="back-button" @click="router.back()">← 관리자 홈</button>
        <p class="eyebrow">SAFETY REPORTS</p>
        <h1>신고 관리</h1>
        <p>접수된 사용자 신고를 확인하고 처리 상태를 기록합니다.</p>
      </div>
      <button type="button" class="refresh-button" :disabled="loading" @click="loadReports">
        {{ loading ? '확인 중…' : '새로고침' }}
      </button>
    </header>

    <section class="toolbar" aria-label="신고 목록 필터">
      <label for="report-status-filter">처리 상태</label>
      <select id="report-status-filter" v-model="statusFilter" :disabled="loading" @change="changeFilter">
        <option value="">전체</option>
        <option v-for="status in REPORT_STATUSES" :key="status" :value="status">
          {{ statusLabel(status) }}
        </option>
      </select>
      <span>총 {{ total.toLocaleString('ko-KR') }}건</span>
    </section>

    <p v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</p>
    <div v-if="loading && !reports.length" class="empty-state">신고 내역을 불러오고 있습니다.</div>
    <div v-else-if="!reports.length" class="empty-state">조건에 맞는 신고 내역이 없습니다.</div>

    <section v-else class="report-list" aria-label="신고 내역">
      <article v-for="report in reports" :key="report._id" class="report-card">
        <header class="report-card__header">
          <div class="badges">
            <span class="status-badge" :data-status="report.status">{{ statusLabel(report.status) }}</span>
            <span class="context-badge">{{ contextLabel(report.contextType) }}</span>
          </div>
          <time :datetime="report.createdAt">{{ formatDateTime(report.createdAt) }}</time>
        </header>

        <dl class="people-grid">
          <div>
            <dt>신고자</dt>
            <dd>{{ userLabel(report.reporterUserId) }}</dd>
          </div>
          <div>
            <dt>피신고자</dt>
            <dd>{{ userLabel(report.reportedUserId) }}</dd>
          </div>
        </dl>

        <div class="report-content">
          <p><strong>사유</strong>{{ reasonLabel(report.reason) }}</p>
          <p><strong>상세 내용</strong>{{ report.details || '작성된 상세 내용이 없습니다.' }}</p>
          <p v-if="report.contextType === 'chat' && report.chatRoomId" class="identifier">
            <strong>채팅방</strong>{{ objectIdLabel(report.chatRoomId) }}
          </p>
        </div>

        <footer class="status-editor">
          <label :for="`report-status-${report._id}`">처리 상태 변경</label>
          <div>
            <select
              :id="`report-status-${report._id}`"
              v-model="draftStatuses[report._id]"
              :disabled="updatingId === report._id"
            >
              <option v-for="status in REPORT_STATUSES" :key="status" :value="status">
                {{ statusLabel(status) }}
              </option>
            </select>
            <button
              type="button"
              :data-testid="`save-status-${report._id}`"
              :disabled="updatingId === report._id || draftStatuses[report._id] === report.status"
              @click="updateStatus(report)"
            >
              {{ updatingId === report._id ? '저장 중…' : '상태 저장' }}
            </button>
          </div>
        </footer>
      </article>
    </section>

    <nav v-if="pages > 1" class="pagination" aria-label="신고 목록 페이지">
      <button type="button" :disabled="loading || page <= 1" @click="movePage(page - 1)">이전</button>
      <span>{{ page }} / {{ pages }}</span>
      <button type="button" :disabled="loading || page >= pages" @click="movePage(page + 1)">다음</button>
    </nav>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/shared/services/api'

const REPORT_STATUSES = ['pending', 'reviewed', 'resolved', 'rejected'] as const
type ReportStatus = typeof REPORT_STATUSES[number]

type ReportUser = { _id?: string; nickname?: string } | string | null
type AdminReport = {
  _id: string
  reporterUserId?: ReportUser
  reportedUserId?: ReportUser
  reason?: string
  details?: string
  contextType?: 'profile' | 'chat'
  chatRoomId?: { _id?: string } | string | null
  status: ReportStatus
  createdAt?: string
}

const router = useRouter()
const reports = ref<AdminReport[]>([])
const draftStatuses = ref<Record<string, ReportStatus>>({})
const statusFilter = ref<ReportStatus | ''>('pending')
const loading = ref(false)
const updatingId = ref('')
const errorMessage = ref('')
const page = ref(1)
const pages = ref(1)
const total = ref(0)
const limit = 20

const STATUS_LABELS: Record<ReportStatus, string> = {
  pending: '처리 대기',
  reviewed: '검토 완료',
  resolved: '처리 완료',
  rejected: '신고 기각',
}

const REASON_LABELS: Record<string, string> = {
  inappropriate_profile: '부적절한 프로필',
  sexual_content: '음란·성적인 콘텐츠',
  harassment: '욕설·괴롭힘',
  impersonation: '사칭',
  spam: '광고·스팸',
  other: '기타',
}

function statusLabel(status: ReportStatus) {
  return STATUS_LABELS[status] || status
}

function reasonLabel(reason?: string) {
  return REASON_LABELS[String(reason || '')] || reason || '-'
}

function contextLabel(context?: string) {
  return context === 'chat' ? '채팅' : '프로필'
}

function objectIdLabel(value: AdminReport['chatRoomId']) {
  if (typeof value === 'string') return value
  return value?._id || '-'
}

function userLabel(value?: ReportUser) {
  if (!value) return '탈퇴 또는 확인 불가 사용자'
  if (typeof value === 'string') return `사용자 ${value.slice(-6)}`
  return value.nickname || `사용자 ${String(value._id || '').slice(-6)}`
}

function formatDateTime(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function readError(error: any, fallback: string) {
  return error?.response?.data?.message || fallback
}

async function loadReports() {
  if (loading.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    const { data } = await api.get('/api/admin/reports', {
      params: { status: statusFilter.value || undefined, page: page.value, limit },
    })
    reports.value = Array.isArray(data?.reports) ? data.reports : []
    page.value = Number(data?.page || page.value)
    pages.value = Math.max(1, Number(data?.pages || 1))
    total.value = Math.max(0, Number(data?.total || 0))
    draftStatuses.value = Object.fromEntries(
      reports.value.map(report => [report._id, report.status])
    )
  } catch (error: any) {
    errorMessage.value = readError(error, '신고 내역을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.')
  } finally {
    loading.value = false
  }
}

async function updateStatus(report: AdminReport) {
  const status = draftStatuses.value[report._id]
  if (!REPORT_STATUSES.includes(status) || status === report.status || updatingId.value) return
  updatingId.value = report._id
  errorMessage.value = ''
  try {
    await api.patch(`/api/admin/reports/${report._id}/status`, { status })
    if (statusFilter.value && status !== statusFilter.value) {
      reports.value = reports.value.filter(item => item._id !== report._id)
      total.value = Math.max(0, total.value - 1)
      pages.value = Math.max(1, Math.ceil(total.value / limit))
    } else {
      report.status = status
    }
  } catch (error: any) {
    draftStatuses.value[report._id] = report.status
    errorMessage.value = readError(error, '신고 상태를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.')
  } finally {
    updatingId.value = ''
  }
}

function changeFilter() {
  page.value = 1
  loadReports()
}

function movePage(nextPage: number) {
  if (nextPage < 1 || nextPage > pages.value || nextPage === page.value) return
  page.value = nextPage
  loadReports()
}

onMounted(loadReports)
</script>

<style scoped>
.reports-page { width:min(100%, 920px); margin:0 auto; padding:22px 16px 36px; color:var(--text, #2d241f); }
.page-header { display:flex; justify-content:space-between; align-items:flex-start; gap:18px; padding:24px; border:1px solid #dacbae; border-radius:24px; background:linear-gradient(145deg, #fffdf8, #f5efe5); box-shadow:0 14px 34px rgba(62,47,27,.08); }
.page-header h1 { margin:3px 0 7px; font-size:clamp(24px, 5vw, 32px); }
.page-header p { margin:0; color:var(--text-dim, #655b54); line-height:1.5; }
.eyebrow { color:var(--gold-strong, #8a5c22) !important; font-size:10px; font-weight:850; letter-spacing:.16em; }
.back-button { margin:0 0 12px; padding:0; border:0; background:transparent; color:var(--gold-strong, #8a5c22); font-weight:800; cursor:pointer; }
.refresh-button, .pagination button, .status-editor button { min-height:42px; border:1px solid #9a692a; border-radius:12px; padding:0 14px; background:#9a692a; color:#fff; font-weight:800; cursor:pointer; }
button:disabled { cursor:default; opacity:.55; }
.toolbar { display:flex; align-items:center; gap:10px; margin:18px 0; padding:14px 16px; border:1px solid var(--panel-border, #ddd2c9); border-radius:16px; background:var(--panel, #fff); }
.toolbar label { font-size:13px; font-weight:800; }
.toolbar span { margin-left:auto; color:var(--text-dim, #655b54); font-size:13px; }
select { min-height:40px; border:1px solid var(--panel-border, #ddd2c9); border-radius:10px; padding:0 34px 0 11px; background:var(--panel, #fff); color:var(--text, #2d241f); font:inherit; }
.error-message { margin:0 0 14px; padding:12px 14px; border:1px solid #efc9cb; border-radius:12px; background:#fff3f3; color:#8f2f36; }
.empty-state { padding:42px 20px; border:1px dashed var(--panel-border, #ddd2c9); border-radius:16px; text-align:center; color:var(--text-dim, #655b54); }
.report-list { display:grid; gap:14px; }
.report-card { padding:18px; border:1px solid var(--panel-border, #ddd2c9); border-radius:18px; background:var(--panel, #fff); box-shadow:0 8px 24px rgba(62,47,27,.06); }
.report-card__header { display:flex; justify-content:space-between; align-items:center; gap:10px; padding-bottom:13px; border-bottom:1px solid var(--panel-border, #e5ddd5); }
.report-card__header time { color:var(--text-dim, #655b54); font-size:12px; }
.badges { display:flex; gap:7px; flex-wrap:wrap; }
.status-badge, .context-badge { padding:5px 9px; border-radius:999px; background:#f2ece5; color:#655b54; font-size:11px; font-weight:850; }
.status-badge[data-status="pending"] { background:#fff0d8; color:#875510; }
.status-badge[data-status="resolved"] { background:#eaf7ee; color:#27613a; }
.status-badge[data-status="rejected"] { background:#f1f1f1; color:#555; }
.people-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:15px 0; }
.people-grid div { padding:12px; border-radius:12px; background:var(--panel-soft, #faf7f3); }
.people-grid dt { color:var(--text-dim, #655b54); font-size:11px; font-weight:700; }
.people-grid dd { margin:4px 0 0; font-size:14px; font-weight:850; overflow-wrap:anywhere; }
.report-content { display:grid; gap:9px; }
.report-content p { display:grid; grid-template-columns:76px 1fr; gap:10px; margin:0; color:var(--text-dim, #655b54); font-size:13px; line-height:1.55; white-space:pre-wrap; overflow-wrap:anywhere; }
.report-content strong { color:var(--text, #2d241f); }
.identifier { font-size:11px !important; }
.status-editor { display:flex; justify-content:space-between; align-items:end; gap:12px; margin-top:17px; padding-top:15px; border-top:1px solid var(--panel-border, #e5ddd5); }
.status-editor > label { font-size:12px; font-weight:800; }
.status-editor > div { display:flex; gap:8px; }
.status-editor button { min-height:40px; }
.pagination { display:flex; justify-content:center; align-items:center; gap:14px; margin-top:20px; }
.pagination span { min-width:72px; text-align:center; font-size:13px; font-weight:800; }
@media (max-width: 560px) {
  .reports-page { padding:14px 10px 28px; }
  .page-header { padding:18px; flex-direction:column; }
  .refresh-button { width:100%; }
  .toolbar { align-items:stretch; flex-wrap:wrap; }
  .toolbar label { width:100%; }
  .toolbar select { flex:1; }
  .people-grid { grid-template-columns:1fr; gap:7px; }
  .report-card { padding:15px; }
  .report-card__header { align-items:flex-start; flex-direction:column; }
  .status-editor { align-items:stretch; flex-direction:column; }
  .status-editor > div { display:grid; grid-template-columns:1fr 1fr; }
  .report-content p { grid-template-columns:64px 1fr; }
}
</style>
