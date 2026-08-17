<template>
  <div class="login-container">
    <main class="login-shell">
      <header class="brand-header">
        <div class="brand-picture" aria-hidden="true">
          <img src="/img/login-hands.jpg" alt="" />
        </div>
        <h1>손끝</h1>
      </header>

      <section class="login-box">
        <header class="form-header">
          <h2>{{ phoneChangeMode ? '전화번호 변경 인증' : t('phoneAuth.title') }}</h2>
        </header>

        <template v-if="!phoneChangeMode">
        <!-- 1단계: 전화번호 입력 + 인증번호 받기 -->
        <form v-if="!codeSent" @submit.prevent="requestCode" class="login-form" autocomplete="on">
          <div class="form-group">
            <label for="phone">
              <span>{{ t('phoneAuth.phoneLabel') }}</span>
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              :placeholder="t('phoneAuth.phonePlaceholder')"
              v-model="phone"
              autocomplete="tel"
              inputmode="tel"
              maxlength="13"
              required
            />
          </div>

          <button class="primary-action" type="submit" :disabled="requesting || !isPhoneValid">
            {{ requesting ? t('phoneAuth.sending') : t('phoneAuth.requestButton') }}
          </button>
        </form>

        <!-- 2단계: 인증번호 입력 + 인증 확인 -->
        <form v-else @submit.prevent="verifyCode" class="login-form" autocomplete="off">
          <p class="hint">
            <strong>{{ formattedPhone }}</strong><br />
            {{ deliveryNotice }}
          </p>

          <div class="form-group">
            <label for="code">
              <span>{{ t('phoneAuth.codeLabel') }}</span>
              <small>6자리 숫자</small>
            </label>
            <input
              id="code"
              name="code"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              maxlength="6"
              :placeholder="t('phoneAuth.codePlaceholder')"
              v-model="code"
              autocomplete="one-time-code"
              class="code-input"
              required
            />
          </div>

          <button class="primary-action" type="submit" :disabled="verifying || code.length !== 6">
            {{ verifying ? t('phoneAuth.verifying') : t('phoneAuth.verifyButton') }}
          </button>

          <div class="secondary-actions">
            <button
              type="button"
              class="link-button"
              :disabled="requesting || resendCountdown > 0"
              @click="requestCode"
            >
              {{ resendCountdown > 0 ? t('phoneAuth.resendIn', { seconds: resendCountdown }) : t('phoneAuth.resendButton') }}
            </button>
            <button type="button" class="link-button" :disabled="requesting || verifying" @click="changePhone">
              {{ t('phoneAuth.changePhone') }}
            </button>
          </div>
        </form>

        <!-- 에러/안내 메시지 -->
        <p v-if="message" :class="messageIsSuccess ? 'success-message' : 'error'" role="alert" aria-live="polite">{{ message }}</p>
        <button class="phone-change-entry" type="button" @click="openPhoneChange">
          전화번호 변경 인증
        </button>
        </template>

        <form v-else class="login-form phone-change-form" autocomplete="off" @submit.prevent="commitPhoneChange">
          <p class="recovery-description">
            기존 전화번호와 인증된 이메일이 일치하고, 이메일과 새 전화번호 인증을 모두 완료해야 변경됩니다.
          </p>

          <div class="form-group">
            <label for="current-phone">기존 전화번호</label>
            <input id="current-phone" v-model.trim="phoneChange.currentPhone" type="tel" inputmode="tel" autocomplete="tel" maxlength="13" placeholder="010-1234-5678" required />
          </div>

          <div class="form-group">
            <label for="current-email">기존 등록 이메일</label>
            <div class="input-action">
              <input id="current-email" v-model.trim="phoneChange.currentEmail" type="email" autocomplete="email" placeholder="name@example.com" required />
              <button type="button" class="request-action" :disabled="phoneChangeBusy || !canRequestRecoveryEmail" @click="requestPhoneChangeEmail">인증받기</button>
            </div>
          </div>

          <div v-if="phoneChange.emailRequested" class="form-group">
            <label for="recovery-email-code">이메일 인증번호 <small>6자리 숫자</small></label>
            <input id="recovery-email-code" v-model.trim="phoneChange.emailCode" class="code-input" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000" required />
          </div>

          <div class="form-group">
            <label for="new-phone">새로운 전화번호</label>
            <div class="input-action">
              <input id="new-phone" v-model.trim="phoneChange.newPhone" type="tel" inputmode="tel" autocomplete="tel" maxlength="13" placeholder="010-1234-5678" required />
              <button type="button" class="request-action" :disabled="phoneChangeBusy || !canRequestRecoverySms" @click="requestPhoneChangeSms">인증받기</button>
            </div>
          </div>

          <div v-if="phoneChange.smsRequested" class="form-group">
            <label for="recovery-sms-code">문자 인증번호 <small>6자리 숫자</small></label>
            <input id="recovery-sms-code" v-model.trim="phoneChange.smsCode" class="code-input" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000" required />
          </div>

          <p v-if="phoneChangeMessage" :class="phoneChangeError ? 'error' : 'success-message'" role="status" aria-live="polite">
            {{ phoneChangeMessage }}
          </p>

          <button class="primary-action" type="submit" :disabled="phoneChangeBusy || !canCommitPhoneChange">
            {{ phoneChangeBusy ? '처리 중…' : '전화번호 변경하기' }}
          </button>
          <button class="phone-change-entry" type="button" :disabled="phoneChangeBusy" @click="closePhoneChange">로그인으로 돌아가기</button>
        </form>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
