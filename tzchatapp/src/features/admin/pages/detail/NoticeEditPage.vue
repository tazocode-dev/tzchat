<template>
  <main class="notice-editor">
    <header class="page-header">
      <div>
        <button class="text-button" type="button" @click="goList">← 공지 목록</button>
        <h1>{{ isEdit ? '공지 수정' : '새 공지 작성' }}</h1>
        <p>서비스에 표시할 제목과 내용을 입력해 주세요.</p>
      </div>
      <span class="state-badge" :class="{ 'state-badge--draft': !form.isPublished }">
        {{ form.isPublished ? '공개 예정' : '비공개' }}
      </span>
    </header>

    <div v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</div>

    <form class="editor-card" @submit.prevent="save">
      <label class="field">
        <span>제목</span>
        <input v-model="form.title" type="text" maxlength="120" placeholder="공지 제목" required />
      </label>

      <label class="field">
        <span>분류</span>
        <input v-model="form.category" type="text" maxlength="40" placeholder="예: 서비스 안내" />
      </label>

      <label class="field">
        <span>본문</span>
        <textarea v-model="form.content" rows="14" maxlength="50000" placeholder="공지 내용을 입력하세요." required />
      </label>

      <div class="option-grid">
        <label class="field">
          <span>게시 일시</span>
          <input v-model="form.publishedAt" type="datetime-local" />
        </label>

        <label class="publish-toggle">
          <span>
            <strong>공개 상태</strong>
            <small>끄면 관리자 목록에서만 확인할 수 있습니다.</small>
          </span>
          <input v-model="form.isPublished" type="checkbox" role="switch" />
        </label>
      </div>

      <div class="form-actions">
        <button class="cancel-button" type="button" @click="goList">취소</button>
        <button class="save-button" type="submit" :disabled="saving || !canSave">
          {{ saving ? '저장 중' : isEdit ? '수정 저장' : '공지 등록' }}
        </button>
      </div>
    </form>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/shared/services/api'

const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id || ''))
const isEdit = computed(() => !!id.value)
const saving = ref(false)
const errorMessage = ref('')
const form = ref({
  title: '',
  category: '',
  content: '',
  isPublished: true,
  publishedAt: '',
})

const canSave = computed(() => !!form.value.title.trim() && !!form.value.content.trim())

function toLocalDateTime(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

async function load() {
  if (!isEdit.value) return
  errorMessage.value = ''
  try {
    const { data } = await api.get(`/api/notices/manage/${id.value}`)
    const notice = data?.notice
    form.value = {
      title: notice?.title || '',
      category: notice?.category || '',
      content: notice?.content || '',
      isPublished: notice?.isPublished ?? true,
      publishedAt: toLocalDateTime(notice?.publishedAt),
    }
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || '공지를 불러오지 못했습니다.'
  }
}

async function save() {
  if (saving.value || !canSave.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    const payload = {
      title: form.value.title.trim(),
      category: form.value.category.trim(),
      content: form.value.content,
      isPublished: form.value.isPublished,
      ...(form.value.publishedAt
        ? { publishedAt: new Date(form.value.publishedAt).toISOString() }
        : {}),
    }

    if (isEdit.value) await api.put(`/api/notices/${id.value}`, payload)
    else await api.post('/api/notices', payload)
    router.push('/home/admin/notices')
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.error || '공지를 저장하지 못했습니다.'
  } finally {
    saving.value = false
  }
}

function goList() {
  router.push('/home/admin/notices')
}

onMounted(load)
</script>

<style scoped>
.notice-editor {
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
.state-badge {
  padding: 7px 10px;
  border-radius: 999px;
  background: #eaf7ef;
  color: #247a49;
  font-size: 10px;
  font-weight: 850;
}
.state-badge--draft { background: #efefef; color: #666; }
.error-message {
  margin-bottom: 12px;
  padding: 11px 13px;
  border-radius: 12px;
  background: #fff0ed;
  color: #9a3f30;
  font-size: 12px;
}
.editor-card {
  display: grid;
  gap: 17px;
  padding: 20px;
  border: 1px solid var(--panel-border);
  border-radius: 20px;
  background: var(--panel-2);
}
.field { display: grid; gap: 7px; }
.field > span,
.publish-toggle strong { color: var(--text); font-size: 12px; font-weight: 800; }
.field input,
.field textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  outline: 0;
  background: var(--panel-soft);
  color: var(--text);
  font: inherit;
  font-size: 13px;
}
.field input { height: 43px; padding: 0 12px; }
.field textarea { min-height: 220px; padding: 12px; resize: vertical; line-height: 1.55; }
.field input:focus,
.field textarea:focus { border-color: #cbaa70; box-shadow: var(--focus-ring); }
.option-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.publish-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  background: var(--panel-soft);
}
.publish-toggle span { display: grid; gap: 3px; }
.publish-toggle small { color: var(--text-dim); font-size: 9px; }
.publish-toggle input { width: 19px; height: 19px; accent-color: var(--gold-strong); }
.form-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 3px; }
.form-actions button {
  min-height: 40px;
  padding: 0 16px;
  border-radius: 11px;
  font-size: 12px;
  font-weight: 850;
  cursor: pointer;
}
.cancel-button { border: 1px solid var(--panel-border); background: var(--panel-soft); color: var(--text-dim); }
.save-button { border: 1px solid #c9aa71; background: var(--gold-soft); color: var(--gold-strong); }
.save-button:disabled { cursor: default; opacity: .45; }

@media (max-width: 600px) {
  .notice-editor { padding: 14px 12px 28px; }
  .page-header { align-items: flex-start; }
  .editor-card { padding: 16px; }
  .option-grid { grid-template-columns: 1fr; }
  .form-actions button { flex: 1; }
}
</style>
