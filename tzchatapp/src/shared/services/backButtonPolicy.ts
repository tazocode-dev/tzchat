export type BackButtonAction = 'back' | 'home' | 'prompt-exit' | 'exit' | 'none'

export type BackButtonPolicyInput = {
  path: string
  hasInternalHistory: boolean
  exitPromptedAt: number | null
  now: number
  exitWindowMs?: number
}

export type BackButtonDecision = {
  action: BackButtonAction
  exitPromptedAt: number | null
}

const HOME_PATHS = new Set(['/home', '/home/', '/home/6page'])
const AUTH_FLOW_PATHS = new Set([
  '/login',
  '/admin/login',
  '/legal/consent',
  '/onboarding',
  '/account/deletion-pending',
])

export function decideBackButtonAction(input: BackButtonPolicyInput): BackButtonDecision {
  const exitWindowMs = input.exitWindowMs ?? 2_000

  if (HOME_PATHS.has(input.path)) {
    const elapsed = input.exitPromptedAt == null ? Infinity : input.now - input.exitPromptedAt
    if (elapsed >= 0 && elapsed <= exitWindowMs) return { action: 'exit', exitPromptedAt: null }
    return { action: 'prompt-exit', exitPromptedAt: input.now }
  }

  if (input.hasInternalHistory) return { action: 'back', exitPromptedAt: null }
  if (AUTH_FLOW_PATHS.has(input.path)) return { action: 'none', exitPromptedAt: null }
  return { action: 'home', exitPromptedAt: null }
}

export type BackButtonHandlerDependencies = {
  getPath: () => string
  hasInternalHistory: () => boolean
  dismissTopOverlay: () => Promise<boolean>
  blurActiveInput: () => boolean
  goBack: () => void
  goHome: () => void
  showExitPrompt: () => void | Promise<void>
  exitApp: () => void
  now?: () => number
  exitWindowMs?: number
}

export function createBackButtonHandler(dependencies: BackButtonHandlerDependencies) {
  let exitPromptedAt: number | null = null

  return async function handleBackButton() {
    if (await dependencies.dismissTopOverlay()) {
      exitPromptedAt = null
      return
    }
    if (dependencies.blurActiveInput()) {
      exitPromptedAt = null
      return
    }

    const decision = decideBackButtonAction({
      path: dependencies.getPath(),
      hasInternalHistory: dependencies.hasInternalHistory(),
      exitPromptedAt,
      now: (dependencies.now || Date.now)(),
      exitWindowMs: dependencies.exitWindowMs,
    })
    exitPromptedAt = decision.exitPromptedAt

    if (decision.action === 'back') dependencies.goBack()
    else if (decision.action === 'home') dependencies.goHome()
    else if (decision.action === 'prompt-exit') await dependencies.showExitPrompt()
    else if (decision.action === 'exit') dependencies.exitApp()
  }
}

export type BackButtonListenerHandle = { remove: () => void | Promise<void> }

export function createSingleBackButtonRegistration(dependencies: {
  shouldRegister: () => boolean
  addListener: () => Promise<BackButtonListenerHandle>
}) {
  let registration: Promise<BackButtonListenerHandle> | null = null

  return {
    setup() {
      if (!dependencies.shouldRegister() || registration) return
      const pending = dependencies.addListener()
      registration = pending
      pending.catch(() => {
        if (registration === pending) registration = null
      })
    },
    teardown() {
      const pending = registration
      registration = null
      pending?.then((handle) => handle.remove()).catch(() => {})
    },
  }
}
