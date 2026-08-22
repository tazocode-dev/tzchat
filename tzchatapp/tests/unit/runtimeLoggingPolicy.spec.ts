import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { sanitizeClientLogArgs } from '@/shared/utils/clientLogger'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('운영 클라이언트 로그 정책', () => {
  it('진단 필드만 보존하고 토큰·PII·raw payload를 제거한다', () => {
    const [rawSanitized] = sanitizeClientLogArgs([{
      status: 403,
      code: 'REQUEST_DENIED',
      message: 'user@example.com 010-1234-5678 Bearer secret-token',
      userId: '507f1f77bcf86cd799439011',
      token: 'secret-token',
      data: { nickname: '민감한닉네임' },
      response: { headers: { authorization: 'Bearer provider-token' } },
    }])
    const sanitized = rawSanitized as Record<string, unknown>

    expect(Object.keys(sanitized).sort()).toEqual(['code', 'message', 'status'])
    expect(sanitized.status).toBe(403)
    expect(sanitized.code).toBe('REQUEST_DENIED')
    const output = JSON.stringify(sanitized)
    expect(output).not.toMatch(/user@example\.com|010-1234-5678|secret-token|507f1f77bcf86cd799439011|민감한닉네임|provider-token/)
    expect(output).toMatch(/redacted-email/)
    expect(output).toMatch(/redacted-phone/)
    expect(sanitizeClientLogArgs(['EVENT_LABEL', '비공개닉네임'])).toEqual(['EVENT_LABEL', '[redacted]'])
  })

  it('앱 진입점에서 운영 console guard를 즉시 설정한다', () => {
    const mainSource = fs.readFileSync(path.join(ROOT, 'src/main.ts'), 'utf8')
    expect(mainSource).toContain("import { configureClientConsole } from '@/shared/utils/clientLogger'")
    expect(mainSource).toMatch(/configureClientConsole\(\)[\s\S]*addIcons\(/)
  })

  it('비밀번호와 신청 payload를 직접 출력하는 디버그 로그가 없다', () => {
    const passwordSource = fs.readFileSync(path.join(ROOT, 'src/features/settings/pages/PasswordChangePage.vue'), 'utf8')
    const passwordModalSource = fs.readFileSync(path.join(ROOT, 'src/features/profile/components/PasswordChangeModal.vue'), 'utf8')
    const friendRequestSource = fs.readFileSync(path.join(ROOT, 'src/features/friends/components/FriendRequestModal.vue'), 'utf8')
    const requestSource = fs.readFileSync(path.join(ROOT, 'src/features/friends/components/SpeedMatchRequestModal.vue'), 'utf8')

    expect(passwordSource).not.toContain('logInput')
    expect(passwordSource).not.toContain('console.debug')
    expect(passwordModalSource).not.toContain('logInput')
    expect(passwordModalSource).not.toContain('console.debug')
    expect(friendRequestSource).not.toContain('submit start')
    expect(friendRequestSource).not.toContain('submit response')
    expect(requestSource).not.toContain('submit start')
    expect(requestSource).not.toContain('submit response')
    expect(requestSource).not.toContain('defaultMessage: props.defaultMessage')
  })
})
