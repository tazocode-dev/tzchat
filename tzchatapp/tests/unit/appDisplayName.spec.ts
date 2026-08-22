// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const readBackend = (path: string) => readFileSync(resolve(process.cwd(), '../tzchatback', path), 'utf8')

describe('사용자 표시명', () => {
  test('Capacitor, Android, iOS 설치 표시명이 손끝이다', () => {
    const capacitor = read('capacitor.config.ts')
    const androidStrings = read('android/app/src/main/res/values/strings.xml')
    const iosInfo = read('ios/App/App/Info.plist')

    expect(capacitor).toMatch(/appName:\s*'손끝'/)
    expect(androidStrings).toMatch(/<string name="app_name">손끝<\/string>/)
    expect(androidStrings).toMatch(/<string name="title_activity_main">손끝<\/string>/)
    expect(iosInfo).toMatch(/<key>CFBundleDisplayName<\/key>\s*<string>손끝<\/string>/)
  })

  test('웹 탭과 PWA 표시명이 손끝이다', () => {
    const index = read('index.html')
    const manifest = JSON.parse(read('public/manifest.webmanifest'))

    expect(index).toContain('<title>손끝</title>')
    expect(index).toContain('name="apple-mobile-web-app-title" content="손끝"')
    expect(index).toContain('<link rel="manifest" href="/manifest.webmanifest" />')
    expect(manifest.name).toBe('손끝')
    expect(manifest.short_name).toBe('손끝')
  })

  test('로그인, 관리자 로그인, 온보딩, 앱 헤더의 표시명이 손끝이다', () => {
    const locale = JSON.parse(read('src/i18n/locales/ko.json'))
    const login = read('src/features/auth/pages/LoginPage.vue')
    const adminLogin = read('src/features/auth/pages/AdminLoginPage.vue')
    const onboarding = read('src/features/auth/pages/OnboardingPage.vue')
    const topPoint = read('src/layouts/TopPoint.vue')

    expect(locale.common.appName).toBe('손끝')
    expect(login).toContain('<h1>손끝</h1>')
    expect(adminLogin).toContain("t('common.appName')")
    expect(onboarding).toContain('<span class="brand">손끝</span>')
    expect(topPoint).toContain('<strong>손끝</strong>')
  })

  test('사용자 문의, 신고, 이메일과 푸시 제목이 손끝이다', () => {
    const userFacingSources = [
      read('src/features/settings/pages/SettingsPage.vue'),
      read('src/features/profile/pages/UserProfilePage.vue'),
      read('src/features/profile/pages/SpeedUserProfilePage.vue'),
      readBackend('src/services/push/sender.js'),
      readBackend('src/services/auth/emailVerificationService.js'),
      readBackend('src/services/auth/accountVerificationService.js'),
    ]

    expect(userFacingSources.join('\n')).not.toContain('TZChat')
    expect(userFacingSources.join('\n')).toContain('손끝 문의드립니다')
    expect(userFacingSources.join('\n')).toContain('손끝 사용자 신고')
    expect(userFacingSources.join('\n')).toContain('손끝 알림')
    expect(userFacingSources.join('\n')).toContain('손끝 이메일 인증번호')
  })

  test('법적 서비스명과 기술 식별자는 TZChat 계열을 유지한다', () => {
    const legals = read('src/features/legal/constants/legals.ts')
    const capacitor = read('capacitor.config.ts')
    const androidStrings = read('android/app/src/main/res/values/strings.xml')

    expect(legals).toContain('TZChat(손끝)')
    expect(capacitor).toContain("appId: 'com.tazocode.tzchat'")
    expect(androidStrings).toContain('<string name="package_name">com.tazocode.tzchat</string>')
    expect(androidStrings).toContain('<string name="custom_url_scheme">com.tazocode.tzchat</string>')
  })
})
