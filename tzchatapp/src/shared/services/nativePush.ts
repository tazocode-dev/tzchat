import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import { PushNotifications, type ActionPerformed, type PushNotificationSchema } from '@capacitor/push-notifications'
import api from '@/shared/services/api'
import router from '@/router'
import type { MeUser } from '@/shared/stores/user'
import { nativePushRoute } from '@/shared/services/nativePushRouting'
import { IosFcmToken } from '@/shared/plugins/iosFcmToken'
import {
  clearStoredNativePushToken,
  readStoredNativePushToken,
  writeStoredNativePushToken,
} from '@/shared/services/nativePushTokenStorage'

const CHANNEL_ID = 'tzchat_alerts_v2'
let initializedForUser = ''
let registrationAttempt: { userId: string; promise: Promise<'registered' | 'skipped'> } | null = null
let lifecycleGeneration = 0
let registeredTokenKey = ''
let storedNativeToken = ''
let iosTokenListener: PluginListenerHandle | null = null
const tokenRegistrationAttempts = new Map<string, Promise<boolean>>()

function notifyStateRefresh(notification?: PushNotificationSchema) {
  try {
    window.dispatchEvent(new CustomEvent('notifications:pushReceived', { detail: notification?.data || {} }))
  } catch {}
}

async function handleAction(action: ActionPerformed) {
  notifyStateRefresh(action.notification)
  await router.push(nativePushRoute(action.notification?.data || {}))
}

async function unregisterStoredToken() {
  let token = storedNativeToken
  token ||= readStoredNativePushToken()
  if (token) {
    try { await api.post('/api/push/unregister', { token }) } catch {}
    clearStoredNativePushToken()
  }
  storedNativeToken = ''
  registeredTokenKey = ''
}

async function removeIosTokenListener() {
  const listener = iosTokenListener
  iosTokenListener = null
  if (listener) {
    try { await listener.remove() } catch {}
  }
}

async function registerTokenForUser(
  token: string,
  user: MeUser,
  platform: 'android' | 'ios',
  generation: number,
): Promise<boolean> {
  const normalizedToken = String(token || '').trim()
  const userId = String(user._id || '')
  if (!normalizedToken || !userId || generation !== lifecycleGeneration) return false
  if (String(user.search_allowNotifications || '').toUpperCase() !== 'ON') return false

  const key = `${userId}:${normalizedToken}`
  if (registeredTokenKey === key) return true
  const pending = tokenRegistrationAttempts.get(key)
  if (pending) return pending

  const attempt = (async () => {
    await api.post('/api/push/register', {
      token: normalizedToken,
      platform,
      appVersion: __APP_VERSION__,
    })
    if (generation !== lifecycleGeneration) {
      try { await api.post('/api/push/unregister', { token: normalizedToken }) } catch {}
      return false
    }

    let previousToken = storedNativeToken
    previousToken ||= readStoredNativePushToken()
    storedNativeToken = normalizedToken
    writeStoredNativePushToken(normalizedToken)
    registeredTokenKey = key
    if (previousToken && previousToken !== normalizedToken) {
      try { await api.post('/api/push/unregister', { token: previousToken }) } catch {}
    }
    return true
  })().finally(() => {
    if (tokenRegistrationAttempts.get(key) === attempt) tokenRegistrationAttempts.delete(key)
  })
  tokenRegistrationAttempts.set(key, attempt)
  return attempt
}

async function registerEnabledNativePush(
  user: MeUser,
  platform: 'android' | 'ios',
  generation: number,
): Promise<'registered' | 'skipped'> {
  const userId = String(user._id)
  if (initializedForUser === userId) return 'registered'

  await PushNotifications.removeAllListeners()
  await removeIosTokenListener()
  if (platform === 'android') {
    await PushNotifications.addListener('registration', async ({ value }) => {
      if (!value) return
      try {
        await registerTokenForUser(value, user, platform, generation)
      } catch (error) {
        initializedForUser = ''
        console.warn('[NativePush] token registration failed:', error)
      }
    })
  } else {
    iosTokenListener = await IosFcmToken.addListener('tokenReceived', async ({ token }) => {
      try {
        const registered = await registerTokenForUser(token, user, platform, generation)
        if (registered) initializedForUser = userId
      } catch (error) {
        if (initializedForUser === userId) initializedForUser = ''
        console.warn('[NativePush] iOS FCM token refresh failed:', error)
      }
    })
  }
  await PushNotifications.addListener('registrationError', (error) => {
    console.warn('[NativePush] registration failed:', error.error)
  })
  await PushNotifications.addListener('pushNotificationReceived', notifyStateRefresh)
  await PushNotifications.addListener('pushNotificationActionPerformed', handleAction)

  if (platform === 'android') {
    await PushNotifications.createChannel({
      id: CHANNEL_ID,
      name: '메시지와 친구 알림',
      description: '새 채팅과 친구 관련 변경 알림',
      importance: 4,
      visibility: 0,
      sound: 'default',
      vibration: true,
      lights: true,
    })
  }

  let permission = await PushNotifications.checkPermissions()
  if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') {
    permission = await PushNotifications.requestPermissions()
  }
  if (generation !== lifecycleGeneration || permission.receive !== 'granted') return 'skipped'
  if (initializedForUser === userId) return 'registered'

  if (platform === 'android') {
    initializedForUser = userId
    try {
      await PushNotifications.register()
      return 'registered'
    } catch (error) {
      initializedForUser = ''
      throw error
    }
  }

  await PushNotifications.register()
  if (generation !== lifecycleGeneration) return 'skipped'
  const { token } = await IosFcmToken.getToken()
  const registered = await registerTokenForUser(token, user, platform, generation)
  if (!registered) return 'skipped'
  initializedForUser = userId
  return 'registered'
}

export async function registerNativePush(user: MeUser | null): Promise<'registered' | 'disabled' | 'skipped'> {
  const platform = Capacitor.getPlatform()
  if (!user?._id || !['android', 'ios'].includes(platform)) return 'skipped'

  if (String(user.search_allowNotifications || '').toUpperCase() !== 'ON') {
    lifecycleGeneration += 1
    const pending = registrationAttempt?.promise
    if (pending) await pending.catch(() => {})
    registrationAttempt = null
    initializedForUser = ''
    await unregisterStoredToken()
    await removeIosTokenListener()
    if (platform === 'ios') {
      try { await IosFcmToken.deleteToken() } catch {}
    }
    try { await PushNotifications.unregister() } catch {}
    try { await PushNotifications.removeAllListeners() } catch {}
    return 'disabled'
  }
  const userId = String(user._id)
  if (initializedForUser === userId) return 'registered'
  if (registrationAttempt?.userId === userId) return registrationAttempt.promise

  const generation = lifecycleGeneration
  const promise = registerEnabledNativePush(user, platform as 'android' | 'ios', generation)
  registrationAttempt = { userId, promise }
  try { return await promise }
  finally {
    if (registrationAttempt?.promise === promise) registrationAttempt = null
  }
}

export async function unregisterNativePush(): Promise<void> {
  lifecycleGeneration += 1
  const pending = registrationAttempt?.promise
  if (pending) await pending.catch(() => {})
  registrationAttempt = null
  initializedForUser = ''
  await unregisterStoredToken()
  const platform = Capacitor.getPlatform()
  await removeIosTokenListener()
  if (platform === 'ios') {
    try { await IosFcmToken.deleteToken() } catch {}
  }
  if (['android', 'ios'].includes(platform)) {
    try { await PushNotifications.unregister() } catch {}
    try { await PushNotifications.removeAllListeners() } catch {}
  }
}
