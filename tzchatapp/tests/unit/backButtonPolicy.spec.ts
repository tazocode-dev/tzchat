// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import {
  createBackButtonHandler,
  createSingleBackButtonRegistration,
  decideBackButtonAction,
} from '@/shared/services/backButtonPolicy'

function handlerFixture(overrides: Record<string, any> = {}) {
  const calls = {
    back: vi.fn(),
    home: vi.fn(),
    prompt: vi.fn(),
    exit: vi.fn(),
  }
  const state = { path: '/home/3page', hasHistory: true, now: 1_000 }
  const handler = createBackButtonHandler({
    getPath: () => state.path,
    hasInternalHistory: () => state.hasHistory,
    dismissTopOverlay: async () => false,
    blurActiveInput: () => false,
    goBack: calls.back,
    goHome: calls.home,
    showExitPrompt: calls.prompt,
    exitApp: calls.exit,
    now: () => state.now,
    ...overrides,
  })
  return { handler, calls, state }
}

describe('Android hardware back policy', () => {
  it('registers only once and does not register outside Android', async () => {
    const remove = vi.fn()
    const addListener = vi.fn(async () => ({ remove }))
    let android = false
    const registration = createSingleBackButtonRegistration({
      shouldRegister: () => android,
      addListener,
    })

    registration.setup()
    expect(addListener).not.toHaveBeenCalled()

    android = true
    registration.setup()
    registration.setup()
    expect(addListener).toHaveBeenCalledTimes(1)

    registration.teardown()
    await Promise.resolve()
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('closes only an overlay or input before navigating', async () => {
    const overlay = handlerFixture({ dismissTopOverlay: async () => true })
    await overlay.handler()
    expect(overlay.calls.back).not.toHaveBeenCalled()
    expect(overlay.calls.home).not.toHaveBeenCalled()
    expect(overlay.calls.exit).not.toHaveBeenCalled()

    const input = handlerFixture({ blurActiveInput: () => true })
    await input.handler()
    expect(input.calls.back).not.toHaveBeenCalled()
    expect(input.calls.home).not.toHaveBeenCalled()
    expect(input.calls.exit).not.toHaveBeenCalled()
  })

  it('moves exactly one step for valid internal history', async () => {
    const fixture = handlerFixture()
    await fixture.handler()
    expect(fixture.calls.back).toHaveBeenCalledTimes(1)
    expect(fixture.calls.home).not.toHaveBeenCalled()
    expect(fixture.calls.exit).not.toHaveBeenCalled()
  })

  it('falls back to profile home for a deep-linked detail without internal history', async () => {
    const fixture = handlerFixture()
    fixture.state.path = '/home/chat/123'
    fixture.state.hasHistory = false

    await fixture.handler()

    expect(fixture.calls.home).toHaveBeenCalledTimes(1)
    expect(fixture.calls.back).not.toHaveBeenCalled()
    expect(fixture.calls.exit).not.toHaveBeenCalled()
  })

  it('does not bypass login, consent, or onboarding without internal history', () => {
    for (const path of ['/login', '/legal/consent', '/onboarding']) {
      expect(decideBackButtonAction({
        path,
        hasInternalHistory: false,
        exitPromptedAt: null,
        now: 1_000,
      }).action).toBe('none')
    }
  })

  it('requires a second home press within two seconds to exit', async () => {
    for (const path of ['/home', '/home/', '/home/6page']) {
      const fixture = handlerFixture()
      fixture.state.path = path
      fixture.state.hasHistory = true

      await fixture.handler()
      expect(fixture.calls.prompt).toHaveBeenCalledTimes(1)
      expect(fixture.calls.exit).not.toHaveBeenCalled()

      fixture.state.now += 1_999
      await fixture.handler()
      expect(fixture.calls.exit).toHaveBeenCalledTimes(1)
    }
  })

  it('shows the exit prompt again after the two-second window', async () => {
    const fixture = handlerFixture()
    fixture.state.path = '/home/6page'

    await fixture.handler()
    fixture.state.now += 2_001
    await fixture.handler()

    expect(fixture.calls.prompt).toHaveBeenCalledTimes(2)
    expect(fixture.calls.exit).not.toHaveBeenCalled()
  })
})