/**
 * LoginPage.vue — 전화번호 문자 인증 로그인 화면
 * - 일반 사용자 로그인은 전화번호 인증을 사용한다(관리자 로그인은 /admin/login 별도 화면).
 * - 자동 로그인(토큰 기반 즉시 진입/백그라운드 검증)은 router 가드에서만 처리한다.
 */
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { toastController } from '@ionic/vue'
import { auth as AuthAPI, clearAccountScopedLocalData, setAuthToken } from '@/shared/services/api'
import { useUserStore } from '@/shared/stores/user'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const { t } = useI18n()

const phone = ref<string>('')
const code = ref<string>('')
const message = ref<string>('')
const messageIsSuccess = ref(false)
const deliveryNotice = ref<string>('')
const codeSent = ref<boolean>(false)
const requesting = ref<boolean>(false)
const verifying = ref<boolean>(false)
const resendCountdown = ref<number>(0)
const phoneChangeMode = ref(false)
const phoneChangeBusy = ref(false)
const phoneChangeMessage = ref('')
const phoneChangeError = ref(false)
const phoneChange = reactive({
  currentPhone: '',
  currentEmail: '',
  newPhone: '',
  emailCode: '',
  smsCode: '',
  emailRequested: false,
  smsRequested: false,
})

let countdownTimer: ReturnType<typeof setInterval> | null = null

const phoneDigits = computed(() => phone.value.replace(/\D/g, ''))
const isPhoneValid = computed(() => /^\d{11}$/.test(phoneDigits.value))
const formattedPhone = computed(() => {
  const value = phoneDigits.value
  return value.length === 11 ? `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7)}` : value
})
const currentPhoneDigits = computed(() => phoneChange.currentPhone.replace(/\D/g, ''))
const newPhoneDigits = computed(() => phoneChange.newPhone.replace(/\D/g, ''))
const recoveryEmailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(phoneChange.currentEmail.trim()))
const canRequestRecoveryEmail = computed(() => /^010\d{8}$/.test(currentPhoneDigits.value) && recoveryEmailValid.value)
const canRequestRecoverySms = computed(() =>
  canRequestRecoveryEmail.value &&
  phoneChange.emailRequested &&
  /^\d{6}$/.test(phoneChange.emailCode) &&
  /^010\d{8}$/.test(newPhoneDigits.value) &&
  newPhoneDigits.value !== currentPhoneDigits.value,
)
const canCommitPhoneChange = computed(() =>
  phoneChange.emailRequested &&
  phoneChange.smsRequested &&
  /^\d{6}$/.test(phoneChange.emailCode) &&
  /^\d{6}$/.test(phoneChange.smsCode) &&
  canRequestRecoverySms.value,
)

function redirectTarget() {
  return (typeof route.query.redirect === 'string' && route.query.redirect)
    ? String(route.query.redirect)
    : '/home/6page'
}

