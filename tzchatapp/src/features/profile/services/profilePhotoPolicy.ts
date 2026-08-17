export const MAX_PROFILE_PHOTOS = 2
export const PROFILE_PHOTO_LIMIT_MESSAGE = '현재 프로필 사진은 최대 2장까지 등록할 수 있습니다.'

export function canAddProfilePhoto(currentCount: number, slotIndex: number): boolean {
  return currentCount < MAX_PROFILE_PHOTOS && slotIndex >= 0 && slotIndex < MAX_PROFILE_PHOTOS
}
