/**
 * membershipApi.ts
 * 멤버십/결제 임시 API 래퍼
 * - GET /api/membership/plans?gender=male|female
 * - POST /api/purchase { userId, planCode, gender }
 * - GET /api/purchase/history?userId=...
 */

import api from '@/shared/services/api' // ✅ 공용 API 인스턴스 사용
import type { AxiosError } from 'axios'

export type Gender = 'male' | 'female'

export interface PlanItem {
  code: 'BASIC' | 'LIGHT' | 'PREMIUM'
  name: '일반회원' | '라이트회원' | '프리미엄회원'
  price: number
  priceDisplay: string // "무료" | "₩9,900" | "₩19,900"
  benefitText: string  // 남: 01/02/03, 여: 11/12/03
  order: number
}

export interface PlansResponse {
  ok: boolean
  gender: Gender
  currency: 'KRW'
  beta: { ended: boolean; endAtKst: string }
  defaultLevel: '베타회원' | '일반회원'
  plans: PlanItem[]
  error?: string
}

export interface PurchasePayload {
  userId: string
  planCode: PlanItem['code']
  gender: Gender
}

export interface PurchaseResponse {
  ok: boolean
  message?: string
  order?: {
    id: string
    planCode: PlanItem['code']
    planName: PlanItem['name']
    price: number
    priceDisplay: string
    status: 'mock_paid' | 'mock_fail' | 'paid' | 'cancelled' | 'refunded'
    paidAt: string
  }
  user?: {
    id: string
    nickname: string
    user_level: PlanItem['name'] | '베타회원'
  }
  error?: string
}

export interface HistoryItem {
  id: string
  planName: PlanItem['name'] | '베타회원'
  price: number
  priceDisplay: string
  status: 'mock_paid' | 'mock_fail' | 'paid' | 'cancelled' | 'refunded'
  paidAt: string | null
  note: string
}
export interface HistoryResponse {
  ok: boolean
  count: number
  orders: HistoryItem[]
  error?: string
}

function toErrorMessage(err: unknown): string {
  const axErr = err as AxiosError<any>
  return axErr?.response?.data?.error || axErr?.message || 'UNKNOWN_ERROR'
}

/** 성별별 플랜 조회 */
export async function fetchPlans(gender: Gender): Promise<PlansResponse> {
  try {
    const { data } = await api.get<PlansResponse>('/api/membership/plans', {
      params: { gender },
      withCredentials: true,
      // ❌ CORS preflight 이슈 방지: 불필요한 커스텀 헤더 제거
    })
    return data
  } catch (err) {
    return {
      ok: false,
      gender,
      currency: 'KRW',
      beta: { ended: false, endAtKst: '' },
      defaultLevel: '베타회원',
      plans: [],
      error: toErrorMessage(err),
    }
  }
}

/** 임시 결제(모의) 실행 */
export async function purchase(payload: PurchasePayload): Promise<PurchaseResponse> {
  try {
    const { data } = await api.post<PurchaseResponse>('/api/purchase', payload, {
      withCredentials: true,
      // 기본 Accept 헤더로 충분
    })
    return data
  } catch (err) {
    return { ok: false, error: toErrorMessage(err) }
  }
}

/** 결제 이력 조회 */
export async function fetchHistory(userId: string): Promise<HistoryResponse> {
  try {
    const { data } = await api.get<HistoryResponse>('/api/purchase/history', {
      params: { userId },
      withCredentials: true,
      // ❌ 불필요한 커스텀 헤더 제거
    })
    return data
  } catch (err) {
    return { ok: false, count: 0, orders: [], error: toErrorMessage(err) }
  }
}

/** KRW 금액 포맷 (UI에서 재사용 가능) */
export function formatKRW(n: number): string {
  if (!Number.isFinite(n)) return ''
  if (n === 0) return '무료'
  return `₩${n.toLocaleString('ko-KR')}`
}
