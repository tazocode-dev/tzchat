// Web/PWA push registration. Native Capacitor push uses a separate path.
import { Capacitor } from '@capacitor/core'
import api from '@/shared/services/api'
import type { MeUser } from '@/shared/stores/user'
import { registerNativePush, unregisterNativePush } from '@/shared/services/nativePush'

import { getApp, getApps, initializeApp } from 'firebase/app'
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: 'AIzaSyAxijk1sRxkzG7MwCA18Rtm7yErXVW59YI',
  authDomain: 'tzchat-eb893.firebaseapp.com',
  projectId: 'tzchat-eb893',
  storageBucket: 'tzchat-eb893.appspot.com',
  messagingSenderId: '565729575217',
  appId: '1:565729575217:web:5ba67d38c4f82302c13010',
  measurementId: 'G-G7263X06SP',
}

const VAPID_KEY =
  'BJ_B1iqArRIkGPUAJ52MU8xgq624Vcy9FjAkODOO5OL35JBt3J7bd1V_bIx_Z3sIXQxbjAuX-i_fDt2Boieb4ls'
const OPT_KEY = 'TZCHAT_NOTIFY_OPT_OUT'
const WEB_PUSH_TOKEN_KEY = 'TZCHAT_WEB_PUSH_TOKEN'
const FIREBASE_SW_FILE = '/firebase-messaging-sw.js'
const FIREBASE_CACHE_PATTERN = /firebase|messaging|fcm/i

export type WebPushInitResult = 'registered' | 'disabled' | 'skipped' | 'failed'

let registrationInFlight: Promise<WebPushInitResult> | null = null
let foregroundListenerBound = false
let lastAuthenticatedUser: MeUser | null = null

function isFirebaseMessagingRegistration(reg: ServiceWorkerRegistration): boolean {
  const scriptUrls = [reg.active?.scriptURL, reg.waiting?.scriptURL, reg.installing?.scriptURL]
    .filter((value): value is string => !!value)
  return scriptUrls.some((url) => {
    try { return new URL(url).pathname === FIREBASE_SW_FILE }
    catch { return url.includes('firebase-messaging-sw.js') }
  })
}

async function getFirebaseRegistrations(): Promise<ServiceWorkerRegistration[]> {
  if (!('serviceWorker' in navigator)) return []
  const regs = await navigator.serviceWorker.getRegistrations()
  return regs.filter(isFirebaseMessagingRegistration)
}

/** Only Firebase messaging registrations/subscriptions/caches are removed. */
async function cleanupFirebaseWebPushArtifacts(removeServerToken = true): Promise<void> {
  try {
    const regs = await getFirebaseRegistrations()
    for (const reg of regs) {
      try {
        const sub = await reg.pushManager.getSubscription()
        if (sub) await sub.unsubscribe()
      } catch {}
      await reg.unregister()
    }

    if ('caches' in window) {
      const keys = await caches.keys()
      const firebaseKeys = keys.filter((key) => FIREBASE_CACHE_PATTERN.test(key))
      await Promise.all(firebaseKeys.map((key) => caches.delete(key)))
    }

    if (removeServerToken) {
      let token = ''
      try { token = localStorage.getItem(WEB_PUSH_TOKEN_KEY) || '' } catch {}
      if (token) {
        try {
          await api.post('/api/push/unregister', { token }, { withCredentials: true })
        } catch {}
      }
      try { localStorage.removeItem(WEB_PUSH_TOKEN_KEY) } catch {}
    }
  } catch (e: any) {
    console.warn('[WebPush] cleanup error:', e?.message)
  }
}

async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

async function registerForAuthenticatedUser(user: MeUser | null): Promise<WebPushInitResult> {
  if (!user?._id || Capacitor.getPlatform() !== 'web') return 'skipped'
  lastAuthenticatedUser = user

  const notificationSetting = String(user.search_allowNotifications || '').toUpperCase()
  if (notificationSetting === 'OFF') {
    await cleanupFirebaseWebPushArtifacts(true)
    return 'disabled'
  }
  if (notificationSetting !== 'ON') return 'skipped'

  try {
    if (!(await isSupported()) || !('serviceWorker' in navigator)) return 'skipped'
    if (!(await ensureNotificationPermission())) return 'skipped'

    const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig)
    const messaging = getMessaging(firebaseApp)
    const reg = await navigator.serviceWorker.register(FIREBASE_SW_FILE)

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: reg,
    }).catch((e) => {
      console.error('[WebPush] getToken error:', e)
      return null
    })
    if (!token) return 'failed'
    try { localStorage.setItem(WEB_PUSH_TOKEN_KEY, token) } catch {}

    try {
      await api.post(
        '/api/push/register',
        {
          token,
          platform: 'web',
          appVersion: __APP_VERSION__,
        },
        { withCredentials: true }
      )
    } catch (err: any) {
      console.error('[WebPush] backend register failed:', err?.response?.status || err?.message)
      await cleanupFirebaseWebPushArtifacts(false)
      return 'failed'
    }

    if (!foregroundListenerBound) {
      foregroundListenerBound = true
      onMessage(messaging, (payload) => {
        try {
          const title = payload?.notification?.title || (payload as any)?.data?.title || '알림'
          const body = payload?.notification?.body || (payload as any)?.data?.body || ''
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification(title, { body })
          }
        } catch {}
      })
    }
    return 'registered'
  } catch (err) {
    console.error('[WebPush] init error:', err)
    return 'failed'
  }
}

/** Uses an already authenticated /api/me profile; this function never fetches it itself. */
export function registerWebPush(user: MeUser | null): Promise<WebPushInitResult> {
  if (registrationInFlight) return registrationInFlight
  registrationInFlight = registerForAuthenticatedUser(user)
    .finally(() => { registrationInFlight = null })
  return registrationInFlight
}

/** Explicit cleanup API, scoped to Firebase Web Push artifacts only. */
export async function unregisterWebPushAll(): Promise<void> {
  await cleanupFirebaseWebPushArtifacts(true)
}

/**
 * optOut=true stores OFF and performs scoped Firebase cleanup.
 * optOut=false stores ON and reuses the caller-provided or last authenticated profile.
 */
export async function setNotificationsOptOut(optOut: boolean, user?: MeUser | null): Promise<void> {
  await api.patch(
    '/api/search/settings',
    { allowNotifications: optOut ? 'OFF' : 'ON' },
    { withCredentials: true }
  )
  try { localStorage.setItem(OPT_KEY, optOut ? '1' : '0') } catch {}

  if (optOut) {
    const results = await Promise.allSettled([unregisterWebPushAll(), unregisterNativePush()])
    results.forEach((result) => {
      if (result.status === 'rejected') console.warn('[Push] notification cleanup failed:', result.reason)
    })
    return
  }

  const profile = user ?? lastAuthenticatedUser
  if (profile?._id) {
    const enabledProfile = { ...profile, search_allowNotifications: 'ON' }
    const results = await Promise.allSettled([registerWebPush(enabledProfile), registerNativePush(enabledProfile)])
    results.forEach((result) => {
      if (result.status === 'rejected') console.warn('[Push] notification registration failed:', result.reason)
    })
  }
}
