<template>
  <div class="page">
    <header class="page-head">
      <h1>{{ title }}</h1>
      <div class="actions">
        <button v-if="isMaster && documentUrl" type="button" @click="goMetadata">동의 메타데이터 관리</button>
        <button type="button" @click="goBack">뒤로가기</button>
      </div>
    </header>

    <aside v-if="documentUrl" class="mobile-document-help" aria-label="모바일 문서 보기 안내">
      <span>표 안에서 좌우로 밀어 전체 내용을 확인할 수 있습니다.</span>
      <a :href="documentUrl" target="_self">전체 화면으로 보기</a>
    </aside>

    <main v-if="documentUrl" class="viewer" :aria-busy="frameLoading">
      <div v-if="frameLoading" class="state" role="status">문서를 불러오는 중…</div>
      <div v-if="frameError" class="state error" role="alert">
        <p>문서를 불러오지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.</p>
        <button type="button" @click="retry">다시 시도</button>
      </div>
      <iframe
        v-if="frameReady && !frameError"
        :key="frameKey"
        :src="documentUrl"
        :title="`${title} 문서`"
        referrerpolicy="strict-origin-when-cross-origin"
        @load="onFrameLoad"
        @error="onFrameError"
      ></iframe>
    </main>

    <main v-else class="state error" role="alert">
      <h2>문서를 찾을 수 없습니다</h2>
      <button type="button" @click="goBack">목록으로 돌아가기</button>
    </main>

    <section v-if="metadata && isConsent" class="consent" aria-label="동의 상태">
      <p v-if="metadata.version" class="meta">현재 동의 버전: {{ metadata.version }}</p>
      <button type="button" class="primary" :disabled="isAgreed || agreeing" @click="agree">
        {{ isAgreed ? '동의 완료' : (agreeing ? '처리 중…' : '이 문서에 동의합니다') }}
      </button>
      <button v-if="isOptional && isAgreed" type="button" :disabled="revoking" @click="revoke">
        {{ revoking ? '처리 중…' : '동의 취소' }}
      </button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api, { getActiveTermBySlug } from '@/shared/services/api'
import { getLabel, getLegalDocumentUrl, LEGAL_MAP } from '@/features/legal/constants/legals'

type Metadata = { slug:string; title?:string; version:string; kind?:'page'|'consent'; defaultRequired?:boolean; isRequired?:boolean }
const props = defineProps<{ slug?: string }>()
const route = useRoute()
const router = useRouter()
const slug = computed(() => {
  const value = String(props.slug || route.params.slug || '').trim()
  try { return decodeURIComponent(value) } catch { return value }
})
const documentUrl = computed(() => getLegalDocumentUrl(slug.value))
const title = computed(() => getLabel(slug.value))
const metadata = ref<Metadata | null>(null)
const isMaster = ref(false)
const frameKey = ref(0)
const frameLoading = ref(true)
const frameError = ref(false)
const frameReady = ref(false)
let frameTimer: ReturnType<typeof setTimeout> | null = null
let headController: AbortController | null = null
let frameRequestId = 0
const agreement = reactive({ sameVersion:false, optedIn:null as boolean|null })
const agreeing = ref(false)
const revoking = ref(false)
const isConsent = computed(() => metadata.value?.kind === 'consent' || !!metadata.value?.defaultRequired || !!metadata.value?.isRequired)
const isOptional = computed(() => metadata.value?.kind === 'consent' && !metadata.value?.defaultRequired && !metadata.value?.isRequired)
const isAgreed = computed(() => isConsent.value && agreement.sameVersion && agreement.optedIn === true)

