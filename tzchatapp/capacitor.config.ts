import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.tazocode.tzchat',
  appName: '손끝',
  webDir: 'dist',

  server: {
    // 기존 출시 빌드의 https://localhost 저장소(localStorage/IndexedDB)를 보존한다.
    // 앱 전용 hostname으로 바꾸려면 먼저 Origin 저장소 마이그레이션이 필요하다.
    hostname: 'localhost',
    androidScheme: 'https',
    cleartext: false,
  },

  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'banner', 'list'],
    },
    Keyboard: {
      resize: 'native',             // ✅ 안드로이드에서 가장 안정적 (ion-content 자동 리사이즈)
      resizeOnFullScreen: true,     // ✅ 전체화면 모드에서도 정상 리사이즈
      style: 'dark',                // 다크 테마 유지
    },
  },
}

export default config
