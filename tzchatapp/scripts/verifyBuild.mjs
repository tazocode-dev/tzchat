#!/usr/bin/env node
// 운영 웹 번들이 로컬/사설 목적지나 비밀키를 포함하지 않는지 검사한다.
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const DIST = 'dist'
const FORBIDDEN_LITERALS = [
  'localhost:11018',
  'localhost:2000',
  'localhost:8081',
  'dev-remote',
  'build:web',
]
const SECRET_PATTERNS = [
  { pattern: /sk_live_[A-Za-z0-9]{10,}/, label: 'Stripe-style live secret key' },
  { pattern: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/, label: 'PEM private key' },
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

function verifyPwaManifest() {
  const manifestFile = join(DIST, 'manifest.webmanifest')
  if (!existsSync(manifestFile)) {
    console.error('❌ [verifyBuild] dist/manifest.webmanifest가 없습니다.')
    return false
  }

  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
  } catch {
    console.error('❌ [verifyBuild] manifest.webmanifest가 유효한 JSON이 아닙니다.')
    return false
  }

  let valid = true
  const expected = {
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: '#f7f5f2',
    background_color: '#f7f5f2',
  }
  for (const [key, value] of Object.entries(expected)) {
    if (manifest[key] !== value) {
      console.error(`❌ [verifyBuild] manifest.${key}는 ${value}이어야 합니다.`)
      valid = false
    }
  }

  if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
    console.error('❌ [verifyBuild] PWA 아이콘이 정의되지 않았습니다.')
    return false
  }

  const declaredSizes = new Set()
  const distRoot = resolve(DIST)
  for (const icon of manifest.icons) {
    if (typeof icon.src !== 'string' || !icon.src.startsWith('/') || icon.src.includes('?') || icon.src.includes('#')) {
      console.error(`❌ [verifyBuild] PWA 아이콘 경로가 잘못됐습니다: ${String(icon.src)}`)
      valid = false
      continue
    }

    const iconFile = resolve(DIST, icon.src.slice(1))
    if (relative(distRoot, iconFile).startsWith('..') || !existsSync(iconFile)) {
      console.error(`❌ [verifyBuild] PWA 아이콘 파일이 없습니다: ${icon.src}`)
      valid = false
      continue
    }

    const bytes = readFileSync(iconFile)
    const pngSignature = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    if (!pngSignature || icon.type !== 'image/png' || bytes.length < 24) {
      console.error(`❌ [verifyBuild] ${icon.src}의 확장자·MIME·실제 포맷을 PNG로 맞춰야 합니다.`)
      valid = false
      continue
    }

    const actualSize = `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`
    if (icon.sizes !== actualSize) {
      console.error(`❌ [verifyBuild] ${icon.src} 실제 크기(${actualSize})와 manifest sizes(${icon.sizes})가 다릅니다.`)
      valid = false
    }
    if (typeof icon.purpose !== 'string' || !icon.purpose.split(/\s+/).includes('any')) {
      console.error(`❌ [verifyBuild] ${icon.src}의 purpose에 any가 필요합니다.`)
      valid = false
    }
    declaredSizes.add(icon.sizes)
  }

  for (const requiredSize of ['192x192', '512x512']) {
    if (!declaredSizes.has(requiredSize)) {
      console.error(`❌ [verifyBuild] PWA 필수 아이콘 ${requiredSize}가 없습니다.`)
      valid = false
    }
  }
  return valid
}

let failed = false
const files = collectFiles(DIST)

if (!verifyPwaManifest()) failed = true

for (const file of files) {
  const content = readFileSync(file, 'utf8')
  const isVendorChunk = /(?:^|\/)vendor-[^/]+\.js$/.test(file)

  for (const { pattern, label } of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      failed = true
      console.error(`❌ [verifyBuild] ${file}: ${label}`)
    }
  }
  if (!isVendorChunk) {
    for (const literal of FORBIDDEN_LITERALS) {
      if (content.includes(literal)) {
        failed = true
        console.error(`❌ [verifyBuild] ${file}: forbidden literal ${literal}`)
      }
    }
    for (const { pattern, label } of FORBIDDEN_ENDPOINT_PATTERNS) {
      if (pattern.test(content)) {
        failed = true
        console.error(`❌ [verifyBuild] ${file}: ${label}`)
      }
    }
  }
}

if (failed) process.exit(1)
console.log(`✅ [verifyBuild] 운영 웹 번들 검사 통과 (${files.length}개 파일)`)
