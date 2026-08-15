// /src/services/termsApi.ts
// ----------------------------------------------------------
// 약관/정책 관련 API 클라이언트
// - 반드시 프로젝트 공통 axios 인스턴스(@/shared/services/api) 사용
// - 모든 요청은 withCredentials 포함(인스턴스 기본값)
// ----------------------------------------------------------
import api from '@/shared/services/api'

export type TermsDoc = {
  _id?: string
  slug: string
  title: string
  version: string
  // ✅ 하위호환(템플릿에서 doc.required 사용 중) — 서버는 defaultRequired 사용
  required?: boolean
  // ✅ 서버 필드
  defaultRequired?: boolean
  kind?: 'page' | 'consent'

  isActive?: boolean
  content: string            // 서버의 body/content를 통일해 content로 노출
  createdAt?: string
  updatedAt?: string
  publishedAt?: string | null
}

// ✅ slug별 최신 문서 조회 (서버 응답: { ok, data })
export async function fetchLatestBySlug(slug: string): Promise<TermsDoc> {
  const res = await api.get('/api/terms/latest', { params: { slug } })
  const doc = (res?.data && (res.data as any).data) || null
  if (!doc) throw new Error('latest document not found')

  // body/content 호환 → content로 매핑
  const content: string = doc.body || doc.content || ''

  // ✅ 하위호환: required(템플릿) ← defaultRequired(서버)
  const required: boolean =
    typeof doc.defaultRequired === 'boolean'
      ? doc.defaultRequired
      : !!doc.required

  // 반환 시 서버 원본 필드도 유지 + content/required 채워서 일관성 제공
  return {
    ...doc,
    content,
    required,
    defaultRequired: typeof doc.defaultRequired === 'boolean' ? doc.defaultRequired : required,
  }
}

// ✅ 사용자 동의 저장 (표준 경로: /api/legal/consents/agree)
export async function postAgree(slug: string, version: string) {
  const res = await api.post('/api/legal/consents/agree', {
    slug,
    version,
    // 선택 동의일 경우 외부에서 true/false를 넘기고 싶다면 함수 시그니처를 확장하세요.
    optedIn: true,
  })
  return res.data
}

// ✅ 재동의 필요한 문서 목록 조회
// 신엔드포인트: /api/legal/agreements/me/status  -> { ok, data: { pending, optional } }
export async function fetchRequireConsent(): Promise<{
  needReconsent: boolean
  requiredSlugs: string[]
}> {
  const res = await api.get('/api/legal/agreements/me/status')
  const payload = (res?.data && (res.data as any).data) || {}
  const pending = Array.isArray(payload.pending) ? payload.pending : []
  return {
    needReconsent: pending.length > 0,
    requiredSlugs: pending.map((p: any) => String(p.slug)),
  }
}
