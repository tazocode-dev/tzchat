<template>
  <ion-page>
    <ion-content :fullscreen="true" class="onboarding-content">
      <main class="onboarding-shell" :aria-busy="loading || submitting">
        <header class="onboarding-header">
          <span class="brand">TZChat</span>
          <span class="progress">{{ step === 'birthDate' ? '1 / 2' : '2 / 2' }}</span>
        </header>

        <section v-if="loading" class="state-panel">
          <ion-spinner name="crescent" />
          <p>기본 정보를 확인하고 있어요.</p>
        </section>

        <section v-else-if="loadError" class="state-panel">
          <h1>정보를 불러오지 못했습니다</h1>
          <p>{{ loadError }}</p>
          <ion-button expand="block" @click="load">재시도</ion-button>
          <button class="text-button" type="button" @click="logout">로그아웃</button>
        </section>

        <form v-else-if="step === 'birthDate'" class="step-card" @submit.prevent="submitBirthYear">
          <p class="eyebrow">필수 기본 정보</p>
          <h1>출생연도를 입력해 주세요</h1>
          <p class="description">19세가 되는 해부터 이용할 수 있으며 프로필에는 출생연도만 표시됩니다.</p>

          <label class="field-label" for="birth-year">출생연도</label>
          <input
            id="birth-year"
            :value="birthYear"
            class="year-input"
            type="text"
            inputmode="numeric"
            pattern="[0-9]{4}"
            maxlength="4"
            autocomplete="bday-year"
            placeholder="예: 1990"
            @input="updateBirthYear"
            required
          />
          <p class="field-note">저장 후에는 직접 변경할 수 없으므로 정확히 확인해 주세요.</p>
          <p v-if="message" class="error" role="alert">{{ message }}</p>

          <ion-button type="submit" expand="block" :disabled="submitting || !isBirthYearValid">
            {{ submitting ? '확인 중…' : '확인' }}
          </ion-button>
        </form>

        <form v-else class="step-card" @submit.prevent="submitGender">
          <p class="eyebrow">필수 기본 정보</p>
          <h1>성별을 선택해 주세요</h1>
          <p class="description">매칭과 프로필 제공에 사용되는 필수 정보입니다.</p>

          <div class="gender-grid" role="radiogroup" aria-label="성별 선택">
            <button
              v-for="option in genderOptions"
              :key="option.value"
              type="button"
              class="gender-option"
              :class="{ selected: gender === option.value }"
              role="radio"
              :aria-checked="gender === option.value"
              @click="gender = option.value"
            >
              <span>{{ option.label }}</span>
              <small>{{ gender === option.value ? '선택됨' : '선택' }}</small>
            </button>
          </div>
          <p v-if="message" class="error" role="alert">{{ message }}</p>

          <ion-button type="submit" expand="block" :disabled="submitting || !gender">
            {{ submitting ? '저장 중…' : '완료하고 시작하기' }}
          </ion-button>
        </form>

        <button v-if="!loading && !loadError" class="text-button logout" type="button" :disabled="submitting" @click="logout">
          로그아웃
        </button>
      </main>

      <Teleport to="body">
        <div v-if="confirmOpen" class="confirm-overlay" @click.self="closeBirthYearConfirm">
          <section
            class="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="birth-year-confirm-title"
          >
            <div class="confirm-handle" aria-hidden="true"></div>
            <p class="confirm-label">출생연도 확인</p>
            <h2 id="birth-year-confirm-title">{{ birthYear }}년생이 맞습니까?</h2>
            <p>저장 후에는 직접 변경할 수 없습니다.</p>
            <div class="confirm-actions">
              <button type="button" class="confirm-cancel" :disabled="submitting" @click="closeBirthYearConfirm">
                다시 입력
              </button>
              <button type="button" class="confirm-primary" :disabled="submitting" @click="confirmBirthYear">
                {{ submitting ? '저장 중…' : '맞습니다' }}
              </button>
            </div>
          </section>
        </div>
      </Teleport>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { IonButton, IonContent, IonPage, IonSpinner } from '@ionic/vue'
