export type LegalKind = 'page' | 'consent'

export const LEGAL_PUBLIC_BASE_URL = 'https://tazocode-dev.github.io/tazocode-legal/tzchat/'

export interface PublicLegalDocument {
  slug: string
  label: string
  summary: string
  file: 'privacy.html' | 'terms.html' | 'child-safety.html' | 'account-deletion.html'
}

export interface LegalItem {
  slug: string
  label: string
  kind: LegalKind
  defaultRequired?: boolean
  summary: string
  file: PublicLegalDocument['file']
  anchor?: string
}

/** 설정 목록에 노출하는 공개 문서 4종. */
export const PUBLIC_LEGAL_DOCUMENTS: PublicLegalDocument[] = [
  { slug: 'terms', label: '서비스 이용약관', summary: '서비스 이용 조건과 회원의 권리·의무', file: 'terms.html' },
  { slug: 'privacy', label: '개인정보 처리방침', summary: '처리 항목, 목적, 보관기간과 이용자 권리', file: 'privacy.html' },
  { slug: 'youth-policy', label: '아동 안전 기준', summary: '19세 이상 정책과 아동 성적 학대·착취 방지 기준', file: 'child-safety.html' },
  { slug: 'data-retention', label: '계정 및 데이터 삭제 안내', summary: '삭제 신청, 14일 유예와 삭제 범위', file: 'account-deletion.html' },
]

/** 기존 12개 slug의 직접 진입과 동의 메타데이터 호환을 유지한다. */
export const LEGAL_ITEMS: LegalItem[] = [
  { slug: 'terms', label: '서비스 이용약관', kind: 'page', summary: 'TZChat(손끝) 이용 조건과 회원의 권리·의무', file: 'terms.html' },
  { slug: 'guidelines', label: '커뮤니티 안전 가이드', kind: 'page', summary: '금지 콘텐츠와 안전한 이용 원칙', file: 'terms.html', anchor: 'prohibited' },
  { slug: 'report-block', label: '신고·차단 정책', kind: 'page', summary: '신고, 차단과 콘텐츠 조치', file: 'terms.html', anchor: 'moderation' },
  { slug: 'youth-policy', label: '아동 안전 기준', kind: 'page', summary: '19세 이상 정책과 아동 보호 기준', file: 'child-safety.html' },
  { slug: 'privacy', label: '개인정보 처리방침', kind: 'page', summary: '처리 항목, 목적, 보관기간과 이용자 권리', file: 'privacy.html' },
  { slug: 'privacy-consent', label: '개인정보 수집·이용 안내/동의', kind: 'consent', defaultRequired: true, summary: '가입과 기본 서비스에 필요한 개인정보 처리', file: 'privacy.html', anchor: 'purpose' },
  { slug: 'sensitive-information-consent', label: '민감정보 선택 동의', kind: 'consent', defaultRequired: false, summary: '프로필과 매칭에 이용되는 정보', file: 'privacy.html', anchor: 'sensitive' },
  { slug: 'data-retention', label: '계정 및 데이터 삭제 안내', kind: 'page', summary: '삭제 신청, 14일 유예와 삭제 범위', file: 'account-deletion.html' },
  { slug: 'contacts-consent', label: '연락처 지인 제외 선택 안내', kind: 'consent', defaultRequired: false, summary: '연락처 전화번호 해시 처리와 철회 방법', file: 'privacy.html', anchor: 'contacts' },
  { slug: 'cookies', label: '알림·쿠키·SDK 안내', kind: 'page', summary: '로그인 저장기술, 푸시 알림과 앱 SDK', file: 'privacy.html', anchor: 'automatic' },
  { slug: 'sharing-consent', label: '개인정보 제3자 제공 현황', kind: 'page', summary: '제3자 제공 현황과 회원 간 공개 범위', file: 'privacy.html', anchor: 'third-party' },
  { slug: 'xborder-consent', label: '개인정보 국외 처리 안내', kind: 'page', summary: '외부 알림 서비스의 국외 처리 안내', file: 'privacy.html', anchor: 'overseas' },
]

export const LEGAL_MAP = new Map(LEGAL_ITEMS.map(item => [item.slug, item]))
export const LEGAL_SLUGS = LEGAL_ITEMS.map(item => item.slug)

export function getLabel(slug: string): string { return LEGAL_MAP.get(slug)?.label ?? slug }
export function isConsent(slug: string): boolean { return LEGAL_MAP.get(slug)?.kind === 'consent' }
export function getDefaultRequired(slug: string): boolean {
  const item = LEGAL_MAP.get(slug)
  return item?.kind === 'consent' ? (item.defaultRequired ?? true) : false
}
export function getLegalDocumentUrl(slug: string): string | null {
  const item = LEGAL_MAP.get(String(slug || '').trim())
  if (!item) return null
  return `${LEGAL_PUBLIC_BASE_URL}${item.file}${item.anchor ? `#${item.anchor}` : ''}`
}
