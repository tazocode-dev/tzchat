<!-- src/legalpage/AgreementPage.vue -->
<template>
  <ion-page>
    <ion-header translucent>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :disabled="submitting" default-href="/home/6page" text="뒤로가기" />
        </ion-buttons>
        <ion-title>동의</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content fullscreen>
      <section class="container" :aria-busy="state.loading || submitting">
        <h1 class="title">서비스 이용을 위해<br />아래 항목에 동의해 주세요</h1>

        <div v-if="state.loading" class="muted">불러오는 중…</div>

        <form v-else @submit.prevent="submit">
          <!-- 모두 동의 카드 -->
          <div
            class="card card-all"
            @click="!submitting && (allCheckedModel = !allCheckedModel)"
            :aria-disabled="submitting"
          >
            <label class="all-check-control" for="agreement-all" @click.stop>
              <input id="agreement-all" class="chk" type="checkbox" v-model="allCheckedModel" :disabled="submitting" aria-label="모두 동의하기" />
            </label>
            <span class="all-label">모두 동의하기</span>
          </div>

          <!-- 리스트 카드 -->
          <ul class="card list" role="list" aria-live="polite">
            <li v-for="(item, index) in displayPending" :key="item.slug" class="item" role="listitem">
              <label class="check-control" :for="`agreement-${index}`">
                <input
                  :id="`agreement-${index}`"
                  class="chk"
                  type="checkbox"
                  v-model="selected"
                  :value="item.slug"
                  :disabled="submitting"
                  :aria-label="item.label"
                />
              </label>
              <div class="item-content">
                <div class="item-heading">
                  <span class="badge" :class="item.isRequired ? 'required' : 'optional'">
                    {{ item.isRequired ? '필수' : '선택' }}
                  </span>
                  <strong class="item-title">{{ item.label }}</strong>
                  <button
                    type="button"
                    class="view"
                    :disabled="submitting || !item.hasDocument"
                    :title="item.hasDocument ? `${item.label} 자세히 보기` : '연결된 공개 문서가 없습니다.'"
                    @click="openDoc(item)"
                  >
                    {{ item.hasDocument ? '자세히 보기' : '문서 준비 중' }}
                  </button>
                </div>
                <span class="item-summary">{{ item.summary }}</span>
                <span v-if="!item.hasDocument" class="document-note">연결된 공개 문서가 없습니다.</span>
              </div>
            </li>
          </ul>

          <ion-button type="submit" expand="block" :disabled="submitting || !canSubmit">
            {{ submitting ? '처리 중…' : '동의하고 계속' }}
          </ion-button>
        </form>
      </section>

      <!-- 오류 알럿 -->
      <ion-alert
        :is-open="alert.open"
        :header="alert.header"
        :message="alert.message"
        :buttons="alert.buttons"
        @didDismiss="alert.open = false"
      />
    </ion-content>
  </ion-page>
</template>

<script lang="ts">
let agreementSelectionDraft: { key: string; selected: string[]; savedAt: number } | null = null
</script>

<script setup lang="ts">
import { onMounted, reactive, computed, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { getAgreementStatus, acceptAgreements } from '@/shared/services/api'
import { useUserStore } from '@/shared/stores/user'
import { LEGAL_MAP } from '@/features/legal/constants/legals'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButton,
  IonButtons, IonBackButton, IonAlert
} from '@ionic/vue'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const returnTo = computed(() => String(route.query.return || '/home/6page'))

type PendingItem = { slug: string; title?: string; isRequired?: boolean }
type DisplayPendingItem = PendingItem & { label: string; summary: string; hasDocument: boolean }

const SELECTION_DRAFT_TTL_MS = 10 * 60 * 1_000

const state = reactive({ loading: true, pending: [] as PendingItem[] })
const selected = ref<string[]>([])
const submitting = ref(false)

function safeText(value: unknown, maxLength = 100) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function fallbackLabel(slug: string, title?: string) {
  const safeTitle = safeText(title)
  if (safeTitle) return safeTitle
  const safeSlug = safeText(slug)
    .replace(/[-_]+/g, ' ')
    .replace(/\b[a-z]/g, letter => letter.toUpperCase())
  return safeSlug || '동의 항목'
}