import { useRoute, useRouter } from 'vue-router'
import { auth as AuthAPI, onboarding, type OnboardingStep } from '@/shared/services/api'
import { useUserStore } from '@/shared/stores/user'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const loading = ref(true)
const submitting = ref(false)
const loadError = ref('')
const message = ref('')
const step = ref<Exclude<OnboardingStep, 'complete'>>('birthDate')
const birthYear = ref('')
const confirmOpen = ref(false)
const gender = ref<'man' | 'woman' | ''>('')
const genderOptions = [
  { value: 'man' as const, label: '남성' },
  { value: 'woman' as const, label: '여성' },
]

const currentYear = Number(new Intl.DateTimeFormat('en', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
}).format(new Date()))
const isBirthYearValid = computed(() => {
  const year = Number(birthYear.value)
  return /^\d{4}$/.test(birthYear.value) && year >= 1900 && year <= currentYear - 19
})

function returnTarget() {
  const requested = typeof route.query.return === 'string' ? route.query.return : ''
  return requested.startsWith('/home') ? requested : '/home/6page'
}

function errorText(error: any, fallback: string) {
  return error?.response?.data?.message || fallback
}

async function complete() {
  await userStore.fetchMe({ force: true, silent: true })
  await router.replace(returnTarget())
}

async function load() {
  loading.value = true
  loadError.value = ''
  message.value = ''
  try {
    const status = await onboarding.status()
    if (status.complete || status.nextStep === 'complete') {
      await complete()
      return
    }
    step.value = status.nextStep
    if (status.gender) gender.value = status.gender
  } catch (error: any) {
    loadError.value = errorText(error, '필수 정보 상태를 확인하지 못했습니다.')
  } finally {
    loading.value = false
  }
}

function updateBirthYear(event: Event) {
  birthYear.value = String((event.target as HTMLInputElement)?.value || '')
    .replace(/\D/g, '')
    .slice(0, 4)
  message.value = ''
}

function submitBirthYear() {
  if (submitting.value) return
  if (!isBirthYearValid.value) {
    message.value = '이용 가능한 출생연도를 정확히 입력해 주세요.'
    return
  }
  confirmOpen.value = true
}

function closeBirthYearConfirm() {
  if (!submitting.value) confirmOpen.value = false
}

async function confirmBirthYear() {
  if (!isBirthYearValid.value || submitting.value) return
  submitting.value = true
  message.value = ''
  try {
    const status = await onboarding.saveBirthYear(Number(birthYear.value))
    confirmOpen.value = false
    step.value = status.nextStep === 'complete' ? 'gender' : status.nextStep
    if (status.complete) await complete()
  } catch (error: any) {
    message.value = errorText(error, '출생연도를 저장하지 못했습니다.')
    confirmOpen.value = false
  } finally {
    submitting.value = false
  }
}

async function submitGender() {
  if (!gender.value || submitting.value) return
  submitting.value = true
  message.value = ''
  try {
    const status = await onboarding.saveGender(gender.value)
    if (status.complete) await complete()
  } catch (error: any) {
    message.value = errorText(error, '성별을 저장하지 못했습니다.')
  } finally {
    submitting.value = false
  }
}

async function logout() {
  try {
    await AuthAPI.logout()
  } finally {
    userStore.clear()
    await router.replace('/login')
  }
}

onMounted(load)
</script>

