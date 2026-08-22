import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('native push platform configuration', () => {
  test('iOS는 Firebase Messaging 수동 연결과 push/background capability를 함께 유지한다', () => {
    const infoPlist = read('ios/App/App/Info.plist')
    const entitlements = read('ios/App/App/App.entitlements')
    const project = read('ios/App/App.xcodeproj/project.pbxproj')
    const appDelegate = read('ios/App/App/AppDelegate.swift')
    const tokenPlugin = read('ios/App/App/IosFcmTokenPlugin.swift')
    const podfile = read('ios/App/Podfile')
    const googleServiceInfo = read('ios/App/App/GoogleService-Info.plist')

    expect(infoPlist).toMatch(/<key>FirebaseAppDelegateProxyEnabled<\/key>\s*<false\/>/)
    expect(infoPlist).toMatch(/<key>FirebaseMessagingAutoInitEnabled<\/key>\s*<false\/>/)
    expect(infoPlist).toMatch(/<key>UIBackgroundModes<\/key>[\s\S]*<string>remote-notification<\/string>/)
    expect(entitlements).toContain('<key>aps-environment</key>')
    expect(project).toMatch(/com\.apple\.Push\s*=\s*\{[\s\S]*enabled\s*=\s*1;/)
    expect(project).toMatch(/com\.apple\.BackgroundModes\s*=\s*\{[\s\S]*enabled\s*=\s*1;/)
    expect(project).toContain('CODE_SIGN_ENTITLEMENTS = App/App.entitlements;')
    expect(appDelegate).toContain('FirebaseApp.configure()')
    expect(appDelegate).toContain('Messaging.messaging().apnsToken = deviceToken')
    expect(appDelegate).toContain('.capacitorDidRegisterForRemoteNotifications')
    expect(appDelegate).toContain('didReceiveRegistrationToken fcmToken')
    expect(tokenPlugin).toContain('bridge?.registerPluginInstance(IosFcmTokenPlugin())')
    expect(podfile).toContain("pod 'FirebaseCore'")
    expect(podfile).toContain("pod 'FirebaseMessaging'")
    expect(googleServiceInfo).toMatch(/<key>BUNDLE_ID<\/key>\s*<string>com\.tazocode\.tzchat<\/string>/)
  })

  test('Android는 공식 Capacitor FCM 플러그인과 Android 13 권한·기본 채널을 유지한다', () => {
    const packageJson = JSON.parse(read('package.json'))
    const capacitorGradle = read('android/app/capacitor.build.gradle')
    const pushPluginGradle = read('node_modules/@capacitor/push-notifications/android/build.gradle')
    const buildGradle = read('android/app/build.gradle')
    const manifest = read('android/app/src/main/AndroidManifest.xml')
    const googleServices = JSON.parse(read('android/app/google-services.json'))
    const registeredPackages = (googleServices.client || [])
      .map((client: any) => client?.client_info?.android_client_info?.package_name)
      .filter(Boolean)

    expect(packageJson.dependencies?.['@capacitor/push-notifications']).toBeTruthy()
    expect(capacitorGradle).toContain("implementation project(':capacitor-push-notifications')")
    expect(buildGradle).toContain("apply plugin: 'com.google.gms.google-services'")
    expect(buildGradle).not.toMatch(/implementation\s+['"]com\.google\.firebase:firebase-(?:analytics|messaging)/)
    expect(pushPluginGradle).toContain('com.google.firebase:firebase-messaging')
    expect(manifest).toContain('android.permission.POST_NOTIFICATIONS')
    expect(manifest).toContain('com.google.firebase.messaging.default_notification_channel_id')
    expect(manifest).toContain('android:value="tzchat_alerts_v2"')
    expect(registeredPackages).toContain('com.tazocode.tzchat')
    expect(existsSync(resolve(
      process.cwd(),
      'android/app/src/main/java/com/tazocode/tzchat/MyFirebaseService.java',
    ))).toBe(false)
  })
})
