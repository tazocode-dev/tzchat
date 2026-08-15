<template>
  <ion-card class="plan-card">
    <ion-card-header>
      <ion-card-title class="plan-title">{{ plan.name }}</ion-card-title>
      <ion-card-subtitle class="plan-price">
        {{ plan.priceDisplay }}
      </ion-card-subtitle>
    </ion-card-header>

    <ion-card-content>
      <p class="plan-benefit">{{ plan.benefitText }}</p>

      <ion-button
        expand="block"
        :disabled="disabled || processing"
        @click="onBuy"
      >
        <template v-if="processing">
          <ion-spinner name="crescent" class="mr-2" />
          처리중...
        </template>
        <template v-else>
          {{ plan.price === 0 ? '무료 가입' : '구매하기' }}
        </template>
      </ion-button>
    </ion-card-content>
  </ion-card>
</template>

<script setup lang="ts">
import {
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardSubtitle,
  IonCardContent,
  IonButton,
  IonSpinner,
} from '@ionic/vue'

type PlanCode = 'BASIC' | 'LIGHT' | 'PREMIUM'
type PlanName = '일반회원' | '라이트회원' | '프리미엄회원'

interface PlanItem {
  code: PlanCode
  name: PlanName
  price: number
  priceDisplay: string
  benefitText: string
  order: number
}

const props = defineProps<{
  plan: PlanItem
  disabled?: boolean
  processing?: boolean
}>()

const emit = defineEmits<{
  (e: 'buy', plan: PlanItem): void
}>()

function onBuy() {
  emit('buy', props.plan)
}
</script>

<style scoped>
.plan-card {
  border-radius: 14px;
  overflow: hidden;
}
.plan-title {
  font-size: 1.15rem;
  font-weight: 700;
}
.plan-price {
  margin-top: 4px;
  font-weight: 600;
}
.plan-benefit {
  margin: 0 0 12px 0;
  color: var(--ion-color-medium);
  font-size: 0.95rem;
  line-height: 1.35rem;
}
.mr-2 {
  margin-right: 0.5rem;
}
</style>
