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
        <h2 class="title">서비스 이용을 위해 </h2>
        <h2 class="title">아래 항목에 동의해 주세요</h2>

        <div v-if="state.loading" class="muted">불러오는 중…</div>

        <form v-else @submit.prevent="submit">
          <!-- 모두 동의 카드 -->
          <div
            class="card card-all"
            @click="!submitting && (allCheckedModel = !allCheckedModel)"
            :aria-disabled="submitting"
          >
            <label class="row" @click.stop>
              <input class="chk" type="checkbox" v-model="allCheckedModel" :disabled="submitting" aria-label="모두 동의하기" />
              <span class="row-text">모두 동의하기</span>
            </label>
          </div>

          <!-- 리스트 카드 -->
          <ul class="card list" role="list" aria-live="polite">
            <li v-for="item in state.pending" :key="item.slug" class="item" role="listitem">
              <label class="row">
                <input
                  class="chk"
                  type="checkbox"
                  v-model="selected"
                  :value="item.slug"
                  :disabled="submitting"
                  :aria-label="labelOf(item.slug, item.title)"
                />
                <span class="row-text">
                  <strong class="req">{{ item.isRequired ? '필수' : '선택' }}</strong>
                  {{ labelOf(item.slug, item.title) }}
                </span>
              </label>
              <button type="button" class="view" :disabled="submitting" @click="openDoc(item.slug)">내용보기</button>
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

<script setup lang="ts">
import { onMounted, reactive, computed, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { getAgreementStatus, acceptAgreements } from '@/shared/services/api'
import { useUserStore } from '@/shared/stores/user'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent, IonButton,
  IonButtons, IonBackButton, IonAlert
} from '@ionic/vue'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const returnTo = computed(() => String(route.query.return || '/home/6page'))

type PendingItem = { slug: string; title?: string; isRequired?: boolean }

const state = reactive({ loading: true, pending: [] as PendingItem[] })
const selected = ref<string[]>([])
const submitting = ref(false)

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

function labelOf(slug: string, title?: string) {
  if (title) return title
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, s => s.toUpperCase())
}

/** 공통 오류 표시(팝업) */
function showError(message: string, opts: { phase: 'load' | 'submit' }, pendingLeft?: PendingItem[]){
  const remain = (pendingLeft && pendingLeft.length)
    ? `<br/><br/><b>미완료 항목:</b><br/>- ${pendingLeft.map(i => (i.title || i.slug)).join('<br/>- ')}`
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

    state.pending = Array.isArray(pending) ? pending : []

    if (state.pending.length === 0) {
      router.replace(returnTo.value)
      return
    }

    // ✅ 초기값: 아무 것도 체크하지 않음 (필수 포함)
    selected.value = []
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
      state.pending = pendingNow
      showError('일부 항목이 아직 동의되지 않았습니다. 필요한 항목을 모두 선택한 뒤 다시 시도하세요.', { phase: 'submit' }, pendingNow)
      return
    }

    // 3) 서버의 최신 사용자 상태까지 반영한 뒤 다음 완료 단계로 이동한다.
    await userStore.fetchMe({ force: true, silent: true })
    router.replace(returnTo.value)
  } catch (e: any) {
    showError(normalizeAxiosError(e, '동의 처리 중 오류가 발생했습니다.'), { phase: 'submit' })
  } finally {
    submitting.value = false
  }
}

function openDoc(slug: string) {
  if (submitting.value) return
  router.push({ name: 'LegalPageV2Public', params: { slug }, query: { return: returnTo.value } })
}

onMounted(load)
</script>

<style scoped>
:root {
  --surface: rgba(255,255,255,0.04);
  --border: rgba(255,255,255,0.12);
  --text-muted: rgba(255,255,255,0.6);
  --focus: 0 0 0 3px rgba(255, 214, 10, .35);
}

.container { padding: 16px; }
.title { margin: 6px 0 14px; line-height: 1.35; }
.muted { color: var(--text-muted); }

/* 카드 */
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 12px; }
.card + .card { margin-top: 12px; }
.card-all { padding: 14px; }

/* 리스트 */
.list { list-style: none; padding: 0; margin: 0; }
.item { display: flex; align-items: center; gap: 10px; padding: 10px 6px 10px 4px; border-top: 1px solid var(--border); }
.item:first-child { border-top: 0; }

.row { display: inline-flex; align-items: center; gap: 12px; flex: 1 1 auto; min-width: 0; }

/* 네이티브 체크박스 */
.chk {
  appearance: auto; -webkit-appearance: auto;
  accent-color: #ffd60a;
  width: 18px; height: 18px;
  transform: scale(1.4); transform-origin: left center;
  border-radius: 0;
  cursor: pointer;
  pointer-events: auto !important;
}
.chk:focus-visible { box-shadow: var(--focus); }

/* 텍스트 */
.row-text { font-size: 16px; line-height: 1.3; font-weight: 700; word-break: keep-all; }
.req { margin-right: 6px; font-weight: 800; font-size: 14px; opacity: .9; }

/* 내용보기 버튼 */
.view { border: 1px solid var(--border); background: transparent; padding: 6px 10px; border-radius: 10px; font-size: 12px; flex: 0 0 auto; }
.view:active { transform: translateY(1px); }
</style>