function startCountdown(seconds: number) {
  stopCountdown()
  resendCountdown.value = Math.max(0, Math.floor(seconds))
  if (resendCountdown.value <= 0) return
  countdownTimer = setInterval(() => {
    resendCountdown.value -= 1
    if (resendCountdown.value <= 0) stopCountdown()
  }, 1000)
}
function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
}

async function toast(msg: string, color: 'primary' | 'success' | 'warning' | 'danger' = 'primary') {
  const el = await toastController.create({ message: msg, color, duration: 1800, position: 'bottom' })
  await el.present()
}

function changePhone() {
  codeSent.value = false
  code.value = ''
  message.value = ''
  messageIsSuccess.value = false
  deliveryNotice.value = ''
  stopCountdown()
}

function setPhoneChangeResult(value: string, isError = false) {
  phoneChangeMessage.value = value
  phoneChangeError.value = isError
}

function openPhoneChange() {
  phoneChangeMode.value = true
  phoneChange.currentPhone = phone.value
  message.value = ''
  messageIsSuccess.value = false
  setPhoneChangeResult('')
}

function closePhoneChange() {
  phoneChangeMode.value = false
  setPhoneChangeResult('')
}

function publicPhoneChangeError(err: any) {
  const code = err?.response?.data?.code
  const map: Record<string, string> = {
    INVALID_PHONE: '기존 전화번호 형식을 확인해주세요.',
    INVALID_NEW_PHONE: '새 전화번호 형식을 확인해주세요.',
    INVALID_EMAIL: '이메일 형식을 확인해주세요.',
    PUBLIC_PHONE_CHANGE_FAILED: '입력 정보 또는 인증번호를 확인해주세요.',
  }
  return map[code] || '전화번호 변경 요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.'
}

async function requestPhoneChangeEmail() {
  if (phoneChangeBusy.value || !canRequestRecoveryEmail.value) return
  phoneChangeBusy.value = true
  setPhoneChangeResult('')
  try {
    await AuthAPI.requestPublicPhoneChangeEmail({
      currentPhone: currentPhoneDigits.value,
      currentEmail: phoneChange.currentEmail,
    })
    phoneChange.emailRequested = true
    phoneChange.emailCode = ''
    setPhoneChangeResult('입력 정보가 일치하면 기존 이메일로 인증번호가 발송됩니다.')
  } catch (err: any) {
    setPhoneChangeResult(publicPhoneChangeError(err), true)
  } finally {
    phoneChangeBusy.value = false
  }
}

async function requestPhoneChangeSms() {
  if (phoneChangeBusy.value || !canRequestRecoverySms.value) return
  phoneChangeBusy.value = true
  setPhoneChangeResult('')
  const requestedIdentity = [
    currentPhoneDigits.value,
    phoneChange.currentEmail.trim(),
    newPhoneDigits.value,
    phoneChange.emailCode,
  ].join('|')
  try {
    await AuthAPI.requestPublicPhoneChangeSms({
      currentPhone: currentPhoneDigits.value,
      currentEmail: phoneChange.currentEmail,
      newPhone: newPhoneDigits.value,
      emailCode: phoneChange.emailCode,
    })
    const currentIdentity = [
      currentPhoneDigits.value,
      phoneChange.currentEmail.trim(),
      newPhoneDigits.value,
      phoneChange.emailCode,
    ].join('|')
    if (requestedIdentity === currentIdentity) {
      phoneChange.smsRequested = true
      phoneChange.smsCode = ''
      setPhoneChangeResult('이메일 인증번호가 맞고 새 번호를 사용할 수 있으면 인증문자가 발송됩니다.')
    }
  } catch (err: any) {
    setPhoneChangeResult(publicPhoneChangeError(err), true)
  } finally {
    phoneChangeBusy.value = false
  }
}

async function commitPhoneChange() {
  if (phoneChangeBusy.value || !canCommitPhoneChange.value) return
  phoneChangeBusy.value = true
  setPhoneChangeResult('')
  try {
    await AuthAPI.commitPublicPhoneChange({
      currentPhone: currentPhoneDigits.value,
      currentEmail: phoneChange.currentEmail,
      newPhone: newPhoneDigits.value,
      emailCode: phoneChange.emailCode,
      smsCode: phoneChange.smsCode,
    })
    phone.value = newPhoneDigits.value
    phoneChangeMode.value = false
    codeSent.value = false
    code.value = ''
    messageIsSuccess.value = true
    message.value = '전화번호가 변경되었습니다. 새 전화번호로 로그인해주세요.'
    await toast('전화번호가 변경되었습니다.', 'success')
  } catch (err: any) {
    setPhoneChangeResult(publicPhoneChangeError(err), true)
  } finally {
    phoneChangeBusy.value = false
  }
}

