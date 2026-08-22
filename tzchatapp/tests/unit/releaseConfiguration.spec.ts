// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('출시 설정', () => {
  test('Android는 연락처를 읽기만 하고 앱 데이터 백업을 차단한다', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml')
    const appGradle = read('android/app/build.gradle')
    const versions = read('android/variables.gradle')
    const extractionRules = read('android/app/src/main/res/xml/data_extraction_rules.xml')

    expect(manifest).toContain('android.permission.READ_CONTACTS')
    expect(manifest).not.toContain('android.permission.WRITE_CONTACTS')
    expect(manifest).toContain('android:allowBackup="false"')
    expect(manifest).toContain('android:fullBackupContent="false"')
    expect(manifest).toContain('android:dataExtractionRules="@xml/data_extraction_rules"')
    expect(extractionRules).toContain('<cloud-backup')
    expect(extractionRules).toContain('<device-transfer>')
    expect(versions).toContain('compileSdkVersion = 36')
    expect(versions).toContain('targetSdkVersion = 36')
    expect(appGradle).not.toContain('testInstrumentationRunner')
    expect(appGradle).not.toContain('testImplementation')
    expect(appGradle).not.toContain('androidTestImplementation')
    expect(existsSync(resolve(process.cwd(), 'android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java'))).toBe(false)
    expect(existsSync(resolve(process.cwd(), 'android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java'))).toBe(false)
  })

  test('네이티브 키보드는 밝은 앱 테마를 사용한다', () => {
    const capacitorConfig = read('capacitor.config.ts')

    expect(capacitorConfig).toContain("style: 'light'")
    expect(capacitorConfig).not.toContain("style: 'dark'")
  })

  test('Android release 작업은 완전한 서명 설정과 실제 키스토어를 필수로 요구한다', () => {
    const appGradle = read('android/app/build.gradle')

    expect(appGradle).toContain('gradle.startParameter.taskNames.any')
    expect(appGradle).toContain('contains("release")')
    expect(appGradle).toContain("['storeFile', 'storePassword', 'keyAlias', 'keyPassword']")
    expect(appGradle).toContain('!keystorePropertiesFile.exists()')
    expect(appGradle).toContain('missingSigningProperties.isEmpty()')
    expect(appGradle).toContain('!releaseKeystoreFile.isFile()')
    expect(appGradle.match(/throw new GradleException/g)).toHaveLength(3)
    expect(appGradle).toContain('signingConfig signingConfigs.release')
    expect(appGradle).not.toContain('무서명 빌드')
  })

  test('PWA manifest는 배포되는 PNG 아이콘과 standalone 정보를 사용한다', () => {
    const manifest = JSON.parse(read('public/manifest.webmanifest'))

    expect(manifest).toMatchObject({
      id: '/',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#f7f5f2',
      background_color: '#f7f5f2',
    })
    for (const icon of manifest.icons) {
      expect(icon.src).toMatch(/^\/icons\/icon-\d+\.png$/)
      expect(icon.type).toBe('image/png')
      expect(icon.purpose).toContain('any')
      const iconFile = resolve(process.cwd(), 'public', icon.src.slice(1))
      expect(existsSync(iconFile)).toBe(true)
      expect(readFileSync(iconFile).subarray(0, 8)).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      )
    }
  })

  test('웹 푸시는 실제 아이콘만 쓰고 안전한 채팅방 ID만 링크한다', () => {
    const worker = read('public/firebase-messaging-sw.js')

    expect(worker).toContain("icon: '/icons/icon-192.png'")
    expect(worker).not.toContain('badge:')
    expect(worker).not.toContain('console.')
    expect(worker).toContain('/^[a-f\\d]{24}$/i.test(rawRoomId)')
  })
})
