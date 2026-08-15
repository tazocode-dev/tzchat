<template>
  <ion-page class="auth-info-page">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button aria-label="뒤로가기" @click="goBack">
            <ion-icon :icon="arrowBackOutline" />
          </ion-button>
        </ion-buttons>
        <ion-title>인증정보</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <main class="auth-wrap">
        <div class="mode-tabs" role="tablist" aria-label="인증정보 종류">
          <button :class="{ active: mode === 'email' }" type="button" @click="setMode('email')">이메일</button>
          <button :class="{ active: mode === 'phone' }" type="button" @click="setMode('phone')">전화번호</button>
        </div>

        <section v-if="mode === 'email'" class="auth-card">
          <p class="eyebrow">EMAIL</p>
          <h1>{{ emailVerified ? '이메일 수정' : '이메일 인증' }}</h1>
          <p class="description">
            {{ emailVerified
              ? '로그인 이메일을 안전하게 바꾸기 위해 현재 이메일과 새 이메일을 모두 인증합니다.'
              : '이메일 인증을 완료하면 전화번호 변경 등 계정 보호 기능을 사용할 수 있습니다.' }}
          </p>

          <div class="current-info">
            <span>현재 이메일</span>
            <strong>{{ me?.email || '미등록' }}</strong>
            <em :class="{ verified: emailVerified }">{{ emailVerified ? '인증됨' : '미인증' }}</em>
          </div>

          <div v-if="emailVerified" class="field-group">
            <label for="current-email-code">현재 이메일 인증번호</label>
            <div class="input-action">
              <input id="current-email-code" v-model.trim="emailForm.currentCode" inputmode="numeric" maxlength="6" placeholder="6자리 인증번호" />
              <button type="button" :disabled="busy" @click="requestCurrentEmail">번호받기</button>
            </div>
          </div>

          <div class="field-group">
            <label for="new-email">새 이메일</label>
            <input id="new-email" v-model.trim="emailForm.newEmail" type="email" autocomplete="email" placeholder="name@example.com" />
          </div>
          <div class="field-group">
            <label for="new-email-code">새 이메일 인증번호</label>
            <div class="input-action">
              <input id="new-email-code" v-model.trim="emailForm.newCode" inputmode="numeric" maxlength="6" placeholder="6자리 인증번호" />
              <button type="button" :disabled="busy || !emailForm.newEmail" @click="requestNewEmail">번호받기</button>
            </div>
          </div>

          <p v-if="message" class="result-message" :class="{ error: isError }" role="status">{{ message }}</p>
          <button v-if="accountSwitchEmail" class="switch-account" type="button" :disabled="busy" @click="switchAccount">
            이 이메일의 다른 계정으로 로그인
          </button>
          <ion-button expand="block" size="large" :disabled="busy || !canCommitEmail" @click="commitEmail">
            {{ busy ? '처리 중…' : (emailVerified ? '이메일 수정하기' : '이메일 인증하기') }}
          </ion-button>
        </section>

        <section v-else class="auth-card">
          <p class="eyebrow">PHONE</p>
          <h1>{{ phoneVerified ? '전화번호 변경' : '전화번호 인증' }}</h1>
          <p class="description">
            {{ phoneVerified
              ? '새 전화번호의 문자 인증과 현재 등록된 이메일 인증이 모두 완료되어야 변경됩니다.'
              : '전화번호를 입력하고 인증문자를 받은 뒤 인증번호를 확인합니다.' }}
          </p>

          <div class="current-info">
            <span>현재 전화번호</span>
            <strong>{{ me?.phoneMasked || '미등록' }}</strong>
          </div>

          <div v-if="phoneVerified && !emailVerified" class="prerequisite">
            <strong>이메일 인증이 먼저 필요합니다.</strong>
            <button type="button" @click="setMode('email')">이메일 인증하기</button>
          </div>

          <template v-else>
            <div class="field-group">
              <label for="new-phone">새 전화번호</label>
              <div class="input-action">
                <input id="new-phone" v-model.trim="phoneForm.newPhone" inputmode="tel" autocomplete="tel" maxlength="13" placeholder="010-1234-5678" />
                <button type="button" :disabled="busy || !phoneForm.newPhone" @click="requestPhoneSms">
                  {{ phoneSmsRequested ? '문자 다시받기' : '인증하기' }}
                </button>
              </div>
            </div>
            <div v-if="phoneSmsRequested" class="field-group">
              <label for="phone-sms-code">새 전화번호 문자 인증번호</label>
              <input id="phone-sms-code" v-model.trim="phoneForm.smsCode" inputmode="numeric" maxlength="6" placeholder="6자리 인증번호" />
            </div>
            <div v-if="phoneVerified" class="field-group">
              <label for="phone-email-code">이메일 인증번호</label>
              <small>{{ me?.email }}로 인증번호를 보냅니다.</small>
              <button v-if="!phoneEmailRequested" class="request-code-button" type="button" :disabled="busy" @click="requestPhoneEmail">이메일 인증하기</button>
              <div v-else class="input-action">
                <input id="phone-email-code" v-model.trim="phoneForm.emailCode" inputmode="numeric" maxlength="6" placeholder="6자리 인증번호" />
                <button type="button" :disabled="busy" @click="requestPhoneEmail">메일 다시받기</button>
              </div>
            </div>

            <p v-if="message" class="result-message" :class="{ error: isError }" role="status">{{ message }}</p>
            <ion-button expand="block" size="large" :disabled="busy || !canCommitPhone" @click="commitPhone">
              {{ busy ? '처리 중…' : (phoneVerified ? '전화번호 변경하기' : '전화번호 인증완료') }}
            </ion-button>
          </template>
        </section>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonPage, IonTitle, IonToolbar } from '@ionic/vue'
