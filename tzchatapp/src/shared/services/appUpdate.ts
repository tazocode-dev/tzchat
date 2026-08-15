// src/lib/appUpdate.ts
import { Capacitor } from '@capacitor/core'
import { AppUpdate, AppUpdateAvailability } from '@capawesome/capacitor-app-update'
import { alertController } from '@ionic/vue'

/**
 * 앱 실행 시 업데이트가 있으면:
 *  - 사용자에게 알림 표시
 *  - "업데이트" 누르면 Play Store 앱의 해당 앱 페이지로 이동 (Update 버튼 노출)
 *
 * 참고:
 * - Google Play의 업데이트 감지는 "사용자 기기 Play Store가 업데이트를 인지한 상태"에 따라
 *   약간 지연될 수 있습니다. (특히 막 배포 직후)
 */
export async function checkAndPromptStoreUpdate(options?: {
  /** true면 무조건 스토어로 보내지 않고, 사용자 확인 후 이동 */
  confirm?: boolean
  /** 알림 제목 */
  title?: string
  /** 알림 메시지 */
  message?: string
}) {
  // 웹(브라우저)에서는 아무 것도 하지 않음
  if (!Capacitor.isNativePlatform()) return
  if (Capacitor.getPlatform() !== 'android') return

  const confirm = options?.confirm ?? true
  const title = options?.title ?? '업데이트 알림'
  const message =
    options?.message ??
    '새 버전이 출시되었습니다.\n원활한 이용을 위해 구글 플레이에서 업데이트 해주세요.'

  try {
    const info = await AppUpdate.getAppUpdateInfo()

    const hasUpdate =
      info.updateAvailability === AppUpdateAvailability.UPDATE_AVAILABLE

    if (!hasUpdate) return

    // 1) 사용자 확인 없이 즉시 스토어 이동(원하면 confirm=false로)
    if (!confirm) {
      await AppUpdate.openAppStore()
      return
    }

    // 2) 사용자 확인 후 이동
    const alert = await alertController.create({
      header: title,
      message: message.replace(/\n/g, '<br/>'),
      backdropDismiss: false,
      buttons: [
        {
          text: '나중에',
          role: 'cancel',
        },
        {
          text: '업데이트',
          handler: async () => {
            try {
              await AppUpdate.openAppStore()
            } catch (e) {
              console.warn('[AppUpdate] openAppStore failed', e)
            }
          },
        },
      ],
    })

    await alert.present()
  } catch (e) {
    // 업데이트 체크 실패는 앱 사용을 막지 않도록 조용히 무시
    console.warn('[AppUpdate] check failed', e)
  }
}
