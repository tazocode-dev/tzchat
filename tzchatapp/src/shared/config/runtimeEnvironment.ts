import { Capacitor } from '@capacitor/core'

const PRODUCTION_BACKEND_ORIGIN = 'https://tzchat.tazocode.com'
const CONFIGURED_API_ORIGIN = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '')

export const IS_NATIVE_APP = Capacitor.isNativePlatform()

function validateConfiguredApiOrigin(): string {
  if (!CONFIGURED_API_ORIGIN) throw new Error('VITE_API_BASE_URL이 설정되지 않았습니다.')
  let url: URL
  try { url = new URL(CONFIGURED_API_ORIGIN) }
  catch { throw new Error('VITE_API_BASE_URL이 올바른 Origin이 아닙니다.') }
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('VITE_API_BASE_URL에는 경로·쿼리·인증정보를 넣을 수 없습니다.')
  }
  if (import.meta.env.DEV && url.origin !== 'http://localhost:11018') {
    throw new Error('개발 VITE_API_BASE_URL은 http://localhost:11018이어야 합니다.')
  }
  if (import.meta.env.PROD && (url.protocol !== 'https:' || url.origin !== PRODUCTION_BACKEND_ORIGIN)) {
    throw new Error(`운영 VITE_API_BASE_URL은 ${PRODUCTION_BACKEND_ORIGIN}이어야 합니다.`)
  }
  return url.origin
}

const API_ORIGIN_VALUE = validateConfiguredApiOrigin()

// 개발 웹은 로컬 백엔드, 운영 웹은 same-origin 상대 API, 네이티브 앱은 운영 백엔드를 사용한다.
export const API_BASE_URL = API_ORIGIN_VALUE

// URL 절대화가 필요한 이미지 코드용 Origin. Axios의 baseURL과 달리 항상 절대 Origin이다.
export const API_ORIGIN = API_ORIGIN_VALUE

// Socket.IO는 절대 Origin이 필요하다. 운영 웹은 현재 페이지 Origin을 그대로 사용한다.
export const SOCKET_ORIGIN = API_ORIGIN_VALUE

export const SOCKET_PATH = '/socket.io'
