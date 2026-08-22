// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const source = readFileSync(
  resolve(process.cwd(), 'src/features/account/pages/DeletionPending.vue'),
  'utf8',
)

describe('탈퇴 대기 화면', () => {
  test('현재 밝은 테마 변수와 접근 가능한 상태 카드 구조를 사용한다', () => {
    expect(source).toContain('class="pending-card"')
    expect(source).toContain('aria-labelledby="deletion-pending-title"')
    expect(source).toContain('aria-live="polite"')
    expect(source).toContain('background: var(--panel)')
    expect(source).toContain('color: var(--text-strong)')
    expect(source).not.toContain('#121212')
    expect(source).not.toMatch(/color:\s*(?:#fff(?:fff)?|white)\b/i)
  })

  test('유예 상태 설명·취소·로그아웃을 제공하고 처리 중 중복 조작을 막는다', () => {
    expect(source).toContain('계정이 탈퇴 신청 상태입니다')
    expect(source).toContain('14일의 유예기간')
    expect(source).toContain('예정 삭제일')
    expect(source).toContain('탈퇴 신청 취소하기')
    expect(source).toContain("AuthAPI.logout()")
    expect(source.match(/:disabled="loading \|\| loggingOut"/g)).toHaveLength(2)
    expect(source).not.toContain('src/views/DeletionPending.vue')
  })
})
