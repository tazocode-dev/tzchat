import type { Router } from 'vue-router'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { toastController } from '@ionic/vue'
import {
  createBackButtonHandler,
  createSingleBackButtonRegistration,
} from '@/shared/services/backButtonPolicy'

let registration: ReturnType<typeof createSingleBackButtonRegistration> | null = null

function dismissTopOverlay() {
  const overlays = Array.from(document.querySelectorAll<HTMLElement & {
    overlayIndex?: number
    dismiss?: () => Promise<boolean>
  }>(
    'ion-alert,ion-action-sheet,ion-loading,ion-modal,ion-picker-legacy,ion-popover,ion-toast:not(#android-exit-prompt)',
  )).filter((item) => Number(item.overlayIndex) > 0 && !item.classList.contains('overlay-hidden'))
  overlays.sort((left, right) => Number(left.overlayIndex) - Number(right.overlayIndex))
  const overlay = overlays[overlays.length - 1]
  if (!overlay) return Promise.resolve(false)
  return Promise.resolve(overlay.dismiss?.()).then(() => true, () => true)
}

function blurActiveInput() {
  const active = document.activeElement as HTMLElement | null
  const isInput = active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA' || active?.isContentEditable
  if (!active || !isInput) return false
  try { active.blur() } catch {}
  return true
}

export function setupAndroidBackButton(router: Router) {
  if (typeof window === 'undefined' || typeof document === 'undefined' || registration) return

  const handler = createBackButtonHandler({
    getPath: () => router.currentRoute.value.path || '',
    hasInternalHistory: () => router.options.history.state.back != null,
    dismissTopOverlay,
    blurActiveInput,
    goBack: () => router.back(),
    goHome: () => { router.replace('/home/6page').catch(() => {}) },
    showExitPrompt: async () => {
      const toast = await toastController.create({
        id: 'android-exit-prompt',
        message: '한 번 더 누르면 앱이 종료됩니다.',
        duration: 2_000,
        position: 'bottom',
      })
      await toast.present()
    },
    exitApp: () => { CapApp.exitApp() },
  })

  registration = createSingleBackButtonRegistration({
    shouldRegister: () => Capacitor.getPlatform() === 'android',
    addListener: () => CapApp.addListener('backButton', handler),
  })
  registration.setup()
}

export function teardownAndroidBackButton() {
  registration?.teardown()
  registration = null
}