import { arrowBackOutline } from 'ionicons/icons'
import api, { auth as AuthAPI, clearAccountScopedLocalData } from '@/shared/services/api'
import { useUserStore } from '@/shared/stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const me = ref<Record<string, any> | null>(null)
const mode = ref<'email' | 'phone'>(route.query.mode === 'phone' ? 'phone' : 'email')
const busy = ref(false)
const message = ref('')
const isError = ref(false)
const accountSwitchEmail = ref('')
const phoneSmsRequested = ref(false)
const phoneEmailRequested = ref(false)
const requestedPhoneInput = ref('')
const emailForm = reactive({ newEmail: '', currentCode: '', newCode: '' })
const phoneForm = reactive({ newPhone: '', emailCode: '', smsCode: '' })

const emailVerified = computed(() => !!me.value?.email && !!me.value?.emailVerifiedAt)
const phoneVerified = computed(() => !!me.value?.phoneVerifiedAt)
const canCommitEmail = computed(() =>
  !!emailForm.newEmail && /^\d{6}$/.test(emailForm.newCode) && (!emailVerified.value || /^\d{6}$/.test(emailForm.currentCode))
)
const canCommitPhone = computed(() =>
  !!phoneForm.newPhone
    && phoneSmsRequested.value
    && /^\d{6}$/.test(phoneForm.smsCode)
    && (!phoneVerified.value || (phoneEmailRequested.value && /^\d{6}$/.test(phoneForm.emailCode)))
)

function setResult(text: string, error = false) {
  message.value = text
  isError.value = error
}

function deliveryMessage(data: any, fallback: string) {
  if (data?.testPhone === true) return '테스트 전화번호는 문자를 보내지 않으며 인증번호는 123456입니다.'
  if (data?.reviewLogin === true) return '심사용 인증번호를 준비했습니다.'
  if (data?.sent === true) return '인증번호를 발송했습니다.'
  if (data?.devCode) return '테스트 전용 환경이라 실제 이메일을 발송하지 않았습니다.'
  return data?.message || fallback
}

