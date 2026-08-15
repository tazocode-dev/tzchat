<template>
  <ion-page><ion-content class="ion-padding"><p role="status">아동 안전 기준을 여는 중…</p></ion-content></ion-page>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { IonContent, IonPage } from '@ionic/vue'
import { useRouter } from 'vue-router'
const router = useRouter()
onMounted(() => router.replace('/home/legals/v2/youth-policy'))
</script>
