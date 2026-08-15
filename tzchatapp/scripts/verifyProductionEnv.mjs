#!/usr/bin/env node
// Vite production 모드가 실제로 사용할 공개 API Origin을 번들 생성 전에 검사한다.
import { loadEnv } from 'vite'

const MODE = 'production'
const EXPECTED_API_ORIGIN = 'https://tzchat.tazocode.com'
const fileEnv = loadEnv(MODE, process.cwd(), '')

// Vite는 이미 셸에 존재하는 환경변수를 .env 파일 값보다 우선한다.
const rawApiOrigin = Object.prototype.hasOwnProperty.call(process.env, 'VITE_API_BASE_URL')
  ? process.env.VITE_API_BASE_URL
  : fileEnv.VITE_API_BASE_URL
const configuredApiOrigin = String(rawApiOrigin || '').trim()

function fail(message) {
  console.error(`❌ [verifyProductionEnv] ${message}`)
  process.exit(1)
}

if (!configuredApiOrigin) {
  fail('production VITE_API_BASE_URL이 설정되지 않았습니다.')
}

let url
try {
  url = new URL(configuredApiOrigin)
} catch {
  fail('VITE_API_BASE_URL은 유효한 절대 URL이어야 합니다.')
}

if (url.protocol !== 'https:') {
  fail('운영 VITE_API_BASE_URL은 HTTPS를 사용해야 합니다.')
}
if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
  fail('VITE_API_BASE_URL에는 Origin만 설정하고 경로·쿼리·인증정보를 넣을 수 없습니다.')
}
if (url.origin !== EXPECTED_API_ORIGIN) {
  fail(`운영 VITE_API_BASE_URL은 ${EXPECTED_API_ORIGIN}이어야 합니다.`)
}

console.log(`✅ [verifyProductionEnv] 운영 API Origin 확인: ${url.origin}`)