function displayLabel(item: PendingItem) {
  return LEGAL_MAP.get(item.slug)?.label || fallbackLabel(item.slug, item.title)
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizePending(items: unknown): PendingItem[] {
  if (!Array.isArray(items)) return []
  return items
    .filter(item => safeText(item?.slug))
    .map(item => ({ ...item, slug: safeText(item.slug, 120), title: safeText(item.title) }))
}

const displayPending = computed<DisplayPendingItem[]>(() => state.pending.map((item) => {
  const legal = LEGAL_MAP.get(item.slug)
  return {
    ...item,
    label: displayLabel(item),
    summary: legal?.summary || '서비스 제공을 위해 확인이 필요한 동의 항목입니다.',
    hasDocument: !!legal,
  }
}))

/** 알럿 상태 */
const alert = reactive<{
  open: boolean; header: string; message: string; buttons: any[]
}>({
  open: false,
  header: '',
  message: '',
  buttons: []
})

/** 모든 항목 체크 여부(파생) */
const allChecked = computed(() =>
  state.pending.length > 0 && selected.value.length === state.pending.length
)

/** '모두 동의' v-model */
const allCheckedModel = computed({
  get: () => allChecked.value,
  set: (val: boolean) => {
    selected.value = val ? state.pending.map(p => p.slug) : []
  }
})

/** 제출 가능: 필수 항목이 모두 포함되어야 함 */
const canSubmit = computed(() =>
  state.pending.every(p => !p.isRequired || selected.value.includes(p.slug))
)

function selectionKey(items: PendingItem[]) {
  const userId = safeText(userStore.user?._id, 120)
  if (!userId) return null
  return `${userId}|${returnTo.value}|${items.map(item => item.slug).sort().join('|')}`
}

function saveSelectionDraft() {
  const key = selectionKey(state.pending)
  if (!key) {
    agreementSelectionDraft = null
    return
  }
  agreementSelectionDraft = {
    key,
    selected: [...selected.value],
    savedAt: Date.now(),
  }
}

/** 공통 오류 표시(팝업) */
function showError(message: string, opts: { phase: 'load' | 'submit' }, pendingLeft?: PendingItem[]){
  const remain = (pendingLeft && pendingLeft.length)
    ? `<br/><br/><b>미완료 항목:</b><br/>- ${pendingLeft.map(i => escapeHtml(displayLabel(i))).join('<br/>- ')}`
    : ''
  alert.header = opts.phase === 'load' ? '동의 정보 불러오기 실패' : '동의 처리 필요'
  alert.message = message + remain
  alert.buttons = opts.phase === 'load'
    ? [
        { text: '돌아가기', role: 'cancel', handler: () => router.replace(returnTo.value) },
        { text: '재시도', role: 'confirm', handler: () => load() }
      ]
    : [
        { text: '확인', role: 'cancel' }
      ]
  alert.open = true
}

function normalizeAxiosError(e: any, fallback: string){
  const status = e?.response?.status
  if (status === 404) return '동의 항목을 찾을 수 없습니다. 잠시 후 다시 시도하세요.'
  if (status === 401 || status === 403) return '접근 권한이 없습니다. 다시 로그인 해주세요.'
  return e?.response?.data?.message || e?.message || fallback
}

async function load() {
  state.loading = true
  try {
    const raw: any = await getAgreementStatus()
    const pending: PendingItem[] =
      (raw?.data?.data?.pending) ??
      (raw?.data?.pending) ??
      (raw?.pending) ??
      []

    state.pending = normalizePending(pending)

    if (state.pending.length === 0) {
      router.replace(returnTo.value)
      return
    }

    const draft = agreementSelectionDraft
    const key = selectionKey(state.pending)
    const canRestore = !!key && !!draft &&
      draft.key === key &&
      Date.now() - draft.savedAt <= SELECTION_DRAFT_TTL_MS
    const available = new Set(state.pending.map(item => item.slug))
    selected.value = canRestore ? draft.selected.filter(slug => available.has(slug)) : []
  } catch (e: any) {
    showError(normalizeAxiosError(e, '동의 상태를 가져오지 못했습니다.'), { phase: 'load' })
  } finally {
    state.loading = false
  }
}

async function submit() {
  if (!canSubmit.value || submitting.value) return
  submitting.value = true
  try {
    // 1) 배치 동의 저장
    await acceptAgreements(selected.value)

    // 2) 저장 직후 상태 재조회 (경쟁상태/누락 방지)
    const raw: any = await getAgreementStatus({ force: true })
    const pendingNow: PendingItem[] =
      (raw?.data?.data?.pending) ??
      (raw?.data?.pending) ??
      (raw?.pending) ??
      []

    if (Array.isArray(pendingNow) && pendingNow.length > 0) {
      // 아직 남아있다면 전환하지 않고 사용자에게 안내
      state.pending = normalizePending(pendingNow)
      showError('일부 항목이 아직 동의되지 않았습니다. 필요한 항목을 모두 선택한 뒤 다시 시도하세요.', { phase: 'submit' }, pendingNow)
      return
    }

    // 3) 서버의 최신 사용자 상태까지 반영한 뒤 다음 완료 단계로 이동한다.
    await userStore.fetchMe({ force: true, silent: true })
    agreementSelectionDraft = null
    router.replace(returnTo.value)
  } catch (e: any) {
    showError(normalizeAxiosError(e, '동의 처리 중 오류가 발생했습니다.'), { phase: 'submit' })
  } finally {
    submitting.value = false
  }
}

function openDoc(item: DisplayPendingItem) {
  if (submitting.value || !item.hasDocument) return
  saveSelectionDraft()
  router.push({ name: 'LegalPageV2Public', params: { slug: item.slug }, query: { return: returnTo.value } })
}

onMounted(load)
</script>

<style scoped>
.container { width: min(100% - 32px, 680px); margin: 0 auto; padding: 28px 0 40px; color: #2b2521; }
.title { margin: 4px 0 24px; color: #211c19; font-size: clamp(26px, 6vw, 36px); line-height: 1.3; letter-spacing: -.035em; }
.muted { color: #6f655e; }

/* 카드 */
.card { background: #fff; border: 1px solid #d8d0c8; border-radius: 16px; padding: 12px; box-shadow: 0 8px 28px rgba(55, 43, 32, .06); }
.card + .card { margin-top: 12px; }
.card-all { display: grid; grid-template-columns: 40px minmax(0, 1fr); align-items: center; gap: 6px; padding: 13px 8px; color: #241f1b; cursor: pointer; }

/* 리스트 */
.list { list-style: none; padding: 0; margin: 0; }
.item { display: grid; grid-template-columns: 40px minmax(0, 1fr); align-items: start; gap: 6px; padding: 13px 8px; border-top: 1px solid #e3ddd7; }
.item:first-child { border-top: 0; }
.item-content { display: grid; gap: 5px; min-width: 0; }
.item-heading { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 6px; min-width: 0; }

.row { display: flex; align-items: flex-start; gap: 12px; min-width: 0; cursor: pointer; }
.check-control { width: 40px; min-height: 40px; margin-top: -5px; display: grid; place-items: center; cursor: pointer; }
.all-check-control { width: 40px; min-height: 40px; display: grid; place-items: center; cursor: pointer; }

/* 네이티브 체크박스 */
.chk {
  appearance: auto; -webkit-appearance: auto;
  accent-color: #765027;
  width: 20px; height: 20px;
  border-radius: 0;
  cursor: pointer;
  pointer-events: auto !important;
}
.chk:focus-visible { outline: 3px solid rgba(118, 80, 39, .28); outline-offset: 2px; }

.all-label { min-width: 0; color: #241f1b; font-size: 15px; line-height: 1.3; font-weight: 800; }
.badge { flex: 0 0 auto; padding: 3px 6px; border-radius: 999px; font-size: 10px; font-weight: 900; line-height: 1.25; white-space: nowrap; }
.badge.required { background: #7b3c31; color: #fff; }
.badge.optional { background: #e9e2da; color: #554a42; }
.item-title { min-width: 0; color: #211c19; font-size: 14px; line-height: 1.35; overflow-wrap: anywhere; word-break: keep-all; }
.item-summary { color: #665c55; font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; word-break: keep-all; }

/* 내용보기 버튼 */
.view { border: 1px solid #8a6033; background: #fffaf4; color: #65431f; padding: 6px 8px; border-radius: 9px; font-size: 11px; line-height: 1.2; font-weight: 800; white-space: nowrap; cursor: pointer; }
.view:disabled { border-color: #d6cec6; background: #f3f0ed; color: #8a817a; cursor: not-allowed; }
.view:active { transform: translateY(1px); }
.document-note { color: #7a5148; font-size: 11px; line-height: 1.4; }
ion-button { margin-top: 18px; --background: #765027; --color: #fff; --border-radius: 13px; min-height: 50px; font-weight: 800; }

@media (max-width: 520px) {
  .container { width: min(100% - 24px, 680px); padding-top: 22px; }
}
</style>
