<!-- /src/views/Admin/TermsAdmin.vue -->
<template>
  <div class="admin-terms">
    <header class="topbar">
      <h1>동의 메타데이터 관리</h1>
      <button class="back-btn" @click="goBack">← 뒤로가기</button>
    </header>

    <!-- 발행 폼 -->
    <section class="panel">
      <h2>새 동의 버전 발행</h2>
      <p class="muted">이 화면은 동의 버전과 필수·선택 상태를 관리합니다. 이용자에게 보이는 본문은 아래 공개 문서에서 제공합니다.</p>
      <form class="form" @submit.prevent="submit">
        <div class="grid">
          <!-- slug -->
          <label class="field">
            <span>문서 종류 (slug)</span>
            <select v-model="form.slug" required disabled>
              <option :value="form.slug">{{ form.slug }}</option>
            </select>
          </label>

          <!-- 제목 -->
          <label class="field">
            <span>제목</span>
            <input v-model.trim="form.title" type="text" disabled />
          </label>

          <!-- 버전 (자동 제안) -->
          <label class="field">
            <span>버전</span>
            <input v-model.trim="form.version" type="text" disabled />
          </label>

          <!-- kind 자동 판별 표시 -->
          <label class="field">
            <span>문서 유형 (자동)</span>
            <input type="text" :value="kindLabel" disabled />
          </label>

          <!-- 필수/선택 동의 (consent일 때만 노출) -->
          <div class="field radios" v-if="kind === 'consent'">
            <span>동의 유형</span>
            <div class="radio-row">
              <label class="radio">
                <input
                  type="radio"
                  name="requiredType"
                  value="required"
                  v-model="requiredType"
                />
                <strong>[필수]</strong> 필수 동의 문서
              </label>
              <label class="radio">
                <input
                  type="radio"
                  name="requiredType"
                  value="optional"
                  v-model="requiredType"
                />
                <strong>[선택]</strong> 선택 동의 문서
              </label>
            </div>
            <p class="muted">
              * 필수 선택은 <code>defaultRequired = true</code> 로 저장되며, 회원가입/재동의 체크에 반영됩니다.
            </p>
          </div>
        </div>

        <label class="field block"><span>공개 문서 URL</span><input type="text" :value="publicDocumentUrl || '지원하지 않는 문서입니다.'" disabled /></label>

        <!-- 액션 -->
        <div class="actions">
          <button class="primary" type="submit" :disabled="submitting">
            {{ submitting ? '발행 중...' : '새 버전 발행' }}
          </button>
          <button class="ghost" type="button" @click="resetForm" :disabled="submitting">
            초기화
          </button>
        </div>
      </form>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api, { getTermVersions } from '@/shared/services/api'
import { getLegalDocumentUrl } from '@/features/legal/constants/legals'

const router = useRouter()
const route = useRoute()

const parentPath = computed(() => {
  const p = (route.path || '/').replace(/\/+$/, '')
  const i = p.lastIndexOf('/')
  return i > 0 ? p.slice(0, i) : '/'
})

const goBack = () => {
  const canGoBack = typeof window !== 'undefined' && window.history.length > 1
  if (canGoBack) router.back()
  else router.replace(parentPath.value)
}

