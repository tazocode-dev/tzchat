<!-- src/components/05110_Membership/Page/purchasePoint.vue -->
<template>
  <ion-page class="purchase-detail">
    <ion-header translucent="true">
      <ion-toolbar>
        <ion-title>루비 구매</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <section class="hero">
        <h2>루비 패키지</h2>
        <p>결제금액은 부가세 포함 총액으로 표시됩니다.</p>
      </section>

      <ion-card class="option">
        <ion-card-header>
          <ion-card-title>루비 x100</ion-card-title>
        </ion-card-header>
        <ion-card-content>
          <div class="price">₩{{ fmt(total) }} <span class="vat">부가세 포함</span></div>
          <ul class="split">
            <li>공급가액: ₩{{ fmt(supply) }}</li>
            <li>부가가치세(10%): ₩{{ fmt(vat) }}</li>
          </ul>
          <ion-button expand="block" class="btn-gold" @click="pay">구매하기</ion-button>
        </ion-card-content>
      </ion-card>

      <div class="canvas"></div>
    </ion-content>
  </ion-page>
</template>

<script setup>
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonContent,
  IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonButton
} from '@ionic/vue'

const total = 9900
const supply = Math.round(total / 1.1)
const vat = total - supply
const fmt = (n) => n.toLocaleString('ko-KR')

function pay () {
  // TODO: 결제 모듈 연동
  console.log('pay: ruby x400', { total, supply, vat })
}
</script>

<style scoped>
.purchase-detail { background: #0a0a0a; color: #fff; }
.hero { padding: 16px; }
.option { margin: 12px 16px; background: #111; border: 1px solid #2a2a2a; }
.price { font-size: 20px; font-weight: 800; }
.vat { font-size: 12px; opacity: .8; margin-left: 6px; }
.split { margin: 8px 0 16px; padding-left: 18px; line-height: 1.6; }
.btn-gold { --background: #b9932f; --background-hover: #caa03a; --color: #000; font-weight: 700; }
.canvas { margin: 16px; height: 46vh; border: 1px solid #2a2a2a; border-radius: 12px; background: #0f0f0f; }
</style>
