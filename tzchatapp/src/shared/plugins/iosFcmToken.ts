import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

interface FcmTokenResult {
  token: string
}

interface IosFcmTokenPlugin {
  getToken(): Promise<FcmTokenResult>
  deleteToken(): Promise<void>
  addListener(
    eventName: 'tokenReceived',
    listener: (result: FcmTokenResult) => void,
  ): Promise<PluginListenerHandle>
}

export const IosFcmToken = registerPlugin<IosFcmTokenPlugin>('IosFcmToken')
