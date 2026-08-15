#!/usr/bin/env node
// 운영 웹 번들이 로컬/사설 목적지나 비밀키를 포함하지 않는지 검사한다.
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

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

let failed = false
const files = collectFiles(DIST)

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
