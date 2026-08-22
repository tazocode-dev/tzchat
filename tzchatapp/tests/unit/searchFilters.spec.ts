import { beforeEach, describe, expect, test } from 'vitest'
import { applyDistributedSelection } from '@/features/search/filters/distributedSelection'
import { applyTotalFilterNormal } from '@/features/search/filters/normalSearchFilter'
import { applyTotalFilterPremium } from '@/features/search/filters/speedSearchFilter'

const baseUser = (id: string, overrides: Record<string, unknown> = {}) => ({
  _id: id,
  birthyear: 1990,
  region1: '서울',
  region2: '강남구',
  search_birthyear1: '',
  search_birthyear2: '',
  search_regions: [],
  marriage: '미혼',
  search_marriage: '전체',
  gender: 'man',
  preference: '동성친구 - 전체',
  search_preference: '동성친구 - 전체',
  search_onlyWithPhoto: 'OFF',
  search_disconnectLocalContacts: 'OFF',
  search_allowFriendRequests: 'OFF',
  emergency: { isActive: true, remainingSeconds: 1800 },
  ...overrides,
})

describe('검색 필터 구조', () => {
  beforeEach(() => localStorage.clear())

  test('일반과 스피드 검색은 관계 제외과 참여 정책을 각각 유지한다', () => {
    const me = baseUser('me', { friendlist: ['friend'] })
    const active = baseUser('active')
    const inactive = baseUser('inactive', { emergency: { isActive: false, remainingSeconds: 0 } })
    const friend = baseUser('friend')

    const normal = applyTotalFilterNormal([me, active, inactive, friend], me)
    const speed = applyTotalFilterPremium([me, active, inactive, friend], me)

    expect(normal.map((user) => user._id)).toEqual(['active', 'inactive'])
    expect(speed.map((user) => user._id)).toEqual(['active'])
  })

  test('분산 선정은 제외·전체 필터 후 중복 없는 핵심과 탐색 결과를 만든다', () => {
    const users = Array.from({ length: 8 }, (_, index) => ({
      _id: `user-${index}`,
      last_login: new Date(Date.now() - index * 60_000).toISOString(),
      score: 1 - index / 10,
    }))

    const selected = applyDistributedSelection(users, {}, {
      seedDay: '20260820',
      viewerId: 'viewer',
      excludeIdsSet: new Set(['user-0']),
      applyTotalFilter: (list: Array<{ _id: string }>) => list.filter((user) => user._id !== 'user-1'),
      coreCount: 3,
      exploreCount: 1,
    })

    const ids = selected.map((user) => user._id)
    expect(ids).toHaveLength(4)
    expect(new Set(ids).size).toBe(4)
    expect(ids).not.toContain('user-0')
    expect(ids).not.toContain('user-1')
  })
})