function parseMe(raw:any) { return raw?.user ?? raw?.data?.user ?? raw?.data ?? raw }
async function loadMetadata() {
  metadata.value = null
  agreement.sameVersion = false
  agreement.optedIn = null
  if (!LEGAL_MAP.has(slug.value)) return
  try {
    const { data } = await getActiveTermBySlug(slug.value)
    metadata.value = (data?.data ?? data) || null
  } catch {}
  try {
    const { data } = await api.get('/api/me', { authRequestMode:'optional', expectedErrorStatuses:[401] } as any)
    isMaster.value = String(parseMe(data)?.role || '').toLowerCase() === 'master'
  } catch { isMaster.value = false }
  if (!metadata.value) return
  try {
    const { data } = await api.get('/api/terms/agreements/list')
    const item = (data?.data?.items ?? []).find((row:any) => row?.slug === slug.value)
    if (item) {
      agreement.sameVersion = !!item.sameVersion
      agreement.optedIn = typeof item.optedIn === 'boolean' ? item.optedIn : null
    }
  } catch {}
}
function clearFrameTimer() { if (frameTimer) clearTimeout(frameTimer); frameTimer = null }
function cancelHeadRequest() { headController?.abort(); headController = null }
async function prepareFrame() {
  const requestId = ++frameRequestId
  clearFrameTimer()
  cancelHeadRequest()
  frameLoading.value = !!documentUrl.value
  frameError.value = false
  frameReady.value = false
  frameKey.value += 1
  if (!documentUrl.value) return

  const controller = new AbortController()
  headController = controller
  frameTimer = setTimeout(() => {
    if (requestId !== frameRequestId) return
    controller.abort()
    if (headController === controller) headController = null
    frameLoading.value = false
    frameError.value = true
  }, 12_000)
  try {
    const response = await fetch(documentUrl.value, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    })
    if (requestId !== frameRequestId || controller.signal.aborted) return
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    clearFrameTimer()
    headController = null
    frameReady.value = true
    frameTimer = setTimeout(onFrameError, 12_000)
  } catch (error:any) {
    if (requestId !== frameRequestId || error?.name === 'AbortError') return
    headController = null
    onFrameError()
  }
}
function onFrameLoad() { clearFrameTimer(); frameLoading.value = false; frameError.value = false }
function onFrameError() { clearFrameTimer(); frameReady.value = false; frameLoading.value = false; frameError.value = true }
function retry() { void prepareFrame() }
function goBack() {
  if (typeof window !== 'undefined' && window.history.length > 1) router.back()
  else router.replace(route.path.startsWith('/home/') ? '/home/legals/v2' : '/legals/v2')
}
function goMetadata() { router.push({ path:`/admin/terms/${encodeURIComponent(slug.value)}`, query:{ title:title.value } }) }
async function agree() {
  if (!metadata.value?.version || agreeing.value) return
  agreeing.value = true
  try {
    await api.post('/api/terms/consents', { slug:slug.value, version:metadata.value.version, optedIn:true })
    agreement.sameVersion = true; agreement.optedIn = true
  } catch { alert('동의를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.') }
  finally { agreeing.value = false }
}
async function revoke() {
  if (!metadata.value?.version || revoking.value) return
  revoking.value = true
  try {
    await api.post('/api/terms/consents', { slug:slug.value, version:metadata.value.version, optedIn:false })
    agreement.sameVersion = true; agreement.optedIn = false
  } catch { alert('동의 취소를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.') }
  finally { revoking.value = false }
}
async function load() { void prepareFrame(); await loadMetadata() }
watch(slug, load)
onMounted(load)
onUnmounted(() => { frameRequestId += 1; cancelHeadRequest(); clearFrameTimer() })
</script>

<style scoped>
.page{min-height:100vh;padding:14px;background:var(--bg,#f7f5f2);color:var(--text,#2d241f)}.page-head{width:min(100%,920px);margin:0 auto 12px;display:flex;align-items:center;justify-content:space-between;gap:12px}.page-head h1{margin:0;font-size:clamp(1.2rem,4vw,1.7rem)}.actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}button{border:1px solid var(--border,#d9d2cb);border-radius:10px;background:var(--surface,#fff);color:var(--text,#2d241f);padding:8px 11px;font-weight:700;cursor:pointer}.mobile-document-help{display:none}.viewer{position:relative;width:min(100%,920px);height:calc(100vh - 92px);min-height:520px;margin:0 auto;background:#fff;border:1px solid var(--border,#d9d2cb);border-radius:14px;overflow:hidden}.viewer iframe{display:block;width:100%;height:100%;border:0;background:#fff}.state{width:min(100%,920px);margin:0 auto;padding:18px;text-align:center;color:var(--text-muted,#655b54)}.viewer>.state{position:absolute;inset:0;z-index:1;display:grid;place-content:center;background:#fff}.state.error{color:#752f2f}.consent{width:min(100%,920px);margin:12px auto 0;padding:12px;border:1px solid var(--border,#d9d2cb);border-radius:12px;background:var(--surface,#fff)}.consent button+button{margin-left:8px}.consent .primary{background:var(--primary,#765027);color:#fff}.meta{margin:0 0 8px;color:var(--text-muted,#655b54);font-size:.9rem}@media(max-width:560px){.page{padding:10px}.page-head{align-items:flex-start}.mobile-document-help{width:100%;margin:0 auto 10px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--border,#d9d2cb);border-radius:10px;background:var(--surface,#fff);color:var(--text-muted,#655b54);font-size:.78rem;line-height:1.4}.mobile-document-help a{flex:0 0 auto;color:var(--primary,#765027);font-weight:800;text-underline-offset:2px}.viewer{height:calc(100vh - 142px);min-height:400px;border-radius:10px}.actions button{font-size:.78rem;padding:7px}}
</style>
