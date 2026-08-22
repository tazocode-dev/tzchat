// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'

import { sanitizeNoticeHtml } from '@/shared/utils/sanitizeNoticeHtml'
import noticeSource from '@/features/settings/pages/NoticeListPage.vue?raw'

describe('공지 HTML 안전 렌더링', () => {
  test('스크립트·이벤트 속성·위험 URL을 제거하고 허용된 서식만 남긴다', () => {
    const html = sanitizeNoticeHtml(`
      <script>alert(1)</script>
      <p onclick="alert(2)">안내 <strong>필수</strong></p>
      <a href="javascript:alert(3)" target="_blank">위험 링크</a>
      <img src="https://tracker.example/pixel" onerror="alert(4)">
    `)

    expect(html).not.toContain('<script')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('target=')
    expect(html).not.toContain('<img')
    expect(html).toContain('<p>안내 <strong>필수</strong></p>')
  })

  test('공지 상세는 원본 content를 v-html에 직접 전달하지 않는다', () => {
    expect(noticeSource).toContain('v-html="sanitizedNoticeContent"')
    expect(noticeSource).toContain('sanitizeNoticeHtml(current.value?.content)')
    expect(noticeSource).not.toContain('v-html="current.content"')
  })
})