watch(() => [phoneChange.currentPhone, phoneChange.currentEmail], () => {
  phoneChange.emailRequested = false
  phoneChange.smsRequested = false
  phoneChange.emailCode = ''
  phoneChange.smsCode = ''
})

watch(() => phoneChange.newPhone, () => {
  phoneChange.smsRequested = false
  phoneChange.smsCode = ''
})

watch(() => phoneChange.emailCode, () => {
  phoneChange.smsRequested = false
  phoneChange.smsCode = ''
})

function errorMessageFor(errCode: string | undefined, fallback: string) {
  const map: Record<string, string> = {
    INVALID_PHONE: t('phoneAuth.errors.invalidPhone'),
    INVALID_CODE_FORMAT: t('phoneAuth.errors.invalidCodeFormat'),
    SMS_DELIVERY_FAILED: t('phoneAuth.errors.sendFailed'),
    PROVIDER_NOT_CONFIGURED: t('phoneAuth.errors.providerNotConfigured'),
    CODE_MISMATCH: t('phoneAuth.errors.codeMismatch'),
    CODE_EXPIRED: t('phoneAuth.errors.codeExpired'),
    CODE_NOT_FOUND: t('phoneAuth.errors.codeNotFound'),
    TOO_MANY_ATTEMPTS: t('phoneAuth.errors.tooManyAttempts'),
    RESEND_TOO_SOON: t('phoneAuth.errors.resendTooSoon'),
    TOO_MANY_REQUESTS: t('phoneAuth.errors.tooManyRequests'),
    PHONE_ACCOUNT_AMBIGUOUS: t('phoneAuth.errors.accountConflict'),
    PHONE_ACCOUNT_CONFLICT: t('phoneAuth.errors.accountConflict'),
  }
  return (errCode && map[errCode]) || fallback
}

/** 인증번호 요청 (최초 발송 + 재발송 공용) */
const requestCode = async () => {
  if (requesting.value) return
  if (!isPhoneValid.value) {
    message.value = t('phoneAuth.errors.invalidPhone')
    return
  }

  requesting.value = true
  message.value = ''
  messageIsSuccess.value = false

  try {
    const res = await AuthAPI.requestPhoneCode(phoneDigits.value)
    const body: any = res?.data ?? {}
    codeSent.value = true
    code.value = ''
    startCountdown(Number(body?.resendAfterSeconds) || 60)
    deliveryNotice.value = body?.reviewLogin === true
      ? '심사용 인증번호를 준비했습니다.'
      : body?.sent === true
        ? '인증번호를 문자로 발송했습니다.'
        : '테스트 인증번호를 준비했습니다.'
    await toast(deliveryNotice.value, 'success')
  } catch (err: any) {
    const status = err?.response?.status
    const errCode = err?.response?.data?.code
    if (status === 429 && errCode === 'RESEND_TOO_SOON') {
      const retryAfter = Number(err?.response?.data?.retryAfterSeconds) || 60
      // 직전 요청에서 발급된 인증번호는 여전히 유효하므로 입력 단계로 복구한다.
      codeSent.value = true
      code.value = ''
      startCountdown(retryAfter)
      const body = err?.response?.data || {}
      deliveryNotice.value = body?.reviewLogin === true
        ? '심사용 인증번호가 이미 준비되어 있습니다.'
        : body?.sent === true
          ? '이미 발송한 문자 인증번호를 확인해주세요.'
          : deliveryNotice.value
    }
    message.value = errorMessageFor(errCode, t('phoneAuth.errors.sendFailed'))
  } finally {
    requesting.value = false
  }
}

