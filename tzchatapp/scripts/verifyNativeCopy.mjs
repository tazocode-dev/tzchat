#!/usr/bin/env node
// cap copy 후 Android/iOS 웹 산출물이 현재 dist와 동일한 자산을 참조하는지 검사한다.
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist'
const NATIVE_TARGETS = [
  {
    name: 'Android',
    publicDir: 'android/app/src/main/assets/public',
    configFile: 'android/app/src/main/assets/capacitor.config.json',
  },
  {
    name: 'iOS',
    publicDir: 'ios/App/App/public',
    configFile: 'ios/App/App/capacitor.config.json',
  },
]
const FORBIDDEN_ENDPOINT_PATTERNS = [
  { pattern: /(?:https?|wss?):\/\/(?:localhost|127(?:\.\d{1,3}){3})(?::\d+)?/i, label: 'localhost/loopback endpoint' },
  { pattern: /(?:https?|wss?):\/\/10(?:\.\d{1,3}){3}(?::\d+)?/i, label: '10.0.0.0/8 private endpoint' },
  { pattern: /(?:https?|wss?):\/\/192\.168(?:\.\d{1,3}){2}(?::\d+)?/i, label: '192.168.0.0/16 private endpoint' },
  { pattern: /(?:https?|wss?):\/\/172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}(?::\d+)?/i, label: '172.16.0.0/12 private endpoint' },
]

function collectFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) collectFiles(full, out)
    else if (/\.(js|mjs|css|html)$/.test(name)) out.push(full)
  }
  return out
}

function indexAssetReferences(indexFile) {
  const html = readFileSync(indexFile, 'utf8')
  return [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((reference) => reference.startsWith('/assets/'))
    .sort()
}

let failed = false
const distReferences = indexAssetReferences(join(DIST, 'index.html'))

if (distReferences.length === 0) {
  console.error('❌ [verifyNativeCopy] dist/index.html에 빌드 자산 참조가 없습니다.')
  failed = true
}

for (const { name, publicDir, configFile } of NATIVE_TARGETS) {
  const nativeReferences = indexAssetReferences(join(publicDir, 'index.html'))
  if (JSON.stringify(nativeReferences) !== JSON.stringify(distReferences)) {
    console.error(`❌ [verifyNativeCopy] ${name} index.html의 자산 참조가 dist와 다릅니다.`)
    failed = true
  }

  for (const file of collectFiles(publicDir)) {
    if (/(?:^|\/)vendor-[^/]+\.js$/.test(file)) continue
    const content = readFileSync(file, 'utf8')
    for (const { pattern, label } of FORBIDDEN_ENDPOINT_PATTERNS) {
      if (pattern.test(content)) {
        console.error(`❌ [verifyNativeCopy] ${file}: ${label}`)
        failed = true
      }
    }
  }

  const config = JSON.parse(readFileSync(configFile, 'utf8'))
  if (config.server?.url || config.server?.hostname !== 'localhost' || config.server?.androidScheme !== 'https' || config.server?.cleartext !== false) {
    console.error(`❌ [verifyNativeCopy] ${configFile}: Capacitor WebView Origin 설정 오류`)
    failed = true
  }
}

if (failed) process.exit(1)
console.log(`✅ [verifyNativeCopy] Android/iOS 자산 참조 및 네트워크 설정 확인 (${distReferences.length}개 참조)`)