/** 오늘 날짜 YYYY-MM-DD */
function todayStr(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const form = reactive({
  slug: (route.params.slug as string) || '',
  title: (route.query.title as string) || '',
  version: `${todayStr()}-01`,     // 초기값(이후 자동 재계산)
})
const publicDocumentUrl = computed(() => getLegalDocumentUrl(form.slug))

/** kind: slug 기반 자동 판별 */
const kind = computed<'page' | 'consent'>(() => {
  const s = (form.slug || '').toLowerCase()
  return s.endsWith('-consent') ? 'consent' : 'page'
})
const kindLabel = computed(() => (kind.value === 'consent' ? 'consent (동의서)' : 'page (고지문서)'))

/** 필수/선택 라디오 바인딩 */
const requiredType = ref<'required' | 'optional'>('optional')

/** consent 기본값 추천 */
watch(
  () => form.slug,
  (s) => {
    if (kind.value !== 'consent') return
    if (/^(privacy|sharing|xborder)-consent$/i.test(s)) requiredType.value = 'required'
    else requiredType.value = 'optional'
  },
  { immediate: true }
)

const submitting = ref(false)

/** ⬇️ 같은 날짜의 마지막 접미 번호를 찾아 +1 하여 form.version 자동 제안 */
async function suggestNextVersion() {
  const base = todayStr()
  try {
    const res = await getTermVersions(form.slug)
    const rows = (res?.data?.data ?? res?.data ?? []) as any[]

    // 오늘 날짜로 시작하는 버전만 골라 접미 숫자 파싱
    let maxSuffix = 0
    for (const r of rows) {
      const v = String(r?.version || '')
      if (!v.startsWith(base)) continue
      // 허용 형태: YYYY-MM-DD, YYYY-MM-DD-01, -02 ...
      const m = v.match(/^(\d{4}-\d{2}-\d{2})(?:-(\d{2}))?$/)
      if (!m) continue
      const suf = m[2] ? parseInt(m[2], 10) : 1
      if (!Number.isNaN(suf) && suf > maxSuffix) maxSuffix = suf
    }

    const next = maxSuffix + 1
    form.version = `${base}-${String(next).padStart(2, '0')}`
  } catch (e) {
    // 실패 시 기본 -01 유지
    form.version = `${base}-01`
  }
}

function resetForm() {
  // consent 기본 라디오 초기화
  if (kind.value === 'consent') {
    if (/^(privacy|sharing|xborder)-consent$/i.test(form.slug)) requiredType.value = 'required'
    else requiredType.value = 'optional'
  }
  // 버전도 다시 제안
  suggestNextVersion()
}

async function submit() {
  if (!form.slug || !form.title || !form.version || !publicDocumentUrl.value) {
    alert('지원되는 문서 slug, 제목과 버전이 필요합니다.')
    return
  }

  // 제출 직전에 한 번 더 현재 기준으로 버전 제안 재확인(경합 방지용)
  await suggestNextVersion()

  const payload: any = {
    slug: form.slug,
    title: form.title,
    version: form.version,
    // 공개 본문은 GitHub Pages가 담당하고, 이 값은 기존 저장 스키마의 필수 필드만 충족한다.
    content: `PUBLIC_DOCUMENT:${publicDocumentUrl.value}`,
    kind: kind.value,
  }
  if (kind.value === 'consent') {
    payload.defaultRequired = requiredType.value === 'required'
  }

  submitting.value = true
  try {
    await api.post('/api/admin/terms', payload)
    alert(`새 버전을 발행했습니다. (버전: ${form.version})`)
    resetForm()
  } catch (e: any) {
    console.error('발행 실패:', e)
    const msg = e?.response?.data?.error || e?.message || '발행 중 오류가 발생했습니다.'
    alert(msg)
  } finally {
    submitting.value = false
  }
}

onMounted(suggestNextVersion)
watch(() => form.slug, () => suggestNextVersion())
</script>

<style scoped>
.admin-terms {
  padding: 16px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
}

/* ===== 헤더 ===== */
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.back-btn {
  border: 1px solid #111;
  background: #fff;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  color: #111;
  font-weight: 600;
}
.topbar h1 { font-size: 1.2rem; margin: 0; }

/* ===== 카드 ===== */
.panel {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,.06);
  padding: 16px;
  margin-bottom: 16px;
}
.panel h2 { margin: 0 0 12px; font-size: 1.05rem; }

/* ===== 폼 ===== */
.form .grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}
@media (min-width: 768px) {
  .form .grid { grid-template-columns: 1fr 1fr; }
}
@media (min-width: 1024px) {
  .form .grid { grid-template-columns: 220px 1fr 160px 200px; }
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field > span {
  font-size: .9rem;
  color: #555;
}
.field input[type="text"],
.field select,
.field textarea {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 10px;
  font-size: .95rem;
  background: #111;
  color: #fff;
}
.field select:disabled,
.field input:disabled {
  background: #222;
  color: #aaa;
}
.field textarea { width: 100%; resize: vertical; }
.field.block { margin-top: 12px; }

/* 라디오 그룹 */
.field.radios .radio-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
.field.radios .radio {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid #ddd;
  border-radius: 10px;
  padding: 8px 10px;
  background: #fafafa;
}
.field.radios input[type="radio"] {
  width: 18px;
  height: 18px;
}
.muted {
  margin: 4px 2px 0;
  color: #777;
  font-size: .85rem;
}

/* 버튼 */
.actions {
  margin-top: 12px;
  display: flex;
  gap: 8px;
}
button {
  border: 0;
  border-radius: 8px;
  padding: 10px 14px;
  cursor: pointer;
}
button.primary { background: #0a8f2f; color: #fff; }
button.ghost { background: #eee; color: #333; }
</style>
