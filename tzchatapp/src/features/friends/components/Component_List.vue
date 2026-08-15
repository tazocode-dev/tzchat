<template>
  <ion-list v-if="!isLoading && items.length" class="users-list">
    <!-- ✅ 각 항목 래퍼: ion-item 위(정보) + 아래(버튼바) -->
    <div
      v-for="(item, idx) in items"
      :key="item._id || item.id || idx"
      class="list-row"
    >
      <!-- ① 프로필/정보 -->
      <ion-item button detail @click="$emit('select', getUser(item), item, idx)">
        <div class="list-avatar lead-start" slot="start" @click.stop>
          <ProfilePhotoViewer
            :userId="getUser(item)?._id"
            :gender="getUser(item)?.gender"
            :size="90"
          />
        </div>

        <ion-label class="black-text">
          <h3 class="title">
            <span class="nickname">{{ getUser(item)?.nickname || '(이름없음)' }}</span>
          </h3>

          <p class="meta">
            <ion-icon :icon="icons.calendarOutline" class="row-icon" />
            출생년도 : {{ getUser(item)?.birthyear ?? '-' }}
          </p>
          <p class="meta">
            <ion-icon :icon="getUser(item)?.gender === 'man' ? icons.maleOutline : icons.femaleOutline" class="row-icon" />
            성별 : {{ getUser(item)?.gender === 'man' ? '남자' : '여자' }}
          </p>
          <p class="meta">
            <ion-icon :icon="icons.locationOutline" class="row-icon" />
            지역 : {{ getUser(item)?.region1 || '-' }} / {{ getUser(item)?.region2 || '-' }}
          </p>
          <p class="meta">
            <ion-icon :icon="icons.chatbubblesOutline" class="row-icon" />
            특징 : {{ getUser(item)?.preference || '-' }}
          </p>
          <p class="meta">
            <ion-icon :icon="icons.timeOutline" class="row-icon" />
            최근 접속 : 회원전용
          </p>
          <p class="meta">
            <ion-icon :icon="icons.chatbubblesOutline" class="row-icon" />
            멘션 : {{ ((getUser(item)?.selfintro ?? getUser(item)?.selfIntro) ?? '').trim() || '미입력' }}
          </p>

          <!-- (옵션) 위쪽 본문 안에 표시할 추가정보 슬롯 -->
          <div v-if="$slots['item-extra']" class="item-extra" @click.stop>
            <slot name="item-extra" :user="getUser(item)" :item="item" :index="idx" />
          </div>
        </ion-label>
      </ion-item>

      <!-- ② 카드 '하단' 가로 버튼바: ion-item 밖 -->
      <div
        v-if="$slots['item-actions']"
        class="actions-bar"
        @click.stop
      >
        <slot name="item-actions" :user="getUser(item)" :item="item" :index="idx" />
      </div>
    </div>
  </ion-list>

  <!-- 빈 상태 -->
  <ion-text color="medium" v-else-if="!isLoading && !items.length">
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
import {
  calendarOutline, maleOutline, femaleOutline,
  locationOutline, chatbubblesOutline, timeOutline
} from 'ionicons/icons'

const props = defineProps({
  items: { type: Array, default: () => [] },
  userKey: { type: String, default: '' },   // 'from' | 'to' | ''
  isLoading: { type: Boolean, default: false },
  emptyText: { type: String, default: '조건에 맞는 사용자가 없습니다.' },
})
defineEmits(['select'])

const getUser = (item) => (props.userKey ? (item?.[props.userKey] ?? item) : item)
const icons = { calendarOutline, maleOutline, femaleOutline, locationOutline, chatbubblesOutline, timeOutline }
</script>

<style scoped>
:root, :host{
  --bg: #0b0b0d;
  --panel: #121214;
  --panel-2: #17171a;
  --text-strong: #f3f3f3;
  --text: #d7d7d9;
  --text-dim: #a9a9ad;
  --divider: #26262a;
  --gold: #d4af37;
  --focus: rgba(212,175,55,0.45);
}

.users-list{
  background: var(--panel);
  margin: 10px 12px 16px;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(212,175,55,0.18);
  box-shadow: 0 2px 10px rgba(0,0,0,0.35);
  padding: 0;
}

/* 각 항목 구분선 */
.list-row{
  background: transparent;
  border-bottom: 1px solid var(--divider);
}
.list-row:last-of-type{ border-bottom: 0; }

/* ion-item(정보 영역) */
.list-row ion-item{
  --inner-border-width: 0;
  --background: transparent;
  --min-height: 60px;

  --inner-padding-top: 2px;
  --inner-padding-bottom: 2px;

  --padding-start: 18px;
  --inner-padding-start: 0;
  --inner-padding-end: 10px;

  color: var(--text);
  transition: background .18s ease, transform .06s ease;
}
.list-row ion-item:hover{ background: var(--panel-2); }
.list-row ion-item:active{ transform: translateY(1px); }

/* Shadow DOM 보정 */
.list-row ion-item::part(native){
  padding-left: 18px;
  padding-right: 10px;
}
.list-row ion-item::part(start){
  margin-inline-start: 0;
  margin-inline-end: 0;
}

/* 아바타 */
.list-avatar{
  width: 100px; height: 100px; min-width: 64px;
  margin-right: 30px;
  display:flex; align-items:center; justify-content:center;
  border-radius: 10%;
  overflow: hidden;
  border: 1px solid rgba(212,175,55,0.18);
  background: rgba(212,175,55,0.08);
}
.list-avatar :deep(.viewer-host){ width:100%; height:100%; }
.list-avatar :deep(.avatar){
  width:100% !important; height:100% !important; object-fit:cover;
  border-radius:0 !important; box-shadow:none !important;
}

/* 본문 */
.black-text{ color: var(--text); }
.title{
  color: var(--text-strong);
  font-size: clamp(15px, 2.6vw, 16px);
  font-weight: 800; margin: 0 0 4px; line-height: 1.28;
}
.nickname{ font-weight: 800; letter-spacing:.2px; text-shadow:0 0 10px rgba(212,175,55,.08); }

.meta{
  display:flex; align-items:center; gap:6px;
  color: var(--text); font-size: clamp(13px, 2.4vw, 14px);
  margin:2px 0 0; line-height:1.32; opacity:.94;
}
.row-icon{ font-size:15px; color:var(--gold); }

/* (옵션) 본문 추가 슬롯 */
.item-extra{ margin-top:6px; }

/* ✅ 카드 하단 버튼 바 */
.actions-bar{
  display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-start;
  padding: 10px 14px 12px;
  background:#0f0f0f;
  border-top:1px solid rgba(212,175,55,0.12);
}
@media (max-width:360px){
  .users-list{ margin:8px; border-radius:12px; }
  .list-row ion-item{ --padding-start:80px; --inner-padding-end:10px; --min-height:56px; }
  .actions-bar{ gap:8px; padding:8px 10px 10px; }
}
</style>
