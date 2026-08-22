import { describe, expect, test } from 'vitest'
import {
  MAX_PROFILE_PHOTOS,
  PROFILE_PHOTO_LIMIT_MESSAGE,
  canAddProfilePhoto,
} from '@/features/profile/services/profilePhotoPolicy'
import managerSource from '@/features/profile/components/ProfilePhotoManager.vue?raw'

describe('프로필 사진 2장 정책', () => {
  test('1·2번 빈 슬롯에만 추가할 수 있다', () => {
    expect(MAX_PROFILE_PHOTOS).toBe(2)
    expect(canAddProfilePhoto(0, 0)).toBe(true)
    expect(canAddProfilePhoto(0, 1)).toBe(true)
    expect(canAddProfilePhoto(0, 2)).toBe(false)
    expect(canAddProfilePhoto(1, 1)).toBe(true)
    expect(canAddProfilePhoto(2, 0)).toBe(false)
    expect(canAddProfilePhoto(3, 0)).toBe(false)
    expect(PROFILE_PHOTO_LIMIT_MESSAGE).toBe('현재 프로필 사진은 최대 2장까지 등록할 수 있습니다.')
  })

  test('사진 관리 컴포넌트는 8칸과 잠금·aria 표시를 적용한다', () => {
    expect(managerSource).toContain('const MAX_SLOTS = 8')
    expect(managerSource).toContain('Math.max(MAX_SLOTS, images.value.length)')
    expect(managerSource).toContain('v-for="n in visibleSlotCount"')
    expect(managerSource).toContain('v-else-if="canAddProfilePhoto(images.length, n - 1)"')
    expect(managerSource).toContain('class="slot-locked"')
    expect(managerSource).toContain('aria-disabled="true"')
    expect(managerSource).toContain('<span aria-hidden="true">🔒</span>')
    expect(managerSource).toContain('<span>잠금</span>')
    expect(managerSource).toContain('PROFILE_PHOTO_LIMIT_MESSAGE')
  })

  test('기존 3장 이상은 이미지 분기에서 계속 표시·삭제하고 새 업로드만 재차 차단한다', () => {
    expect(managerSource.indexOf('n - 1 < images.length'))
      .toBeLessThan(managerSource.indexOf('canAddProfilePhoto(images.length, n - 1)'))

    expect(managerSource).toContain('if (!canAddProfilePhoto(images.value.length, uploadSlotIdx.value)) { showPhotoLimit(); return }')
    expect(managerSource).toContain('async function confirmCrop()')
    expect(managerSource).toContain('@click.stop="askDelete(images[n-1])"')
  })
})
