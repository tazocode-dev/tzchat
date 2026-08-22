<template>
  <main class="admin-subpage">
    <header class="page-header">
      <div>
        <button class="text-button" type="button" @click="goBack">← 뒤로가기</button>
        <h1>공지 관리</h1>
        <p>공개 공지와 작성 중인 공지를 함께 관리합니다.</p>
      </div>
      <button class="primary-button" type="button" @click="goWrite">
        <IonIcon :icon="addOutline" aria-hidden="true" />
        새 공지
      </button>
    </header>

    <div v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</div>

    <section class="notice-card" aria-live="polite">
      <div v-if="loading" class="empty-state">공지 목록을 불러오고 있습니다.</div>
      <div v-else-if="!notices.length" class="empty-state">
        <strong>등록된 공지가 없습니다.</strong>
        <span>첫 공지를 작성해 서비스 소식을 알려보세요.</span>
      </div>
      <ul v-else class="notice-list">
        <li v-for="notice in notices" :key="notice._id">
          <div class="notice-main">
            <div class="notice-title-row">
              <span class="publish-badge" :class="{ 'publish-badge--draft': !notice.isPublished }">
                {{ notice.isPublished ? '공개' : '비공개' }}
              </span>
              <strong>{{ notice.title }}</strong>
            </div>
            <p>{{ notice.category || '일반 공지' }} · {{ formatDate(notice.publishedAt || notice.createdAt) }}</p>
          </div>
          <div class="notice-actions">
            <button type="button" @click="togglePublished(notice)">
              {{ notice.isPublished ? '비공개' : '공개' }}
            </button>
            <button type="button" @click="goEdit(notice._id)">수정</button>
            <button class="danger-button" type="button" @click="removeNotice(notice)">삭제</button>
          </div>
        </li>
      </ul>
    </section>

    <button class="refresh-button" type="button" :disabled="loading" @click="loadNotices">
      <IonIcon :icon="refreshOutline" aria-hidden="true" />
      새로고침
    </button>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { IonIcon } from '@ionic/vue'
import { addOutline, refreshOutline } from 'ionicons/icons'
import api from '@/shared/services/api'

type NoticeItem = {
  _id: string
  title: string
  category?: string
  isPublished: boolean
  publishedAt?: string
  createdAt?: string
}

const router = useRouter()
const notices = ref<NoticeItem[]>([])
const loading = ref(false)
const errorMessage = ref('')

function goBack() {
  if (window.history.state?.back) router.back()
  else router.replace('/home/admin')
}

function goWrite() {
  router.push('/home/admin/notices/write')
}

function goEdit(id: string) {
  router.push(`/home/admin/notices/edit/${id}`)
}

function formatDate(value?: string) {
  if (!value) return '게시일 없음'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '게시일 없음'
  return date.toLocaleDateString('ko-KR')
}

async function loadNotices() {
  if (loading.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    const { data } = await api.get('/api/notices/manage', { params: { limit: 100 } })
    notices.value = Array.isArray(data?.items) ? data.items : []
  } catch (error: any) {
    notices.value = []
    errorMessage.value = error?.response?.data?.error || '공지 목록을 불러오지 못했습니다.'
  } finally {
    loading.value = false
  }
}

async function togglePublished(notice: NoticeItem) {
  errorMessage.value = ''
  try {
    await api.put(`/api/notices/${notice._id}`, { isPublished: !notice.isPublished })
    notice.isPublished = !notice.isPublished
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || '공개 상태를 변경하지 못했습니다.'
  }
}

async function removeNotice(notice: NoticeItem) {
  if (!window.confirm(`“${notice.title}” 공지를 삭제하시겠습니까?`)) return
  errorMessage.value = ''
  try {
    await api.delete(`/api/notices/${notice._id}`)
    notices.value = notices.value.filter((item) => item._id !== notice._id)
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || '공지를 삭제하지 못했습니다.'
  }
}

onMounted(loadNotices)
</script>

<style scoped>
.admin-subpage {
  width: min(100%, 820px);
  margin: 0 auto;
  padding: 20px 16px 34px;
  color: var(--text);
}
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}
.text-button {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--gold-strong);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}
.page-header h1 { margin: 8px 0 4px; font-size: 25px; letter-spacing: -.035em; }
.page-header p { margin: 0; color: var(--text-dim); font-size: 12px; }
.primary-button,
.refresh-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 39px;
  padding: 0 13px;
  border: 1px solid #d4bd94;
  border-radius: 11px;
  background: var(--gold-soft);
  color: var(--gold-strong);
  font-size: 12px;
  font-weight: 850;
  cursor: pointer;
}
.error-message {
  margin-bottom: 12px;
  padding: 11px 13px;
  border-radius: 12px;
  background: #fff0ed;
  color: #9a3f30;
  font-size: 12px;
}
.notice-card {
  overflow: hidden;
  border: 1px solid var(--panel-border);
  border-radius: 18px;
  background: var(--panel-2);
}
.notice-list { margin: 0; padding: 0; list-style: none; }
.notice-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 15px 16px;
  border-bottom: 1px solid var(--panel-border);
}
.notice-list li:last-child { border-bottom: 0; }
.notice-main { min-width: 0; }
.notice-title-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.notice-title-row strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.publish-badge {
  flex: 0 0 auto;
  padding: 4px 6px;
  border-radius: 7px;
  background: #eaf7ef;
  color: #247a49;
  font-size: 9px;
  font-weight: 850;
}
.publish-badge--draft { background: #efefef; color: #696969; }
.notice-main p { margin: 5px 0 0; color: var(--text-dim); font-size: 10px; }
.notice-actions { display: flex; gap: 5px; flex: 0 0 auto; }
.notice-actions button {
  min-height: 32px;
  padding: 0 9px;
  border: 1px solid var(--panel-border);
  border-radius: 9px;
  background: var(--panel-soft);
  color: var(--text-dim);
  font-size: 10px;
  font-weight: 750;
  cursor: pointer;
}
.notice-actions .danger-button { border-color: #ead8d3; color: #a34838; }
.empty-state { display: grid; gap: 5px; padding: 38px 16px; color: var(--text-dim); font-size: 12px; text-align: center; }
.empty-state strong { color: var(--text); font-size: 14px; }
.refresh-button { margin-top: 14px; background: var(--panel-2); }
.refresh-button:disabled { opacity: .5; }

@media (max-width: 620px) {
  .admin-subpage { padding: 14px 12px 28px; }
  .page-header { align-items: flex-start; }
  .notice-list li { align-items: flex-start; flex-direction: column; }
  .notice-actions { width: 100%; }
  .notice-actions button { flex: 1; }
}
</style>
