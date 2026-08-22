<template>
  <main class="admin-subpage">
    <header class="page-header">
      <button class="text-button" type="button" @click="goBack">← 뒤로가기</button>
      <p class="page-kicker">MEMBER MIGRATION</p>
      <h1>베타회원 전환</h1>
      <p>베타회원 등급을 일반회원으로 일괄 전환합니다.</p>
    </header>

    <section class="migration-card" aria-labelledby="migration-title">
      <div class="card-heading">
        <div>
          <h2 id="migration-title">전환 작업</h2>
          <p>실행 전 미리보기로 대상 인원을 확인해 주세요.</p>
        </div>
        <span class="level-flow">베타회원 <b>→</b> 일반회원</span>
      </div>

      <div class="action-grid">
        <button class="action-button action-button--preview" type="button" :disabled="loading" @click="preview">
          <ion-icon :icon="icons.eyeOutline" aria-hidden="true" />
          <span>
            <strong>대상 미리보기</strong>
            <small>데이터를 변경하지 않습니다.</small>
          </span>
        </button>

        <div class="execute-panel">
          <div class="dryrun-toggle">
            <span>
              <strong>드라이런</strong>
              <small>켜짐 상태에서는 실제 변경 없이 결과만 확인합니다.</small>
            </span>
            <ion-toggle v-model="dryRun" aria-label="드라이런 사용" />
          </div>

          <button class="action-button action-button--danger" type="button" :disabled="loading" @click="execute">
            <ion-icon :icon="icons.playOutline" aria-hidden="true" />
            {{ dryRun ? '드라이런 실행' : '실제 전환 실행' }}
          </button>
        </div>
      </div>

      <p v-if="!dryRun" class="danger-notice" role="alert">
        실제 전환 모드입니다. 데이터베이스 백업과 미리보기 대상 수를 다시 확인해 주세요.
      </p>
    </section>

    <div v-if="loading" class="center status-space">
      <ion-spinner name="crescent" />
    </div>

    <div v-if="error" class="error status-space" role="alert">{{ error }}</div>

    <ion-card v-if="previewData" class="result-card">
      <ion-card-header>
        <ion-card-title>미리보기 결과</ion-card-title>
        <ion-card-subtitle>{{ previewData.ts }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        <ul class="kv">
          <li><span>from</span><b>{{ previewData.targetLevelFrom }}</b></li>
          <li><span>to</span><b>{{ previewData.targetLevelTo }}</b></li>
          <li><span>대상 수</span><b>{{ number(previewData.total) }} 명</b></li>
          <li><span>모드</span><b>dry-run</b></li>
        </ul>
      </ion-card-content>
    </ion-card>

    <ion-card v-if="result" class="result-card">
      <ion-card-header>
        <ion-card-title>실행 결과</ion-card-title>
        <ion-card-subtitle>{{ result.ts }}</ion-card-subtitle>
      </ion-card-header>
      <ion-card-content>
        <ul class="kv">
          <li><span>from</span><b>{{ result.targetLevelFrom }}</b></li>
          <li><span>to</span><b>{{ result.targetLevelTo }}</b></li>
          <li><span>대상 수</span><b>{{ number(result.total) }} 명</b></li>
          <li><span>적용</span><b>{{ number(result.modified ?? 0) }} 명</b></li>
          <li><span>모드</span><b>{{ result.dryRun ? 'dry-run' : '실행' }}</b></li>
          <li v-if="result.note"><span>비고</span><b>{{ result.note }}</b></li>
        </ul>
      </ion-card-content>
    </ion-card>
  </main>
</template>

<script setup lang="ts">
import {
  IonIcon,
  IonSpinner,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonCardContent,
  IonToggle,
  alertController,
} from '@ionic/vue'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/shared/services/api'
import {
  BETA_MIGRATION_CONFIRMATION,
  runBetaMigration,
} from '@/features/admin/services/betaMigrationExecution'
import { eyeOutline, playOutline } from 'ionicons/icons'

const icons = { eyeOutline, playOutline }
const router = useRouter()

type PreviewRes = {
  ok: boolean
  ts: string
  targetLevelFrom: string
  targetLevelTo: string
  total: number
  dryRun: true
}
type ExecRes = {
  ok: boolean
  ts: string
  targetLevelFrom: string
  targetLevelTo: string
  total: number
  matched: number
  modified: number
  dryRun: boolean
  note?: string
}

const loading = ref(false)
const error = ref('')
const dryRun = ref(true)
const previewData = ref<PreviewRes | null>(null)
const result = ref<ExecRes | null>(null)

function goBack() {
  if (window.history.state?.back) router.back()
  else router.replace('/home/admin')
}

function number(n?: number) {
  if (typeof n !== 'number') return '0'
  return n.toLocaleString('ko-KR')
}

async function preview() {
  loading.value = true
  error.value = ''
  result.value = null
  try {
    const { data } = await api.get<PreviewRes>('/api/admin/migration/beta-to-basic/preview', {
      withCredentials: true,
    })
    if (!data?.ok) throw new Error('미리보기 실패')
    previewData.value = data
  } catch (e: any) {
    error.value = e?.response?.data?.message || e?.response?.data?.error || e?.message || 'PREVIEW_ERROR'
  } finally {
    loading.value = false
  }
}

async function requestExecutionConfirmation(): Promise<string | null> {
  const alert = await alertController.create({
    header: '실제 전환 확인',
    message: `실제 DB 변경을 실행하려면 ${BETA_MIGRATION_CONFIRMATION}을 직접 입력해 주세요.`,
    inputs: [
      {
        name: 'confirmation',
        type: 'text',
        placeholder: BETA_MIGRATION_CONFIRMATION,
        attributes: { autocomplete: 'off', autocapitalize: 'characters' },
      },
    ],
    buttons: [
      { text: '취소', role: 'cancel' },
      { text: '실행', role: 'confirm' },
    ],
  })
  await alert.present()
  const { role, data } = await alert.onDidDismiss()
  if (role !== 'confirm') return null
  return String(data?.values?.confirmation || '')
}

async function execute() {
  error.value = ''
  try {
    const execution = await runBetaMigration({
      dryRun: dryRun.value,
      requestConfirmation: requestExecutionConfirmation,
      post: async (payload) => {
        loading.value = true
        const { data } = await api.post<ExecRes>(
          '/api/admin/migration/beta-to-basic',
          payload,
          { withCredentials: true }
        )
        return data
      },
    })
    if (!execution.executed) {
      if (execution.reason === 'mismatch') {
        error.value = `${BETA_MIGRATION_CONFIRMATION} 확인 문구가 일치하지 않습니다.`
      }
      return
    }

    const data = execution.response as ExecRes
    if (!data?.ok) throw new Error('실행 실패')
    result.value = data
  } catch (e: any) {
    error.value = e?.response?.data?.message || e?.response?.data?.error || e?.message || 'EXEC_ERROR'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.admin-subpage {
  width: min(100%, 820px);
  margin: 0 auto;
  padding: 20px 16px 34px;
  color: var(--text);
}
.page-header { margin-bottom: 18px; }
.text-button {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--gold-strong);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}
.page-kicker {
  margin: 18px 0 5px;
  color: var(--gold-strong) !important;
  font-size: 10px !important;
  font-weight: 850;
  letter-spacing: .14em;
}
.page-header h1 { margin: 0; font-size: 25px; letter-spacing: -.035em; }
.page-header > p:last-child { margin: 5px 0 0; color: var(--text-dim); font-size: 12px; }
.migration-card {
  padding: 18px;
  border: 1px solid var(--panel-border);
  border-radius: 20px;
  background: var(--panel-2);
  box-shadow: 0 6px 20px rgba(51, 43, 34, .05);
}
.card-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.card-heading h2 { margin: 0; font-size: 18px; }
.card-heading p { margin: 5px 0 0; color: var(--text-dim); font-size: 11px; line-height: 1.5; }
.level-flow {
  flex: 0 0 auto;
  padding: 7px 10px;
  border-radius: 999px;
  background: var(--gold-soft);
  color: var(--gold-strong);
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}
.level-flow b { padding: 0 3px; }
.action-grid {
  display: grid;
  grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr);
  gap: 12px;
}
.action-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
  min-height: 48px;
  padding: 11px 14px;
  border: 1px solid #d7c5a4;
  border-radius: 13px;
  background: var(--gold-soft);
  color: var(--gold-strong);
  font: inherit;
  font-size: 12px;
  font-weight: 850;
  text-align: left;
  cursor: pointer;
}
.action-button ion-icon { flex: 0 0 auto; font-size: 19px; }
.action-button span { min-width: 0; }
.action-button strong,
.action-button small { display: block; }
.action-button small { margin-top: 3px; color: var(--text-dim); font-size: 10px; font-weight: 500; line-height: 1.35; }
.action-button:disabled { cursor: wait; opacity: .55; }
.execute-panel {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--panel-border);
  border-radius: 15px;
  background: var(--panel-soft);
}
.dryrun-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-width: 0;
  margin-bottom: 10px;
}
.dryrun-toggle > span { min-width: 0; }
.dryrun-toggle strong,
.dryrun-toggle small { display: block; }
.dryrun-toggle strong { font-size: 12px; }
.dryrun-toggle small { margin-top: 3px; color: var(--text-dim); font-size: 10px; line-height: 1.4; }
.dryrun-toggle ion-toggle { flex: 0 0 auto; }
.action-button--danger { border-color: #d8a59b; background: #fff0ed; color: #a33d2d; text-align: center; }
.danger-notice {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: 11px;
  background: #fff0ed;
  color: #943b2c;
  font-size: 11px;
  line-height: 1.5;
}
.center {
  text-align: center;
}
.error {
  padding: 11px 13px;
  border-radius: 12px;
  background: #fff0ed;
  color: var(--ion-color-danger);
  font-size: 12px;
}
.status-space,
.result-card { margin-top: 16px; }
.result-card { margin-inline: 0; border: 1px solid var(--panel-border); box-shadow: none; }
.kv {
  list-style: none;
  padding: 0;
  margin: 0;
}
.kv li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px dashed color-mix(in oklab, var(--ion-color-medium) 30%, transparent);
}
.kv li:last-child {
  border-bottom: 0;
}
.kv span {
  color: var(--ion-color-medium);
}

@media (max-width: 620px) {
  .admin-subpage { padding: 14px 12px 28px; }
  .migration-card { padding: 15px; }
  .card-heading { display: block; }
  .level-flow { display: inline-block; margin-top: 10px; }
  .action-grid { grid-template-columns: 1fr; }
}
</style>