function errorMessage(error: any) {
  const retry = Number(error?.response?.data?.retryAfterSeconds || 0)
  const text = error?.response?.data?.message || '요청을 처리하지 못했습니다.'
  return retry > 0 ? `${text} (${retry}초 후 재시도)` : text
}

async function loadMe() {
  const { data } = await api.get('/api/me')
  me.value = data?.user || null
}

function setMode(next: 'email' | 'phone') {
  mode.value = next
  setResult('')
  router.replace({ query: { ...route.query, mode: next } })
}

async function runRequest(action: () => Promise<any>, success: string) {
  if (busy.value) return false
  busy.value = true
  setResult('')
  accountSwitchEmail.value = ''
  try {
    const response = await action()
    setResult(deliveryMessage(response?.data, success))
    return true
  } catch (error: any) {
    if (error?.response?.data?.code === 'EMAIL_IN_USE' && emailForm.newEmail) {
      accountSwitchEmail.value = emailForm.newEmail.trim().toLowerCase()
      setResult('이 이메일은 다른 계정에서 사용 중입니다. 현재 계정의 이메일로 변경할 수는 없지만, 해당 계정으로 로그인할 수 있습니다.', true)
      return false
    }
    setResult(errorMessage(error), true)
    return error?.response?.data?.code === 'RESEND_TOO_SOON'
  } finally {
    busy.value = false
  }
}

const requestCurrentEmail = () => runRequest(
  () => api.post('/api/account-verification/email/request', { kind: 'current' }),
  '현재 이메일로 인증번호를 보냈습니다.'
)
const requestNewEmail = () => runRequest(
  () => api.post('/api/account-verification/email/request', { kind: 'new', newEmail: emailForm.newEmail }),
  '새 이메일로 인증번호를 보냈습니다.'
)
async function requestPhoneEmail() {
  if (await runRequest(
    () => api.post('/api/account-verification/phone/email/request'),
    '현재 이메일로 인증번호를 보냈습니다.',
  )) phoneEmailRequested.value = true
}

async function requestPhoneSms() {
  if (await runRequest(
    () => api.post('/api/account-verification/phone/sms/request', { newPhone: phoneForm.newPhone }),
    '새 전화번호로 인증 문자를 보냈습니다.',
  )) {
    requestedPhoneInput.value = phoneForm.newPhone
    phoneSmsRequested.value = true
  }
}

async function switchAccount() {
  const targetEmail = accountSwitchEmail.value
  if (!targetEmail || busy.value) return
  busy.value = true
  try {
    await AuthAPI.logout()
  } finally {
    userStore.clear()
    clearAccountScopedLocalData()
    busy.value = false
    await router.replace({ path: '/login', query: { switchAccount: '1', email: targetEmail } })
  }
}

async function commitEmail() {
  await runRequest(async () => {
    await api.post('/api/account-verification/email/commit', {
      newEmail: emailForm.newEmail,
      currentCode: emailForm.currentCode,
      newCode: emailForm.newCode,
    })
    emailForm.currentCode = ''
    emailForm.newCode = ''
    await loadMe()
  }, '이메일 인증정보를 변경했습니다. 다음 로그인부터 새 이메일을 사용해주세요.')
}

async function commitPhone() {
  await runRequest(async () => {
    await api.post('/api/account-verification/phone/commit', {
      newPhone: phoneForm.newPhone,
      emailCode: phoneForm.emailCode,
      smsCode: phoneForm.smsCode,
    })
    phoneForm.emailCode = ''
    phoneForm.smsCode = ''
    phoneSmsRequested.value = false
    phoneEmailRequested.value = false
    requestedPhoneInput.value = ''
    await loadMe()
  }, '전화번호를 변경했습니다.')
}

function goBack() { router.back() }

watch(() => phoneForm.newPhone, (value) => {
  if (requestedPhoneInput.value && value !== requestedPhoneInput.value) {
    phoneForm.smsCode = ''
    phoneSmsRequested.value = false
  }
})

