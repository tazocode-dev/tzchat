// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('무료 초기 운영 광고 SDK 제외', () => {
  test('프론트와 iOS 네이티브 의존성에 Google Mobile Ads가 연결되지 않는다', () => {
    const packageJson = JSON.parse(read('package.json'))
    const nativeSources = [
      read('package-lock.json'),
      read('ios/App/Podfile'),
      read('ios/App/Podfile.lock'),
      read('ios/App/App/Info.plist'),
    ].join('\n')

    expect(packageJson.dependencies['@capacitor-community/admob']).toBeUndefined()
    expect(nativeSources).not.toMatch(/CapacitorCommunityAdmob|Google-Mobile-Ads-SDK|GADApplicationIdentifier/)
  })

  test('Android 광고 플러그인과 앱 ID를 제외하고 최종 매니페스트에서 광고 ID 권한을 제거한다', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml')
    const nativeSources = [
      read('android/capacitor.settings.gradle'),
      read('android/app/capacitor.build.gradle'),
      read('android/app/proguard-rules.pro'),
      read('android/app/src/main/res/values/strings.xml'),
    ].join('\n')

    expect(nativeSources).not.toMatch(/capacitor-community-admob|community\.admob/)
    expect(nativeSources).not.toMatch(/com\.google\.android\.gms\.ads\.APPLICATION_ID|admob_app_id/)
    expect(manifest).not.toMatch(/com\.google\.android\.gms\.ads\.APPLICATION_ID|admob_app_id/)
    expect(manifest).toMatch(
      /android:name="com\.google\.android\.gms\.permission\.AD_ID"\s+tools:node="remove"/,
    )
    expect(manifest).toMatch(
      /android:name="android\.permission\.ACCESS_ADSERVICES_AD_ID"\s+tools:node="remove"/,
    )
  })
})
