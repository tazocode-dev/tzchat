// src/lib/backButton.ts
// ✅ Android(하드웨어) 뒤로가기 처리 - Ionic 컨텍스트(navManager/useBackButton) 비의존 안전 버전
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

let removeListener: (() => void) | null = null

export function setupAndroidBackButton() {
  // SSR/테스트 환경 가드
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  // 중복 등록 방지
  if (removeListener) return

  const handler = async () => {
    // 1) 열린 오버레이(ion-modal/ion-alert/ion-action-sheet/ion-popover) 우선 닫기
    const overlay = document.querySelector<HTMLElement>(
      'ion-modal, ion-alert, ion-action-sheet, ion-popover'
    ) as any
    if (overlay && typeof overlay.dismiss === 'function') {
      try { await overlay.dismiss() } catch {}
      return
    }

    // 2) 입력 포커스 해제(키보드 닫기)
    const active = document.activeElement as HTMLElement | null
    if (active && (
      active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      (active as any).isContentEditable
    )) {
      try { (active as HTMLInputElement).blur?.() } catch {}
      return
    }

    // 3) 브라우저 히스토리가 있으면 뒤로가기
    if (window.history.length > 1) {
      window.history.back()
      return
    }

    // 4) 네이티브 환경이면 앱 종료(안드로이드 관례)
    if (Capacitor.isNativePlatform()) {
      try { CapApp.exitApp() } catch {}
      return
    }
    // 5) 웹 환경이면 no-op (루트)
  }

  // Capacitor v5: backButton 이벤트 구독
  CapApp.addListener('backButton', handler).then((rm) => {
    removeListener = () => {
      try { rm.remove() } catch {}
      removeListener = null
    }
  }).catch(() => {
    // 이벤트 바인딩 실패 시 브라우저 fallback: history popstate에 가볍게 연결(선택)
    const onKey = (e: KeyboardEvent) => {
      // 데스크톱 디버깅용: Alt+Left = 뒤로
      if (e.altKey && e.key === 'ArrowLeft') handler()
    }
    window.addEventListener('keydown', onKey)
    removeListener = () => {
      window.removeEventListener('keydown', onKey)
      removeListener = null
    }
  })
}

export function teardownAndroidBackButton() {
  try { removeListener?.() } catch {}
  removeListener = null
}
