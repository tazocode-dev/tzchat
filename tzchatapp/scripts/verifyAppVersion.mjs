#!/usr/bin/env node
// 공개 버전과 Android/iOS 빌드 버전이 서로 어귋나는 출시 사고를 막는다.
import { readFileSync } from 'node:fs'

const read = (file) => readFileSync(file, 'utf8')
const packageJson = JSON.parse(read('package.json'))
const packageLock = JSON.parse(read('package-lock.json'))
const androidGradle = read('android/app/build.gradle')
const iosProject = read('ios/App/App.xcodeproj/project.pbxproj')
const indexHtml = read('index.html')
const envExamples = ['.env.development.example', '.env.production.example']

const errors = []
const appVersion = String(packageJson.version || '').trim()

if (!/^\d+\.\d+\.\d+$/.test(appVersion)) {
  errors.push(`package.json version이 x.y.z 형식이 아닙니다: ${appVersion || '(빈 값)'}`)
}

const androidVersionName = androidGradle.match(/\bversionName\s+["']([^"']+)["']/)?.[1]
const androidVersionCode = Number(androidGradle.match(/\bversionCode\s+(\d+)/)?.[1])
const iosMarketingVersions = [...iosProject.matchAll(/\bMARKETING_VERSION\s*=\s*([^;]+);/g)]
  .map((match) => match[1].trim())
const iosBuildNumbers = [...iosProject.matchAll(/\bCURRENT_PROJECT_VERSION\s*=\s*(\d+);/g)]
  .map((match) => Number(match[1]))
const indexVersion = indexHtml.match(/<meta\s+name=["']app-version["']\s+content=["']([^"']+)["']/)?.[1]

if (packageLock.version !== appVersion || packageLock.packages?.['']?.version !== appVersion) {
  errors.push('package-lock.json의 루트 버전이 package.json과 다릅니다.')
}
if (androidVersionName !== appVersion) {
  errors.push(`Android versionName(${androidVersionName || '없음'})이 ${appVersion}과 다릅니다.`)
}
if (!Number.isInteger(androidVersionCode) || androidVersionCode < 1) {
  errors.push('Android versionCode는 1 이상의 정수여야 합니다.')
}
if (iosMarketingVersions.length !== 2 || iosMarketingVersions.some((version) => version !== appVersion)) {
  errors.push(`iOS Debug/Release MARKETING_VERSION을 모두 ${appVersion}로 맞춰야 합니다.`)
}
if (iosBuildNumbers.length !== 2 || iosBuildNumbers.some((build) => build !== androidVersionCode)) {
  errors.push(`iOS Debug/Release build number를 Android versionCode(${androidVersionCode})와 맞춰야 합니다.`)
}
if (indexVersion !== appVersion) {
  errors.push(`index.html app-version(${indexVersion || '없음'})이 ${appVersion}과 다릅니다.`)
}

for (const file of envExamples) {
  const exampleVersion = read(file).match(/^VITE_APP_VERSION=(.+)$/m)?.[1]?.trim()
  if (exampleVersion !== appVersion) {
    errors.push(`${file}의 VITE_APP_VERSION(${exampleVersion || '없음'})이 ${appVersion}과 다릅니다.`)
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`❌ [verifyAppVersion] ${error}`)
  process.exit(1)
}

console.log(`✅ [verifyAppVersion] 앱 ${appVersion} (build ${androidVersionCode}) 버전 일치`)
