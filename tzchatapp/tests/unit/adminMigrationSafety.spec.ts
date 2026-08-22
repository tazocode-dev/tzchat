// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import {
  BETA_MIGRATION_CONFIRMATION,
  runBetaMigration,
} from '@/features/admin/services/betaMigrationExecution'

describe('관리자 beta 전환 안전 경계', () => {
  test('실행 화면은 Ionic 입력 확인값을 정규화하지 않고 그대로 검사 helper에 전달한다', () => {
    const page = readFileSync(
      resolve(process.cwd(), 'src/features/admin/pages/AdminMigrationPage.vue'),
      'utf8',
    )

    expect(page).toContain('alertController.create')
    expect(page).toContain("return String(data?.values?.confirmation || '')")
    expect(page).not.toContain("return String(data?.values?.confirmation || '').trim()")
  })

  test('dry-run은 확인 없이 안전 payload로 한 번 호출한다', async () => {
    const post = vi.fn(async payload => payload)
    const requestConfirmation = vi.fn(async () => null)

    const result = await runBetaMigration({ dryRun: true, requestConfirmation, post })

    expect(result.executed).toBe(true)
    expect(requestConfirmation).not.toHaveBeenCalled()
    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith({ dryRun: true })
  })

  test('실제 전환 확인 취소 또는 불일치는 API를 호출하지 않는다', async () => {
    for (const confirmation of [null, 'beta_to_basic', ` ${BETA_MIGRATION_CONFIRMATION} `]) {
      const post = vi.fn()
      const result = await runBetaMigration({
        dryRun: false,
        requestConfirmation: async () => confirmation,
        post,
      })

      expect(result.executed).toBe(false)
      expect(post).not.toHaveBeenCalled()
    }
  })

  test('정확한 문구를 직접 입력한 실제 전환만 confirmation payload를 전송한다', async () => {
    const post = vi.fn(async payload => payload)
    const result = await runBetaMigration({
      dryRun: false,
      requestConfirmation: async () => BETA_MIGRATION_CONFIRMATION,
      post,
    })

    expect(result.executed).toBe(true)
    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith({
      dryRun: false,
      confirmation: BETA_MIGRATION_CONFIRMATION,
    })
  })
})
