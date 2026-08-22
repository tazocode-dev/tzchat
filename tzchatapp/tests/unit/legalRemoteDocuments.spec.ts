import { describe, expect, test } from 'vitest'
import {
  getLegalDocumentUrl,
  LEGAL_ITEMS,
  LEGAL_PUBLIC_BASE_URL,
  PUBLIC_LEGAL_DOCUMENTS,
} from '@/features/legal/constants/legals'
import legalDocsSource from '@/features/legal/LegalDocs.vue?raw'
import legalContainerSource from '@/features/legal/LegalContainer.vue?raw'
import deletionSettingSource from '@/features/settings/pages/AccountDeletionPage.vue?raw'
import routerSource from '@/router/index.ts?raw'

describe('GitHub Pages 법적 문서 연결', () => {
  test('목록은 공개 문서 4개만 제공한다', () => {
    expect(PUBLIC_LEGAL_DOCUMENTS.map(item => item.file)).toEqual([
      'terms.html', 'privacy.html', 'child-safety.html', 'account-deletion.html',
    ])
    expect(legalDocsSource).toContain('PUBLIC_LEGAL_DOCUMENTS')
    expect(legalDocsSource).not.toContain('getActiveTerms')
  })

  test('기존 12개 slug를 고정 URL과 정확한 anchor로 연결한다', () => {
    expect(LEGAL_ITEMS).toHaveLength(12)
    expect(Object.fromEntries(LEGAL_ITEMS.map(item => [item.slug, getLegalDocumentUrl(item.slug)]))).toEqual({
      terms: `${LEGAL_PUBLIC_BASE_URL}terms.html`,
      guidelines: `${LEGAL_PUBLIC_BASE_URL}terms.html#prohibited`,
      'report-block': `${LEGAL_PUBLIC_BASE_URL}terms.html#moderation`,
      'youth-policy': `${LEGAL_PUBLIC_BASE_URL}child-safety.html`,
      privacy: `${LEGAL_PUBLIC_BASE_URL}privacy.html`,
      'privacy-consent': `${LEGAL_PUBLIC_BASE_URL}privacy.html#purpose`,
      'sensitive-information-consent': `${LEGAL_PUBLIC_BASE_URL}privacy.html#sensitive`,
      'data-retention': `${LEGAL_PUBLIC_BASE_URL}account-deletion.html`,
      'contacts-consent': `${LEGAL_PUBLIC_BASE_URL}privacy.html#contacts`,
      cookies: `${LEGAL_PUBLIC_BASE_URL}privacy.html#automatic`,
      'sharing-consent': `${LEGAL_PUBLIC_BASE_URL}privacy.html#third-party`,
      'xborder-consent': `${LEGAL_PUBLIC_BASE_URL}privacy.html#overseas`,
    })
    expect(getLegalDocumentUrl('unknown')).toBeNull()
  })

  test('상세는 iframe으로만 본문을 표시하고 접근성·재시도·referrer 정책을 둔다', () => {
    const template = legalContainerSource.split('<script setup')[0]
    expect(template).toContain('<iframe')
    expect(template).toContain(':title="`${title} 문서`"')
    expect(template).toContain('referrerpolicy="strict-origin-when-cross-origin"')
    expect(template).toContain('다시 시도')
    expect(template).toContain('v-if="frameReady && !frameError"')
    expect(template).toContain('v-if="isMaster && documentUrl"')
    expect(template).toContain('class="mobile-document-help"')
    expect(template).toContain('표 안에서 좌우로 밀어 전체 내용을 확인할 수 있습니다.')
    expect(template).toContain('<a :href="documentUrl" target="_self">전체 화면으로 보기</a>')
    expect(legalContainerSource).toContain('@media(max-width:560px)')
    expect(legalContainerSource).toContain('.mobile-document-help{width:100%')
    expect(legalContainerSource).toContain("method: 'HEAD'")
    expect(legalContainerSource).toContain("cache: 'no-store'")
    expect(legalContainerSource).toContain('if (!response.ok)')
    expect(legalContainerSource).toContain('new AbortController()')
    expect(legalContainerSource).toContain('requestId !== frameRequestId')
    expect(legalContainerSource).not.toContain('v-html')
    expect(legalContainerSource).not.toContain('builtInLegals')
    expect(legalContainerSource).not.toContain('getTermVersions')
  })

  test('기존 법적 설정 딥링크는 컴포넌트 없이 canonical 내부 경로로 호환한다', () => {
    expect(routerSource).toContain("{ path: 'setting/0005', redirect: '/home/legals/v2/privacy' }")
    expect(routerSource).toContain("{ path: 'setting/0006', redirect: '/home/legals/v2/terms' }")
    expect(routerSource).toContain("{ path: 'setting/0007', redirect: '/home/legals/v2/youth-policy' }")
    expect(routerSource).not.toContain('@/features/settings/components/setlist/')
  })

  test('계정 삭제 설정에서 canonical 삭제 안내로 진입한다', () => {
    expect(deletionSettingSource).toContain('/home/legals/v2/data-retention')
    expect(deletionSettingSource).toContain('계정 및 데이터 삭제 안내 보기')
    expect(deletionSettingSource).toContain('14일의 유예기간 후 영구 삭제됩니다.')
    expect(deletionSettingSource).not.toContain('유예기간(예: 14일)')
  })

})
