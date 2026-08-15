<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>앱 버전</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-card>
        <ion-card-header>
          <ion-card-title>현재 설치된 버전</ion-card-title>
        </ion-card-header>

        <ion-card-content>
          <div style="font-size: 18px; font-weight: 700; margin-bottom: 10px;">
            {{ versionText }}
          </div>

          <div style="font-size: 13px; opacity: 0.75; line-height: 1.4;">
            빌드 번호: {{ buildText }}<br />
            앱 ID: {{ appIdText }}
          </div>

          <ion-button expand="block" style="margin-top: 14px;" @click="reload">
            다시 불러오기
          </ion-button>

          <ion-button expand="block" fill="outline" style="margin-top: 10px;" @click="goBack">
            뒤로가기
          </ion-button>
        </ion-card-content>
      </ion-card>

      <ion-toast
        :is-open="toastOpen"
        :message="toastMessage"
        :duration="1800"
        @didDismiss="toastOpen = false"
      />
    </ion-content>
  </ion-page>
</template>

<script setup>
import { ref, onMounted } from "vue";
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonButton,
  IonToast,
} from "@ionic/vue";

import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";

const versionText = ref("불러오는 중...");
const buildText = ref("-");
const appIdText = ref("-");

const toastOpen = ref(false);
const toastMessage = ref("");

async function loadVersion() {
  try {
    // 웹(브라우저)에서도 동작은 하지만, getInfo 값이 프로젝트 설정에 따라 다를 수 있음
    const info = await App.getInfo();

    versionText.value = info.version ? `v${info.version}` : "버전 정보를 가져올 수 없음";
    buildText.value = info.build ?? "-";
    appIdText.value = info.id ?? "-";

    // 참고로 플랫폼 표시도 원하면 이렇게 사용 가능:
    // Capacitor.getPlatform() -> 'ios' | 'android' | 'web'
  } catch (err) {
    versionText.value = "버전 정보를 가져오지 못했습니다.";
    buildText.value = "-";
    appIdText.value = "-";

    toastMessage.value = "버전 정보를 불러오는 중 오류가 발생했습니다.";
    toastOpen.value = true;
  }
}

function reload() {
  loadVersion();
  toastMessage.value = `다시 불러왔어요 (${Capacitor.getPlatform()})`;
  toastOpen.value = true;
}

function goBack() {
  // 라우터를 안 쓰는 경우도 있으니 history 기반으로 처리
  window.history.back();
}

onMounted(() => {
  loadVersion();
});
</script>
