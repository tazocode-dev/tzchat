<template>
  <div class="login-container">
    <div class="login-box">
      <br /><br />
      <h1>{{ t('common.appName') }}</h1>
      <br /><br />

      <h2>{{ t('login.title') }}</h2>
      <br />

      <!-- 관리자 로그인 폼 (아이디/비밀번호) -->
      <form @submit.prevent="login" class="login-form" autocomplete="on">
        <!-- 아이디 입력 -->
        <div class="form-group">
          <label for="login-username">{{ t('login.usernameLabel') }}</label>
          <input
            id="login-username"
            name="username"
            type="text"
            :placeholder="t('login.usernamePlaceholder')"
            v-model="username"
            autocomplete="username"
            required
          />
        </div>

        <!-- 비밀번호 입력 -->
        <div class="form-group">
          <label for="login-password">{{ t('login.passwordLabel') }}</label>
          <input
            id="login-password"
            name="password"
            type="password"
            :placeholder="t('login.passwordPlaceholder')"
            v-model="password"
            autocomplete="current-password"
            required
          />
        </div>

        <!-- 로그인 버튼 -->
        <button type="submit" :disabled="submitting">
          {{ submitting ? t('login.submitting') : t('login.submit') }}
        </button>
      </form>

      <!-- 에러/안내 메시지 -->
      <p class="error" v-if="message">{{ message }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * AdminLoginPage.vue
 * ------------------------------------------------------------
 * 관리자(master) 전용 아이디/비밀번호 로그인 화면.
 * - 일반 사용자 로그인은 LoginPage.vue(이메일 인증)로 전환되었지만,
 *   관리자 계정은 이메일 인증 전환 대상이 아니므로(기존 기능 유지 원칙)
 *   기존 POST /api/login(아이디/비밀번호) 흐름을 그대로 이 화면에서만 유지한다.
 * - 백엔드 /api/login, sessionService는 전혀 수정하지 않았다.
 * - 일반 사용자 진입 동선(메인 네비게이션)에는 노출하지 않는다.
 */
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { auth as AuthAPI, setAuthToken } from '@/shared/services/api'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()

const username = ref<string>('')
const password = ref<string>('')
const message = ref<string>('')
const submitting = ref<boolean>(false)

function redirectTarget() {
  return (typeof route.query.redirect === 'string' && route.query.redirect)
    ? String(route.query.redirect)
    : '/home/6page'
}

onMounted(() => {
  let token: string | null = null
  try { token = localStorage.getItem('TZCHAT_AUTH_TOKEN') } catch { token = null }

  if (token && token.trim()) {
    try { setAuthToken(token.trim()) } catch {}
    router.replace(redirectTarget())
  }
})

const login = async () => {
  if (submitting.value) return
  submitting.value = true
  message.value = ''

  try {
    const id = (username.value || '').trim()
    const pw = password.value
    if (!id || !pw) {
      message.value = t('login.errors.missingFields')
      return
    }

    const res = await AuthAPI.login({ username: id, password: pw })

    const body: any = res?.data ?? {}
    const tokenCandidates = [
      body?.token,
      body?.data?.token,
      body?.accessToken,
      body?.jwt,
      body?.data?.accessToken,
    ].filter(Boolean)

    if (tokenCandidates.length > 0) {
      try { setAuthToken(String(tokenCandidates[0])) } catch {}
    }

    password.value = ''

    router.replace(redirectTarget())
  } catch (err: any) {
    console.error('[HTTP][ERR] /login', {
      status: err?.response?.status,
      data: err?.response?.data,
      msg: err?.message,
    })
    const status = err?.response?.status
    if (status === 401) {
      message.value = err.response?.data?.message || t('login.errors.unauthorized')
    } else if (status === 400) {
      message.value = err.response?.data?.message || t('login.errors.badRequest')
    } else if (status === 429) {
      message.value = t('login.errors.rateLimited')
    } else {
      message.value = t('login.errors.generic')
    }
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100dvh;
  padding: clamp(12px, 3vw, 20px);
  padding-top: calc(var(--safe-top) + clamp(12px, 3vw, 20px));
  padding-bottom: calc(var(--safe-bottom) + clamp(12px, 3vw, 20px));
  padding-left: calc(var(--safe-left) + clamp(12px, 3vw, 20px));
  padding-right: calc(var(--safe-right) + clamp(12px, 3vw, 20px));
  background: #f4f6f9;
  color: #111;
  overscroll-behavior: contain;
}
.login-box {
  width: min(100%, 420px);
  background: #141414;
  color: #fff;
  padding: clamp(16px, 4.5vw, 28px);
  border-radius: 16px;
  box-shadow: 0 6px 18px rgba(0,0,0,0.25);
  text-align: center;
}
.login-box h2 {
  margin: 0 0 clamp(8px, 2vw, 12px) 0;
  font-size: clamp(18px, 4.5vw, 24px);
  line-height: 1.25;
  color: #ffffff;
}
.login-box h2:last-of-type { margin-bottom: clamp(14px, 3vw, 18px); }
.login-form { display: flex; flex-direction: column; gap: clamp(12px, 3vw, 16px); }
.form-group { display: flex; flex-direction: column; align-items: stretch; }
.login-box label {
  margin-bottom: 8px;
  font-size: clamp(16px, 2.8vw, 17px);
  font-weight: 600;
  letter-spacing: 0.1px;
  color: #ffffff;
}
.login-box input {
  width: 100%;
  min-height: 48px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px solid #cfcfcf;
  font-size: 16px;
  background: #ffffff;
  color: #111;
  outline: none;
  transition: box-shadow .15s, border-color .15s;
  accent-color: #3498db;
}
.login-box input::placeholder { color: #8d8d8d; }
.login-box input:-webkit-autofill,
.login-box input:-webkit-autofill:hover,
.login-box input:-webkit-autofill:focus {
  -webkit-text-fill-color: #111;
  transition: background-color 5000s;
  box-shadow: 0 0 0px 1000px #fff inset;
}
.login-box input:focus-visible {
  border-color: #3498db;
  box-shadow: 0 0 0 3px rgba(52,152,219,0.25);
  border-radius: 12px;
}
.login-box button {
  width: 100%;
  min-height: 48px;
  padding: 12px 14px;
  background: #3498db;
  color: #fff;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: background .2s, transform .08s ease-out, opacity .2s;
  will-change: transform;
}
.login-box button:hover { background: #2980b9; }
.login-box button:active { transform: translateY(1px); }
.login-box button:disabled { opacity: 0.6; cursor: not-allowed; }
.error {
  color: #ff5252;
  margin-top: 10px;
  font-size: clamp(15px, 2.6vw, 16px);
  line-height: 1.45;
  word-break: break-word;
}
* { scrollbar-width: thin; scrollbar-color: #bbb transparent; }
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-thumb { background: #bbb; border-radius: 4px; }
@media (max-width: 320px) {
  .login-container { padding: 8px; }
  .login-box { padding: 14px; }
}
@media (prefers-reduced-motion: reduce) {
  * { transition-duration: 0.001ms !important; animation-duration: 0.001ms !important; }
}
</style>
