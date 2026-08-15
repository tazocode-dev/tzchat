<!-- src/components/SettingsSections.vue -->
<template>
  <section class="settings-page" role="region" aria-label="설정">
    <header class="settings-header">
      <button type="button" class="back-button" @click="goBack" aria-label="뒤로가기">
        <ion-icon :icon="icons.arrowBackOutline" />
      </button>

      <div class="header-copy">
        <p>SETTINGS</p>
        <h1>설정</h1>
        <span>{{ nickname }}님의 계정과 앱 환경을 관리하세요.</span>
      </div>

      <ion-button
        v-if="meRole === 'master'"
        size="small"
        class="admin-btn"
        @click="goAdmin"
      >
        <ion-icon :icon="icons.settingsOutline" slot="start" />
        관리자
      </ion-button>
    </header>

    <div class="page-wrap">
      <div class="list-wrap">
        <p class="section-label">인증정보</p>
        <ul class="list auth-list">
          <li>
            <button class="list-item" type="button" @click="goAuthInfo('phone')">
              <span class="item-icon"><ion-icon :icon="icons.callOutline" /></span>
              <span class="item-copy">
                <strong>전화번호</strong>
                <small>{{ me?.phoneMasked || '미등록' }}</small>
              </span>
              <span class="item-action">{{ me?.phoneVerifiedAt ? '번호변경' : '인증하기' }}</span>
            </button>
          </li>
          <li>
            <button class="list-item" type="button" @click="goAuthInfo('email')">
              <span class="item-icon"><ion-icon :icon="icons.shieldCheckmarkOutline" /></span>
              <span class="item-copy">
                <strong>이메일</strong>
                <small>{{ me?.email || '미등록' }}</small>
              </span>
              <span class="item-action">{{ me?.emailVerifiedAt ? '수정하기' : '인증하기' }}</span>
            </button>
          </li>
        </ul>

        <p class="section-label">서비스</p>
      <ul class="list">
          <li>
            <button class="list-item" type="button" @click="goPage('/home/setting/0001')">
              <span class="item-icon"><ion-icon :icon="icons.megaphoneOutline" /></span>
              <span>공지사항</span>
              <ion-icon :icon="icons.chevronForwardOutline" class="chevron" />
            </button>
          </li>
          <li>
            <button class="list-item" type="button" @click="openSupportMail">
              <span class="item-icon"><ion-icon :icon="icons.mailOutline" /></span>
              <span>문의·건의하기</span>
              <ion-icon :icon="icons.chevronForwardOutline" class="chevron" />
            </button>
          </li>
          <li>
            <button class="list-item" type="button" @click="goPage('/home/legals/v2')">
              <span class="item-icon"><ion-icon :icon="icons.documentTextOutline" /></span>
              <span>약관 및 법적 안내</span>
              <ion-icon :icon="icons.chevronForwardOutline" class="chevron" />
            </button>
          </li>
          <li>
            <button class="list-item" type="button" @click="goPage('/home/setting/0019')">
              <span class="item-icon"><ion-icon :icon="icons.keyOutline" /></span>
              <span>비밀번호 변경</span>
              <ion-icon :icon="icons.chevronForwardOutline" class="chevron" />
            </button>
          </li>
      </ul>

        <p class="section-label section-label--account">계정</p>
        <div class="account-actions">
          <button type="button" class="account-button" @click="logout">
            <ion-icon :icon="icons.logOutOutline" />
            로그아웃
          </button>
          <button type="button" class="account-button account-button--danger" @click="goPage('/home/setting/0020')">
            <ion-icon :icon="icons.personRemoveOutline" />
            회원탈퇴
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { IonButton, IonIcon } from '@ionic/vue'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import packageInfo from '../../../../package.json'
import {
  arrowBackOutline,
  callOutline,
  chevronForwardOutline,
  documentTextOutline,
  keyOutline,
  logOutOutline,
  mailOutline,
  megaphoneOutline,
  personRemoveOutline,
  settingsOutline,
  shieldCheckmarkOutline,
} from 'ionicons/icons'
import { api, AuthAPI } from '@/shared/services/api'

const router = useRouter()
const icons = {
  arrowBackOutline,
  callOutline,
  chevronForwardOutline,
  documentTextOutline,
  keyOutline,
  logOutOutline,
  mailOutline,
  megaphoneOutline,
  personRemoveOutline,
  settingsOutline,
  shieldCheckmarkOutline,
}

const nickname = ref('')
const meRole = ref('')
const me = ref<Record<string, any> | null>(null)

async function loadMe() {
  const meRes = await api.get('/api/me')
  me.value = meRes.data?.user || null
  nickname.value = me.value?.nickname || ''
  meRole.value = me.value?.role || ''
}

onMounted(async () => {
  try {
    await loadMe()
    console.log('[SettingsSections] me:', { nickname: nickname.value, role: meRole.value })
  } catch (err) {
    console.error('❌ GET /me 실패:', err)
  }
})

const goPage = (path: string) => router.push(path)
const goAuthInfo = (mode: 'email' | 'phone') => router.push({ path: '/home/setting/0021', query: { mode } })
const goAdmin = () => router.push('/home/admin')

