import { io } from 'socket.io-client'
import type { Socket, ManagerOptions, SocketOptions } from 'socket.io-client'
import { IS_NATIVE_APP, SOCKET_ORIGIN, SOCKET_PATH } from '@/shared/config/runtimeEnvironment'

const IS_DEV = import.meta.env.DEV

let socket: Socket | null = null
let listenersBound = false
let currentOrigin: string | null = null

const TOKEN_KEY = 'TZCHAT_AUTH_TOKEN'

/** util */
function isSocketOrigin(u: string): boolean {
  return /^(https?:|wss?:)\/\//i.test(u || '')
}
function originOf(u: URL): string {
  return `${u.protocol}//${u.host}`
}

const TARGET_ORIGIN = originOf(new URL(SOCKET_ORIGIN))

function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}

function buildOptions(): Partial<ManagerOptions & SocketOptions> {
  const token = getToken()
  const native = IS_NATIVE_APP

  // ✅ 네이티브(WebView/Capacitor)에서는 polling→upgrade 지연을 피하기 위해 websocket only
  const transports: Array<'websocket' | 'polling'> = native ? ['websocket'] : ['websocket', 'polling']
  const upgrade = native ? false : true
  const rememberUpgrade = native ? false : true

  const opts: Partial<ManagerOptions & SocketOptions> = {
    path: SOCKET_PATH,

    transports,
    upgrade,
    rememberUpgrade,

    withCredentials: true,

    // 재연결 정책
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 8000,
    randomizationFactor: 0.5,

    // ✅ 너무 길면 사용자 체감이 “멈춤”처럼 보임 (네트워크 나쁠 때)
    timeout: native ? 12000 : 30000,

    // 연결 제어: 앱 엔트리에서 connectSocket()로만 연결되도록
    autoConnect: false,

    // 인증 토큰 전달 (socket.handshake.auth)
    auth: token ? { token } : undefined,
  }

  if (IS_DEV) console.log('[Socket][CFG]', {
    TARGET_ORIGIN,
    SOCKET_PATH,
    hasToken: !!token,
    native,
    transports,
    upgrade,
  })

  return opts
}

function bindCoreListeners(sock: Socket, originStr: string) {
  if (listenersBound) return
  listenersBound = true

  sock.on('connect', () => {
    // @ts-ignore
    const tr = sock.io?.engine?.transport?.name
    if (IS_DEV) console.log('✅ [Socket] connected:', sock.id, '| origin:', originStr, '| transport:', tr)
  })

  sock.on('connect_error', (err: any) => {
    console.error('❌ [Socket] connect_error:', err?.message || err)
  })

  sock.on('error', (err: any) => {
    console.error('❌ [Socket] error:', err?.message || err)
  })

  sock.io.on('reconnect_attempt', (attempt) => {
    if (IS_DEV) console.log('↻ [Socket] reconnect_attempt:', attempt)
  })

  sock.io.on('reconnect', (n) => {
    // @ts-ignore
    const tr = sock.io?.engine?.transport?.name
    if (IS_DEV) console.log('🔁 [Socket] reconnected:', n, '| transport:', tr)
  })

  sock.io.on('reconnect_error', (err) => {
    console.warn('⚠️ [Socket] reconnect_error:', (err as any)?.message || err)
  })

  sock.io.on('reconnect_failed', () => {
    console.warn('⛔ [Socket] reconnect_failed (no more attempts)')
  })

  sock.on('disconnect', (reason: string) => {
    console.warn('⚠️ [Socket] disconnected:', reason)
  })
}

/** 앱 전역에서 1회 호출 권장: 실제 연결 수행 */
export function connectSocket(): Socket {
  const options = buildOptions()

  // 동일 오리진 + 기존 소켓 있으면 재사용
  if (socket && currentOrigin === TARGET_ORIGIN) {
    const token = getToken()
    ;(socket as any).auth = token ? { token } : undefined

    if (!socket.connected) {
      if (IS_DEV) console.log('[Socket] connecting existing socket...')
      socket.connect()
    }
    bindCoreListeners(socket, TARGET_ORIGIN)
    return socket
  }

  // 오리진 변경 또는 최초 연결: 기존 소켓 clean-up
  if (socket) {
    try { socket.off() } catch {}
    try { socket.disconnect() } catch {}
    socket = null
    listenersBound = false
  }

  if (IS_DEV) console.log('[Socket] create & connect...', { origin: TARGET_ORIGIN, path: options.path })
  socket = io(TARGET_ORIGIN, options)
  currentOrigin = TARGET_ORIGIN

  bindCoreListeners(socket, TARGET_ORIGIN)
  socket.connect() // autoConnect:false 이므로 명시적으로 연결
  return socket!
}

/** 현재 소켓 얻기 (없을 수 있음) */
export function getSocket(): Socket | null { return socket }

/** 의도적 완전 종료 (로그아웃 등) */
export function disconnectSocket(): void {
  if (!socket) return
  try {
    if (IS_DEV) console.log('[Socket] disconnect requested')
    socket.off()
    socket.disconnect()
  } catch (e: any) {
    console.warn('[Socket] disconnect error:', e?.message)
  } finally {
    socket = null
    currentOrigin = null
    listenersBound = false
  }
}

/**
 * 재연결/재설정
 * - origin 변경이 없다면 연결 끊지 않음
 * - 서버가 지원하면 'auth:refresh'로 토큰 갱신 알림
 */
export function reconnectSocket(newOrigin?: string): Socket {
  const nextOrigin = (newOrigin && isSocketOrigin(newOrigin))
    ? originOf(new URL(newOrigin))
    : TARGET_ORIGIN

  if (socket && currentOrigin === nextOrigin) {
    try {
      const token = getToken()
      ;(socket as any).auth = token ? { token } : undefined
      if (socket.connected) {
        socket.emit?.('auth:refresh', { token })
        if (IS_DEV) console.log('[Socket] token refreshed (same origin, no disconnect)', { hasToken: !!token })
      } else {
        if (IS_DEV) console.log('[Socket] connect (same origin, was disconnected)')
        socket.connect()
      }
    } catch (e: any) {
      console.warn('[Socket] reconnect (same origin) error:', e?.message)
    }
    return socket!
  }

  // 오리진이 바뀌는 경우에만 재생성
  disconnectSocket()
  const options = buildOptions()
  if (IS_DEV) console.log('[Socket] reconnect with new origin...', { from: currentOrigin, to: nextOrigin, path: options.path })
  socket = io(nextOrigin, options)
  currentOrigin = nextOrigin
  bindCoreListeners(socket, nextOrigin)
  socket.connect()
  return socket!
}
