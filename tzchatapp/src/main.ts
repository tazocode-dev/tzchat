// src/main.ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { IonicVue } from '@ionic/vue'
import i18n from '@/i18n'
import router from './router'

// 🔔 Web/PWA 푸시 등록
import { registerWebPush, unregisterWebPushAll } from '@/shared/services/webPush'
import { registerNativePush, unregisterNativePush } from '@/shared/services/nativePush'
import { nativePushRoute } from '@/shared/services/nativePushRouting'

// ✅ 소켓 유틸
import { connectSocket, disconnectSocket, getSocket } from '@/shared/services/socket'

// ✅ 사용자 스토어(인증 상태·소켓 바인딩용)
import { useUserStore, type AuthBootstrapResult } from '@/shared/stores/user'

import { App as CapApp } from '@capacitor/app'

// ✅ 구글플레이 업데이트 유도(스토어 열기)
import { checkAndPromptStoreUpdate } from '@/shared/services/appUpdate'

/* Ionicons */
import { addIcons } from 'ionicons'
import {
  warningOutline,
  locateOutline,
  peopleOutline,
  chatbubblesOutline,
  personCircleOutline,
  settingsOutline,
} from 'ionicons/icons'
addIcons({
  warningOutline,
  locateOutline,
  peopleOutline,
  chatbubblesOutline,
  personCircleOutline,
  settingsOutline,
})

/* Ionic CSS들 */
import '@ionic/vue/css/core.css'
import '@ionic/vue/css/normalize.css'
import '@ionic/vue/css/structure.css'
import '@ionic/vue/css/typography.css'
import '@ionic/vue/css/padding.css'
import '@ionic/vue/css/float-elements.css'
import '@ionic/vue/css/text-alignment.css'
import '@ionic/vue/css/text-transformation.css'
import '@ionic/vue/css/flex-utils.css'
import '@ionic/vue/css/display.css'

/* ✅ 프로젝트 공통 스타일 */
import '@/shared/theme/variables.css'
import '@/shared/theme/mobile-utilities.css'
import '@/shared/theme/theme-gold.css'

import 'emoji-picker-element'

const IS_DEV = import.meta.env.DEV

/* =======================
// 🔌 소켓 부트스트랩 가드
/* ===================== */
declare global {
  interface Window {
    __TZCHAT_SOCKET_BOOTSTRAPPED__?: boolean
  }
}

/** ✅ 스토어-소켓 바인딩을 보장 (중복 바인딩 방지) */
function ensureBindUserStoreToSocket() {
  const sock = getSocket()
  if (!sock) return
  const store = useUserStore()
  // @ts-ignore
  store.bindSocket?.(sock)
}

async function bootstrapSocketOnce(auth: AuthBootstrapResult) {
  if (auth.status !== 'authenticated' || !auth.user) return
  if (window.__TZCHAT_SOCKET_BOOTSTRAPPED__) {
    ensureBindUserStoreToSocket()
    return
  }
  if (getSocket()) {
    window.__TZCHAT_SOCKET_BOOTSTRAPPED__ = true
    ensureBindUserStoreToSocket()
    return
  }
  try {
    connectSocket()
    window.__TZCHAT_SOCKET_BOOTSTRAPPED__ = true
    ensureBindUserStoreToSocket()
  } catch (e: any) {
    console.warn('⚠️ [Socket] bootstrap error:', e?.message)
  }
}

/** ✅ 백그라운드 실행(첫 렌더 방해 금지) */
function runInBackground(fn: () => void, delayMs = 0) {
  // @ts-ignore
  const ric = (window as any).requestIdleCallback as undefined | ((cb: Function, opts?: any) => any)
  if (ric) {
    ric(() => fn(), { timeout: 1200 })
    return
  }
  setTimeout(fn, delayMs)
}

/* =======================
// 앱 부트
/* ===================== */
const app = createApp(App)
const pinia = createPinia()

app.use(IonicVue, { mode: 'md' })
app.use(pinia)
app.use(router)
app.use(i18n)

// ✅ store는 app.use(pinia) 이후 생성해야 안전
const userStore = useUserStore()

let authServicesInFlight: Promise<void> | null = null

function startAuthenticatedServices(forceAuth = false): Promise<void> {
  if (authServicesInFlight) return authServicesInFlight
  authServicesInFlight = (async () => {
    const auth = await userStore.bootstrapAuth({ force: forceAuth, silent: true })
    if (auth.status !== 'authenticated' || !auth.user) return
    await bootstrapSocketOnce(auth)
    await Promise.all([registerWebPush(auth.user), registerNativePush(auth.user)])
  })()
    .catch((err) => console.error('인증 기반 서비스 초기화 실패:', err))
    .finally(() => { authServicesInFlight = null })
  return authServicesInFlight
}

window.addEventListener('auth:credentials-changed', (event: Event) => {
  const cleared = (event as CustomEvent)?.detail?.cleared === true
  if (cleared) {
    userStore.clear()
    disconnectSocket()
    window.__TZCHAT_SOCKET_BOOTSTRAPPED__ = false
    Promise.allSettled([unregisterWebPushAll(), unregisterNativePush()]).catch(() => {})
    return
  }
  runInBackground(() => { startAuthenticatedServices(true).catch(() => {}) }, 0)
})

router.isReady()
  .then(() => {
    // ✅ 1) 무조건 먼저 mount → 첫 화면 즉시
    app.mount('#app')

    // ✅ 2) 앱 시작 직후 1회 스토어 업데이트 체크
    setTimeout(() => {
      checkAndPromptStoreUpdate({ confirm: true }).catch(() => {})
    }, 700)

    // ✅ 3) resume 때 업데이트 체크
    try {
      CapApp.addListener('resume', () => {
        setTimeout(() => {
          checkAndPromptStoreUpdate({ confirm: true }).catch(() => {})
        }, 250)
      })
    } catch {}

    // ✅ 4) 딥링크 처리 (mount 이후 등록)
    try {
      CapApp.addListener('appUrlOpen', async ({ url }) => {
        try {
          if (!url) return

          if (url.startsWith('tzchat://')) {
            const target = nativePushRoute({ deeplink: url })
            await router.push(target)
            const tab = new URLSearchParams(target.split('?')[1] || '').get('tab')
            if (tab) {
              window.dispatchEvent(new CustomEvent('friends:openTab', { detail: { tab } }))
            }
            if (IS_DEV) console.log('[DEEPLINK] handled:', url, '→', target)
          }
        } catch (e: any) {
          console.warn('[DEEPLINK] handle error:', e?.message)
        }
      })
    } catch {}

    // ✅ 5) 라우터와 공유한 인증 결과로 소켓·푸시를 백그라운드 초기화
    runInBackground(() => {
      startAuthenticatedServices().catch(() => {})
    }, 0)
  })
  .catch((err) => {
    console.error('💥 router.isReady() 실패:', err)
  })
