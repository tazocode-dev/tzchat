<!-- src/components/05110_Membership/Page/membershipMain.vue -->
<template>
  <ion-page class="purchase-page">
    <ion-header translucent="true">
      <ion-toolbar>
        <ion-title>구매페이지</ion-title>

        <!-- 👉 오른쪽 끝으로 이동한 뒤로 버튼 -->
        <ion-buttons slot="end">
          <ion-button @click="goBack" color="light">
            <ion-icon name="chevron-back-outline" slot="start"></ion-icon>
            <span>뒤로</span>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <!-- 상단: 고정 메뉴 -->
      <div class="top-menu" role="tablist" aria-label="구매 카테고리">
        <div
          class="menu-item"
          :class="{ active: currentTab === 'point' }"
          @click="setTab('point')"
        >
          <div class="menu-title">구매<br /><span class="hl">💎루비</span></div>
          <div class="menu-price">₩{{ fmt(9900) }}</div>
        </div>

        <div
          class="menu-item"
          :class="{ active: currentTab === 'light' }"
          @click="setTab('light')"
        >
          <div class="menu-title">구독<br /><span class="hl">라이트회원</span></div>
          <div class="menu-price">₩{{ fmt(9900) }}</div>
        </div>

        <div
          class="menu-item"
          :class="{ active: currentTab === 'premium' }"
          @click="setTab('premium')"
        >
          <div class="menu-title">구독<br /><span class="hl">프리미엄회원</span></div>
          <div class="menu-price">₩{{ fmt(19800) }}</div>
        </div>
      </div>

      <!-- ✅ 하단: 클릭 시 해당 컴포넌트가 아래 영역에 표시 -->
      <div class="content-box">
        <component :is="currentComponent" />
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup>
import { ref, computed } from 'vue'
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonButton, IonIcon
} from '@ionic/vue'

import purchasePoint from '@/features/membership/pages/purchasePoint.vue'
import purchaseLight from '@/features/membership/pages/purchaseMemLight.vue'
import purchasePremium from '@/features/membership/pages/purchaseMemPremium.vue'

const currentTab = ref('point')

/* 탭 전환 */
function setTab(tab) {
  currentTab.value = tab
}

/* 현재 표시할 컴포넌트 */
const currentComponent = computed(() => {
  switch (currentTab.value) {
    case 'light': return purchaseLight
    case 'premium': return purchasePremium
    default: return purchasePoint
  }
})

/* 금액 포맷 */
const fmt = (n) => n.toLocaleString('ko-KR')

/* 이전 페이지로 이동 */
const goBack = () => {
  if (window.history.length > 1) window.history.back()
  else location.href = '/home'
}
</script>

<style scoped>
.purchase-page {
  background: #0a0a0a;
  color: #fff;
}

/* 상단 3개 박스 */
.top-menu {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding: 16px;
}
.menu-item {
  border: 1.2px solid #2a2a2a;
  border-radius: 12px;
  background: #111;
  text-align: center;
  padding: 14px 8px;
  cursor: pointer;
  user-select: none;
  transition: transform .08s ease, border-color .12s ease, background .12s ease, color .12s ease;
}
.menu-item:active { transform: scale(.99); }

/* ✅ 클릭한 버튼 강조 */
.menu-item.active {
  border-color: #caa03a;
  background: linear-gradient(180deg, #191919, #141109);
  color: #f6e3a1;
  box-shadow: 0 0 0 1px #caa03a55 inset;
}
.menu-item.active .menu-title,
.menu-item.active .menu-price { color: #f6e3a1; }

.menu-title {
  line-height: 1.25;
  font-size: 16px;
  font-weight: 700;
  word-break: keep-all;
}
.menu-title .hl { color: #caa03a; font-weight: 800; }
.menu-price {
  margin-top: 8px;
  font-size: 14px;
  opacity: .95;
}

/* 하단 내용 박스 */
.content-box {
  margin: 0 16px 16px;
  min-height: 320px;
  border: 1.2px solid #2a2a2a;
  border-radius: 12px;
  background: #0f0f0f;
  overflow: auto;
  padding: 12px;
}

/* 작은 화면 대응 */
@media (max-width: 420px) {
  .menu-title { font-size: 15px; }
  .menu-price { font-size: 13px; }
}
</style>