onMounted(async () => {
  try { await loadMe() }
  catch (error) { setResult(errorMessage(error), true) }
})
</script>

<style scoped>
.auth-info-page { --background: var(--bg); }
ion-content { --background: var(--bg); }
.auth-wrap { width: min(100%, 680px); margin: 0 auto; padding: 22px 16px 40px; box-sizing: border-box; }
.mode-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 5px; border: 1px solid var(--panel-border); border-radius: 15px; background: var(--panel-soft); }
.mode-tabs button { min-height: 44px; border: 0; border-radius: 11px; background: transparent; color: var(--text-dim); font-size: 15px; font-weight: 750; }
.mode-tabs button.active { background: var(--panel); color: var(--text-strong); box-shadow: var(--shadow-xs); }
.auth-card { margin-top: 16px; padding: 24px; border: 1px solid var(--panel-border); border-radius: 22px; background: var(--panel); box-shadow: var(--shadow-sm); }
.eyebrow { margin: 0 0 5px; color: var(--gold); font-size: 11px; font-weight: 850; letter-spacing: .13em; }
h1 { margin: 0; color: var(--text-strong); font-size: 25px; letter-spacing: -.035em; }
.description { margin: 10px 0 22px; color: var(--text-dim); font-size: 14px; line-height: 1.65; }
.current-info { display: grid; grid-template-columns: 1fr auto; gap: 5px 10px; margin-bottom: 22px; padding: 15px; border-radius: 14px; background: var(--panel-soft); }
.current-info span { grid-column: 1 / -1; color: var(--text-faint); font-size: 12px; font-weight: 700; }
.current-info strong { overflow-wrap: anywhere; color: var(--text); font-size: 15px; }
.current-info em { align-self: center; color: var(--danger); font-size: 12px; font-style: normal; font-weight: 800; }
.current-info em.verified { color: #16794b; }
.field-group { display: grid; gap: 8px; margin: 17px 0; }
.field-group label { color: var(--text); font-size: 14px; font-weight: 750; }
.field-group small { margin-top: -3px; color: var(--text-dim); font-size: 12px; }
input { width: 100%; height: 50px; padding: 0 14px; box-sizing: border-box; border: 1px solid var(--panel-border); border-radius: 13px; outline: none; background: var(--bg); color: var(--text-strong); font-size: 16px; }
input:focus { border-color: var(--gold); box-shadow: 0 0 0 3px color-mix(in srgb, var(--gold) 14%, transparent); }
.input-action { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.input-action button, .prerequisite button { min-width: 92px; border: 1px solid var(--gold); border-radius: 13px; background: transparent; color: var(--gold-strong); font-size: 13px; font-weight: 800; }
.request-code-button { min-height: 46px; border: 1px solid var(--gold); border-radius: 13px; background: transparent; color: var(--gold-strong); font-size: 13px; font-weight: 800; }
button:disabled { opacity: .45; }
.result-message { margin: 14px 0; padding: 12px 14px; border-radius: 12px; background: #edf8f2; color: #14643e; font-size: 14px; line-height: 1.5; }
.result-message.error { background: #fff0f0; color: var(--danger); }
.switch-account { width: 100%; min-height: 46px; margin: 4px 0 2px; border: 1px solid var(--gold); border-radius: 13px; background: transparent; color: var(--gold-strong); font-size: 14px; font-weight: 800; }
.prerequisite { display: grid; gap: 12px; padding: 18px; border: 1px solid #edd7a6; border-radius: 15px; background: #fffaf0; color: var(--text); font-size: 14px; }
.prerequisite button { min-height: 44px; }
ion-button { margin-top: 22px; font-size: 15px; font-weight: 800; }
@media (max-width: 420px) {
  .auth-wrap { padding: 14px 10px 30px; }
  .auth-card { padding: 20px 15px; }
  .input-action { grid-template-columns: 1fr; }
  .input-action button { min-height: 44px; }
}
</style>