/** 인증번호 확인 + 로그인/가입 */
const verifyCode = async () => {
  if (verifying.value) return
  if (code.value.length !== 6) {
    message.value = t('phoneAuth.errors.invalidCodeFormat')
    return
  }

  verifying.value = true
  message.value = ''
  messageIsSuccess.value = false

  try {
    await AuthAPI.verifyPhoneCode(phoneDigits.value, code.value.trim())
    code.value = ''

    // 직전 계정의 /api/me 캐시를 사용하지 않고 방금 인증한 전화번호 계정을 확정한다.
    await userStore.bootstrapAuth({ force: true, silent: true })
    router.replace(redirectTarget())
  } catch (err: any) {
    console.error('[HTTP][ERR] /api/auth/phone/verify', {
      status: err?.response?.status,
      data: err?.response?.data,
      msg: err?.message,
    })
    const errCode = err?.response?.data?.code
    message.value = errorMessageFor(errCode, t('phoneAuth.errors.verifyFailed'))
  } finally {
    verifying.value = false
  }
}

onMounted(async () => {
  const switchAccount = route.query.switchAccount === '1'
  if (typeof route.query.phone === 'string') phone.value = route.query.phone.replace(/\D/g, '')

  if (switchAccount) {
    try { await AuthAPI.logout() } catch {}
    clearAccountScopedLocalData()
    return
  }

  // ✅ 토큰이 있으면 로그인 화면에서 멈추지 말고 즉시 이동
  //    (실제 유효성 검증/동의/탈퇴 체크는 router 가드가 백그라운드로 처리)
  let token: string | null = null
  try { token = localStorage.getItem('TZCHAT_AUTH_TOKEN') } catch { token = null }

  if (token && token.trim()) {
    try { setAuthToken(token.trim()) } catch {}
    router.replace(redirectTarget())
  }
})

onUnmounted(() => {
  stopCountdown()
})
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: calc(100dvh - var(--safe-top) - var(--safe-bottom));
  padding: 24px 20px;
  background:
    radial-gradient(circle at 50% 4%, rgba(216, 188, 144, 0.16), transparent 34%),
    #f7f5f2;
  color: #24211f;
  overscroll-behavior: contain;
  overflow: hidden auto;
}

.login-shell {
  width: min(100%, 420px);
  padding: 34px 32px 34px;
  border: 1px solid #e8e2da;
  border-radius: 24px;
  background: #fff;
  box-shadow: 0 18px 48px rgba(60, 48, 36, 0.08);
}

.brand-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.brand-picture {
  width: 124px;
  aspect-ratio: 1;
  padding: 5px;
  border: 1px solid rgba(151, 111, 61, 0.22);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 12px 30px rgba(86, 62, 37, 0.14);
}

.brand-picture img {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: cover;
}

.brand-header h1 {
  position: relative;
  margin: 18px 0 0;
  padding-left: 0.16em;
  color: #72502d;
  font-family: "AppleMyungjo", "Noto Serif KR", "Nanum Myeongjo", Batang, serif;
  font-size: 38px;
  font-weight: 500;
  line-height: 1.1;
  letter-spacing: 0.16em;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.8);
}

.brand-header h1::after {
  content: "";
  display: block;
  width: 30px;
  height: 1px;
  margin: 13px auto 0;
  background: linear-gradient(90deg, transparent, #b88c55, transparent);
}

.login-box {
  min-width: 0;
  margin-top: 32px;
  color: #24211f;
}

.form-header { margin-bottom: 26px; }

.login-box h2 {
  margin: 0;
  color: #24211f;
  font-size: 24px;
  line-height: 1.25;
  letter-spacing: -0.045em;
}

.login-form { display: flex; flex-direction: column; gap: 18px; }
.form-group { display: flex; flex-direction: column; align-items: stretch; }
.login-box label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
  color: #3b3733 !important;
  font-size: 13px;
  font-weight: 750;
}

.login-box label small {
  color: #a09891;
  font-size: 11px;
  font-weight: 600;
}

