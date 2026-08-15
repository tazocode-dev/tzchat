<!-- src/components/02010_minipage/mini_list/UserList.vue -->

<template>
  <!-- 회원 목록 -->
  <ion-list v-if="!isLoading && users.length" class="users-list fl-scope">
    <div
      v-for="(user, idx) in users"
      :key="user._id"
      class="list-row"
    >
      <!-- ✅ 행 사이 회색 구분선: 실제 DOM 요소 -->
      <div v-if="idx > 0" class="row-divider" aria-hidden="true"></div>

      <!-- ① 프로필/정보 -->
      <ion-item button detail @click="$emit('select', user)" class="row-item">
        <!-- 좌측: 대표사진 -->
        <!-- ✅ 아바타 클릭 시에도 프로필로 이동하도록 수정 -->
        <div
          class="list-avatar lead-start"
          slot="start"
          role="button"
          tabindex="0"
          @click="$emit('select', user)"
          @keydown.enter="$emit('select', user)"
          @keydown.space.prevent="$emit('select', user)"
        >
          <ProfilePhotoViewer
            :userId="user._id"
            :gender="user.gender"
            :size="90"
          />
        </div>

        <!-- 본문 -->
        <ion-label class="black-text">
          <h3 class="title">
            <span class="nickname">{{ user.nickname }}</span>
          </h3>

          <p class="meta">
            <ion-icon :icon="icons.calendarOutline" class="row-icon" aria-hidden="true" />
            나이 : {{ user.birthyear }}
          </p>
          <p class="meta">
            <ion-icon :icon="user.gender === 'man' ? icons.maleOutline : icons.femaleOutline" class="row-icon" aria-hidden="true" />
            성별 : {{ user.gender === 'man' ? '남자' : '여자' }}
          </p>
          <p class="meta">
            <ion-icon :icon="icons.locationOutline" class="row-icon" aria-hidden="true" />
            지역 : {{ user.region1 }} / {{ user.region2 }}
          </p>

          <!-- ✅ 특징: 프리미엄회원 전용 노출
          <p class="meta">
            <ion-icon :icon="icons.chatbubblesOutline" class="row-icon" aria-hidden="true" />
            특징 : {{ viewerIsPremium ? (user.preference || '-') : '🔒' }}
          </p>-->

          <!-- ✅ 결혼: 프리미엄회원 전용 노출 
          <p class="meta">
            <ion-icon :icon="icons.chatbubblesOutline" class="row-icon" aria-hidden="true" />
            결혼 : {{ viewerIsPremium ? (user.marriage || '-') : '🔒' }}
          </p>-->

          <p class="meta">
            <ion-icon :icon="icons.chatbubblesOutline" class="row-icon" aria-hidden="true" />
            멘션 : {{ (user.selfintro ?? user.selfIntro ?? '').trim() || '미입력' }}
          </p>

          <!-- (옵션) 본문 내부 보조 슬롯 -->
          <div v-if="$slots['item-extra']" class="item-extra" @click.stop>
            <slot name="item-extra" :user="user" />
          </div>
        </ion-label>
      </ion-item>

      <!-- ② 카드 하단 버튼 줄: 슬롯이 있을 때만 렌더 -->
      <div
        v-if="$slots['item-actions']"
        class="actions-bar"
        @click.stop
      >
        <slot name="item-actions" :user="user" />
      </div>
    </div>
  </ion-list>

  <!-- 빈 상태 -->
  <ion-text color="medium" v-else-if="!isLoading && !users.length">
    <p class="ion-text-center">{{ emptyText }}</p>
  </ion-text>

  <!-- 로딩 상태 -->
  <ion-text color="medium" v-else>
    <p class="ion-text-center">사용자 정보를 불러오는 중입니다...</p>
  </ion-text>
</template>

<script setup>
import ProfilePhotoViewer from '@/shared/components/ProfilePhotoViewer.vue'
import { IonList, IonItem, IonLabel, IonText, IonIcon } from '@ionic/vue'
import { computed } from 'vue'
import {
  calendarOutline,
  maleOutline,
  femaleOutline,
  locationOutline,
  chatbubblesOutline,
  timeOutline
} from 'ionicons/icons'

const props = defineProps({
  users: { type: Array, default: () => [] },
  isLoading: { type: Boolean, default: false },
  emptyText: { type: String, default: '조건에 맞는 사용자가 없습니다.' },
  /** ✅ 뷰어(현재 로그인 사용자) 등급: '일반회원' | '라이트회원' | '프리미엄회원'
   *    - 부모가 전달하지 않으면 로컬스토리지에서 폴백 시도
   */
  viewerLevel: { type: String, default: '' },
  /** ✅ 선택: 명시적 프리미엄회원 여부 전달(불리언/문자) */
  isPremium: { type: [Boolean, String], default: undefined },
})
defineEmits(['select'])