const logout = async () => {
  try {
    await AuthAPI.logout()
    router.push('/login')
  } catch (err) {
    console.error('❌ 로그아웃 실패:', err)
  }
}

/* -------------------- 메일 바로 열기 -------------------- */
function getUserId() { return String(me.value?._id || me.value?.username || '확인 불가') }
function getNickname() { return String(me.value?.nickname || '미설정') }
function detectOS() {
  const ua = navigator.userAgent || ''
  if (/android/i.test(ua)) return 'Android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS'
  return 'Web'
}
async function getAppVersion() {
  if (!Capacitor.isNativePlatform()) return String(packageInfo.version || 'web')
  try {
    const info = await App.getInfo()
    return info.version || String((info as any).build) || String(packageInfo.version || '확인 불가')
  } catch {
    return String(packageInfo.version || '확인 불가')
  }
}

async function openSupportMail() {
  if (!me.value) {
    try { await loadMe() }
    catch (err) { console.error('❌ 문의 사용자 정보 조회 실패:', err) }
  }
  const email = 'tazocode@gmail.com'
  const subject = 'TZChat 문의드립니다'
  const [appVersion, os, uid, nick] = await Promise.all([
    getAppVersion(),
    Promise.resolve(detectOS()),
    Promise.resolve(getUserId()),
    Promise.resolve(getNickname()),
  ])
  const body = [
    '문의 내용:',
    '',
    '--- 사용자 정보 ---',
    `아이디: ${uid}`,
    `닉네임: ${nick}`,
    '',
    '--- 앱/환경 정보 ---',
    `앱 버전: ${appVersion}`,
    `OS: ${os}`,
    '',
    '--- 작성 ---',
  ].join('\n')
  const href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  window.location.href = href
}

const goBack = () => {
  router.back()
}
</script>

<style scoped>
.settings-page {
  width: min(100%, 720px);
  min-height: 100%;
  margin: 0 auto;
  color: var(--text);
}

.settings-header {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
  padding: 8px 2px 22px;
}

.back-button {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 1px solid var(--panel-border);
  border-radius: 14px;
  background: var(--panel);
  color: var(--text);
  box-shadow: var(--shadow-xs);
  cursor: pointer;
}

.back-button ion-icon { font-size: 19px; }

.header-copy p {
  margin: 1px 0 3px;
  color: var(--gold);
  font-size: 9px;
  font-weight: 850;
  letter-spacing: .14em;
}

.header-copy h1 {
  margin: 0;
  color: var(--text-strong);
  font-size: 27px;
  line-height: 1.2;
  letter-spacing: -.045em;
}

.header-copy span {
  display: block;
  margin-top: 7px;
  color: var(--text-dim);
  font-size: 12px;
  line-height: 1.45;
}

.admin-btn {
  --background: var(--panel-soft);
  --color: var(--gold-strong);
  --box-shadow: none;
  --padding-start: 10px;
  --padding-end: 10px;
  min-height: 38px;
  margin: 2px 0 0;
  font-size: 11px;
}

.page-wrap { min-height: 100%; padding: 0 2px 24px; box-sizing: border-box; }
.list-wrap { width: 100%; margin: 0 auto; }
.section-label {
  margin: 0 0 8px 4px;
  color: var(--text-faint);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .08em;
}
.section-label--account { margin-top: 26px; }
.auth-list { margin-bottom: 26px; }
.list { list-style: none; margin: 0; padding: 0; }
.list > li + li { border-top: 1px solid var(--panel-border); }
.list {
  overflow: hidden;
  border: 1px solid var(--panel-border);
  border-radius: 20px;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}
.list-item {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 64px;
  padding: 10px 14px;
  background: transparent;
  border: 0;
  color: var(--text);
  font-size: 14px;
  font-weight: 720;
  text-align: left;
  cursor: pointer; user-select: none;
  transition: background .18s, transform .06s;
}
.list-item:hover { background: var(--panel-soft); }
.list-item:active { transform: translateY(1px); }

.item-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: var(--panel-soft);
  color: var(--gold);
}

.item-icon ion-icon { font-size: 18px; }
.chevron { color: var(--text-faint); font-size: 17px; }
.item-copy { display: grid; gap: 4px; min-width: 0; }
.item-copy strong { font-size: 14px; font-weight: 760; }
.item-copy small { overflow: hidden; color: var(--text-dim); font-size: 12px; font-weight: 560; text-overflow: ellipsis; white-space: nowrap; }
.item-action { color: var(--gold-strong); font-size: 12px; font-weight: 800; white-space: nowrap; }

.account-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.account-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 48px;
  border: 1px solid var(--panel-border);
  border-radius: 15px;
  background: var(--panel);
  color: var(--text-dim);
  font-size: 13px;
  font-weight: 750;
  cursor: pointer;
}

.account-button--danger { border-color: #ebd0d1; background: #fff6f6; color: var(--danger); }

@media (max-width: 360px) {
  .settings-header { grid-template-columns: 40px minmax(0, 1fr); }
  .admin-btn { grid-column: 2; justify-self: start; margin-top: 0; }
  .account-actions { grid-template-columns: 1fr; }
}
</style>