.login-box input {
  width: 100%;
  min-height: 52px;
  padding: 13px 15px;
  border-radius: 14px;
  border: 1px solid #ddd6ce !important;
  font-size: 16px;
  background: #fff !important;
  color: #24211f !important;
  outline: none;
  transition: box-shadow .18s, border-color .18s;
  accent-color: #ad7d32;
}
.login-box input::placeholder { color: #aaa29b !important; }
.login-box input:-webkit-autofill,
.login-box input:-webkit-autofill:hover,
.login-box input:-webkit-autofill:focus {
  -webkit-text-fill-color: #24211f;
  transition: background-color 5000s;
  box-shadow: 0 0 0px 1000px #fff inset;
}
.login-box input:focus-visible {
  border-color: #ad7d32 !important;
  box-shadow: 0 0 0 3px rgba(173, 125, 50, 0.13) !important;
  border-radius: 14px;
}

.code-input {
  text-align: center;
  font-size: 20px !important;
  font-weight: 800;
  letter-spacing: 0.32em;
}

.login-box button {
  width: 100%;
  min-height: 50px;
  padding: 12px 16px;
  border: none;
  border-radius: 14px;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  transition: filter .18s, transform .08s ease-out, opacity .18s;
  will-change: transform;
}
.primary-action {
  background: linear-gradient(135deg, #bd914c, #986a29);
  color: #fff;
  box-shadow: 0 10px 24px rgba(141, 98, 37, 0.2);
}
.login-box button:hover { filter: brightness(0.98); }
.login-box button:active { transform: translateY(1px); }
.login-box button:disabled { opacity: 0.42; cursor: not-allowed; box-shadow: none; }
.hint {
  margin: -2px 0 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: #f4f0ea;
  color: #746d66;
  font-size: 12px;
  word-break: break-word;
}
.hint strong { color: #4d4742; }
.secondary-actions {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
}
.link-button {
  background: transparent !important;
  color: #8d6225 !important;
  font-weight: 700 !important;
  font-size: 12px !important;
  min-height: 40px !important;
  padding: 7px 8px !important;
  border: 1px solid #e5ddd3 !important;
  width: auto !important;
  flex: 1 1 auto;
  box-shadow: none !important;
}
.link-button:disabled { opacity: 0.5 !important; }
.phone-change-entry {
  width: auto !important;
  min-height: 34px !important;
  margin: 18px auto 0;
  padding: 6px 8px !important;
  background: transparent !important;
  color: #8b8178 !important;
  font-size: 11px !important;
  font-weight: 650 !important;
  text-decoration: underline;
  box-shadow: none !important;
}
.phone-change-form { gap: 15px; }
.recovery-description { margin: -8px 0 4px; color: #746d66; font-size: 12px; line-height: 1.55; }
.input-action { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
.request-action { width: auto !important; min-height: 52px !important; padding: 10px 12px !important; border: 1px solid #ddd6ce !important; background: #f4f0ea !important; color: #795526 !important; font-size: 12px !important; box-shadow: none !important; white-space: nowrap; }
.success-message { margin: 0; padding: 10px 12px; border-radius: 12px; background: #edf8f1; color: #21633d; font-size: 12px; line-height: 1.5; }
.error {
  margin: 16px 0 0;
  padding: 10px 12px;
  border: 1px solid #edc6c8;
  border-radius: 12px;
  background: #fff2f2;
  color: #b33f46;
  font-size: 13px;
  line-height: 1.45;
  word-break: break-word;
}

@media (max-width: 760px) {
  .login-container {
    align-items: flex-start;
    background:
      radial-gradient(circle at 50% 0%, rgba(226, 205, 171, 0.22), transparent 32%),
      #fffdfb;
    padding: 0;
  }

  .login-shell {
    width: 100%;
    min-height: calc(100dvh - var(--safe-top) - var(--safe-bottom));
    padding: 42px 24px 32px;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }

  .brand-picture { width: 116px; }

  .brand-header h1 {
    margin-top: 16px;
    font-size: 36px;
  }

  .login-box { margin-top: 30px; }
}

@media (max-height: 680px) and (max-width: 760px) {
  .login-shell { padding-top: 24px; }
  .brand-picture { width: 92px; }
  .brand-header h1 { margin-top: 12px; font-size: 32px; }
  .brand-header h1::after { margin-top: 9px; }
  .login-box { margin-top: 22px; }
  .form-header { margin-bottom: 20px; }
}

@media (max-width: 340px) {
  .login-shell {
    padding-left: 18px;
    padding-right: 18px;
  }
}
@media (prefers-reduced-motion: reduce) {
  * { transition-duration: 0.001ms !important; animation-duration: 0.001ms !important; }
}
</style>