const icons = {
  calendarOutline,
  maleOutline,
  femaleOutline,
  locationOutline,
  chatbubblesOutline,
  timeOutline
}

/** ✅ 프리미엄회원 여부 통합 판정 (prop 우선 → 로컬스토리지 폴백) */
const viewerIsPremium = computed(() => {
  // 1) 불리언/문자 prop 직접 전달 시 최우선
  if (typeof props.isPremium === 'boolean') return props.isPremium === true
  if (typeof props.isPremium === 'string') {
    const s = props.isPremium.toLowerCase().trim()
    if (['true', '1', 'yes', 'y'].includes(s)) return true
    if (['false', '0', 'no', 'n'].includes(s)) return false
  }

  // 2) 레벨 문자열 판정 (ko/en 혼용 허용)
  const level = (props.viewerLevel || '').trim().toLowerCase()
  if (['프리미엄회원', 'premium', 'premium_member', 'prem'].includes(level)) return true

  // 3) 로컬 스토리지 폴백 (여러 키 허용)
  const lvLS = (localStorage.getItem('user_level') || localStorage.getItem('level') || '').trim().toLowerCase()
  if (['프리미엄회원', 'premium', 'premium_member', 'prem'].includes(lvLS)) return true

  const boolish = (localStorage.getItem('isPremium') || '').toLowerCase().trim()
  if (['true', '1', 'yes', 'y'].includes(boolish)) return true

  return false
})
</script>

<style scoped>
.fl-scope {
  display: grid;
  gap: 12px;
  margin: 0 0 18px;
  padding: 0;
  background: transparent;
}

.list-row {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--panel-border);
  border-radius: 20px;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

@media (hover: hover) {
  .list-row:hover {
    border-color: #d8c8b4;
    box-shadow: 0 12px 30px rgba(43, 35, 28, 0.1);
    transform: translateY(-1px);
  }
}

.row-divider { display: none; }

.row-item {
  --inner-border-width: 0 !important;
  --background: transparent !important;
  --background-hover: var(--panel-soft) !important;
  --background-activated: #eee8df !important;
  --min-height: 118px;
  --inner-padding-top: 13px;
  --inner-padding-bottom: 13px;
  --padding-start: 14px;
  --inner-padding-end: 14px;
  --inner-padding-start: 0;
  color: var(--text);
}

.row-item:active { transform: scale(0.995); }
.row-item::part(native) { padding-inline: 14px 10px; }
.row-item::part(start) { margin-inline-start: 0; margin-inline-end: 0; }

.list-avatar {
  width: 92px;
  height: 92px;
  min-width: 92px;
  margin-right: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid #e5ddd3;
  border-radius: 24px;
  background: var(--panel-soft);
  box-shadow: inset 0 0 0 4px rgba(255, 255, 255, 0.65);
  cursor: pointer;
}

.list-avatar :deep(.viewer-host) { width: 100%; height: 100%; }
.list-avatar :deep(.avatar) {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover;
  border-radius: 23px !important;
  box-shadow: none !important;
  pointer-events: none;
}

.black-text { color: var(--text); }
.title {
  margin: 0 0 7px;
  color: var(--text-strong);
  font-size: 17px;
  font-weight: 820;
  line-height: 1.25;
  letter-spacing: -0.025em;
}

.nickname { font-weight: 820; }
.meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 3px 0 0;
  color: var(--text-dim);
  font-size: 12.5px;
  line-height: 1.35;
}

.row-icon {
  flex: 0 0 auto;
  color: var(--gold);
  font-size: 14px;
}

.item-extra { margin-top: 8px; }

.actions-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding: 10px 14px 12px;
  border-top: 1px solid var(--panel-border);
  background: var(--panel-2);
}

.actions-bar :deep(ion-button) { width: auto; display: inline-flex; }

:deep(.ion-text-center) {
  margin: 56px 20px;
  color: var(--text-dim);
  font-size: 14px;
}

@media (max-width: 360px) {
  .fl-scope { gap: 10px; }
  .list-row { border-radius: 17px; }
  .row-item { --min-height: 106px; --padding-start: 10px; --inner-padding-end: 8px; }
  .row-item::part(native) { padding-inline: 10px 6px; }
  .list-avatar { width: 78px; height: 78px; min-width: 78px; margin-right: 12px; border-radius: 20px; }
  .list-avatar :deep(.avatar) { border-radius: 19px !important; }
  .meta { font-size: 11.5px; }
  .actions-bar { padding: 8px 10px 10px; }
}
</style>