<style scoped>
.onboarding-content { --background: #f5f1eb; }
.onboarding-shell {
  width: min(100% - 32px, 560px);
  min-height: 100%;
  margin: 0 auto;
  padding: calc(var(--safe-top) + 24px) 0 calc(var(--safe-bottom) + 32px);
  color: #24211f;
}
.onboarding-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 56px; }
.brand { color: #735625; font-size: 20px; font-weight: 900; letter-spacing: -.03em; }
.progress { color: #8b8178; font-size: 13px; font-weight: 700; }
.step-card, .state-panel {
  padding: clamp(24px, 6vw, 42px);
  border: 1px solid rgba(109, 91, 72, .13);
  border-radius: 28px;
  background: rgba(255, 255, 255, .94);
  box-shadow: 0 24px 70px rgba(60, 48, 36, .1);
}
.state-panel { text-align: center; }
.eyebrow { margin: 0 0 12px; color: #9b722d; font-size: 12px; font-weight: 900; letter-spacing: .08em; }
h1 { margin: 0; font-size: clamp(27px, 7vw, 38px); line-height: 1.2; letter-spacing: -.045em; }
.description { margin: 18px 0 34px; color: #746c65; font-size: 14px; line-height: 1.65; word-break: keep-all; }
.field-label { display: block; margin-bottom: 9px; font-size: 13px; font-weight: 800; }
.year-input {
  width: 100%;
  min-height: 56px;
  padding: 0 16px;
  border: 1px solid #d9d1c8;
  border-radius: 14px;
  background: #fff;
  color: #24211f;
  font: inherit;
  box-sizing: border-box;
}
.year-input:focus { border-color: #9b722d; outline: 3px solid rgba(155, 114, 45, .13); }
.field-note { margin: 10px 0 28px; color: #8b8178; font-size: 12px; line-height: 1.55; }
.gender-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 0 0 30px; }
.gender-option {
  display: flex;
  min-height: 112px;
  padding: 18px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  border: 1px solid #d9d1c8;
  border-radius: 18px;
  background: #fff;
  color: #24211f;
  cursor: pointer;
}
.gender-option span { font-size: 19px; font-weight: 900; }
.gender-option small { color: #8b8178; }
.gender-option.selected { border-color: #9b722d; background: #fbf5e9; box-shadow: inset 0 0 0 1px #9b722d; }
.gender-option.selected small { color: #8a6120; font-weight: 800; }
.error { margin: -12px 0 20px; padding: 11px 13px; border-radius: 12px; background: #fff0f0; color: #a33c43; font-size: 13px; }
.text-button { display: block; margin: 18px auto 0; border: 0; background: transparent; color: #756c64; text-decoration: underline; cursor: pointer; }
.logout { margin-top: 26px; }
ion-button { --background: #8a6327; --background-hover: #76521f; --border-radius: 14px; min-height: 52px; font-weight: 800; }
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 20000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(20px, var(--safe-top)) max(20px, var(--safe-right)) max(20px, var(--safe-bottom)) max(20px, var(--safe-left));
  background: rgba(32, 27, 22, .48);
  box-sizing: border-box;
}
.confirm-dialog {
  width: min(100%, 360px);
  max-height: calc(100dvh - var(--safe-top) - var(--safe-bottom) - 40px);
  padding: 28px;
  overflow: auto;
  border: 1px solid rgba(109, 91, 72, .14);
  border-radius: 24px;
  background: #fff;
  color: #24211f;
  box-shadow: 0 24px 80px rgba(32, 27, 22, .24);
  box-sizing: border-box;
}
.confirm-handle { display: none; }
.confirm-label { margin: 0 0 9px; color: #9b722d; font-size: 12px; font-weight: 900; }
.confirm-dialog h2 { margin: 0; font-size: 24px; line-height: 1.3; letter-spacing: -.035em; }
.confirm-dialog > p:last-of-type { margin: 12px 0 24px; color: #746c65; font-size: 14px; }
.confirm-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.confirm-actions button {
  min-height: 50px;
  padding: 10px 12px;
  border-radius: 14px;
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
}
.confirm-actions button:disabled { opacity: .55; cursor: default; }
.confirm-cancel { border: 1px solid #d9d1c8; background: #fff; color: #5e5751; }
.confirm-primary { border: 1px solid #8a6327; background: #8a6327; color: #fff; }
@media (max-width: 560px) {
  .onboarding-content { --background: #fff; }
  .onboarding-shell { width: 100%; padding: calc(var(--safe-top) + 20px) 20px calc(var(--safe-bottom) + 28px); box-sizing: border-box; }
  .onboarding-header { margin-bottom: 34px; }
  .step-card, .state-panel { padding: 0; border: 0; background: transparent; box-shadow: none; }
  .confirm-overlay {
    padding: max(12px, var(--safe-top)) max(12px, var(--safe-right)) max(12px, var(--safe-bottom)) max(12px, var(--safe-left));
  }
  .confirm-dialog {
    width: min(100%, 360px);
    max-height: calc(100dvh - var(--safe-top) - var(--safe-bottom) - 24px);
    padding: 20px;
    border-radius: 24px;
  }
}
</style>
