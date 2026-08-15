<template>
  <div class="page-wrapper">
    <div class="container">
      <!-- ✅ 내 프로필 카드 -->
      <div v-if="user" class="card pf-scope profile-card">
        <h3 class="card-title">
          <IonIcon :icon="icons.personCircleOutline" class="title-icon" />
          {{ user.nickname }}
        </h3>

        <!-- ✅ 프로필 사진 컴포넌트 (lazy-load) -->
        <div class="pf-photo">
          <ProfilePhotoManager
            :gender="user?.gender || ''"
            :readonly="false"
            @updated="onProfilePhotoUpdated"
            @main-changed="onProfileMainChanged"
          />
        </div>

        <div class="title-actions">
          <button class="title-action-btn" type="button" @click="goSetting" aria-label="설정으로 이동">
            <IonIcon :icon="icons.settingsOutline" class="action-icon" />
            <span class="action-text">설정</span>
          </button>
        </div>

        <table class="info-table">
          <colgroup><col class="pf-col-th" /><col class="pf-col-td" /></colgroup>
          <tbody>
            <tr>
              <td class="pf-th">
                <IonIcon :icon="icons.ribbonOutline" class="row-icon" />
                <strong class="label">회원</strong>
              </td>
              <td class="pf-td readonly">손끝 회원</td>
            </tr>

            <!-- 닉네임 -->
            <tr
              :class="['editable-row', { disabled: !canEditFieldLocal('nickname') }]"
              tabindex="0"
              @click="canEditFieldLocal('nickname') ? openPopup(4, user.nickname) : lock('닉네임')"
              @keydown.enter="canEditFieldLocal('nickname') ? openPopup(4, user.nickname) : null"
            >
              <td class="pf-th">
                <IonIcon :icon="icons.personCircleOutline" class="row-icon" />
                <strong class="label">닉네임</strong>
              </td>
              <td class="pf-td editable-text">{{ user.nickname }}</td>
            </tr>

            <!-- 나이 -->
            <tr class="editable-row disabled" aria-disabled="true">
              <td class="pf-th">
                <IonIcon :icon="icons.calendarOutline" class="row-icon" />
                <strong class="label">나이</strong>
              </td>
              <td class="pf-td readonly editable-text">
                {{ user.birthyear || '미입력' }}
              </td>
            </tr>

            <!-- 성별 -->
            <tr class="editable-row disabled" aria-disabled="true">
              <td class="pf-th">
                <IonIcon :icon="icons.maleFemaleOutline" class="row-icon" />
                <strong class="label">성별</strong>
              </td>
              <td class="pf-td readonly editable-text">
                {{ user.gender === 'man' ? '남자' : user.gender === 'woman' ? '여자' : '미입력' }}
              </td>
            </tr>

            <!-- 지역 -->
            <tr
              :class="['editable-row', { disabled: !canEditFieldLocal('region') }]"
              tabindex="0"
              @click="canEditFieldLocal('region') ? openPopup(1, user.region1 + ' ' + user.region2) : lock('지역')"
              @keydown.enter="canEditFieldLocal('region') ? openPopup(1, user.region1 + ' ' + user.region2) : null"
            >
              <td class="pf-th">
                <IonIcon :icon="icons.locationOutline" class="row-icon" />
                <strong class="label">지역</strong>
              </td>
              <td class="pf-td editable-text">{{ user.region1 }} {{ user.region2 }}</td>
            </tr>

            <!-- 특징 -->
            <tr
              :class="['editable-row', { disabled: !canEditFieldLocal('preference') }]"
              tabindex="0"
              @click="canEditFieldLocal('preference') ? openPopup(2, user.preference) : lock('특징')"
              @keydown.enter="canEditFieldLocal('preference') ? openPopup(2, user.preference) : null"
            >
              <td class="pf-th">
                <IonIcon :icon="icons.sparklesOutline" class="row-icon" />
                <strong class="label">특징</strong>
              </td>
              <td class="pf-td editable-text">
                <span
                  v-if="preferenceRestricted && !isPremiumComputed"
                  class="pf-hint"
                  title="일반/라이트회원은 '이성친구' 계열만 선택 가능"
                ></span>
                {{ user.preference }}
              </td>
            </tr>

            <!-- 결혼 -->
            <tr
              :class="['editable-row', { disabled: !canEditFieldLocal('marriage') }]"
              tabindex="0"
              @click="canEditFieldLocal('marriage') ? openMarriageModal() : lock('결혼')"
              @keydown.enter="canEditFieldLocal('marriage') ? openMarriageModal() : null"
            >
              <td class="pf-th">
                <IonIcon :icon="icons.sparklesOutline" class="row-icon" />
                <strong class="label">결혼</strong>
              </td>
              <td class="pf-td editable-text">{{ user.marriage }}</td>
            </tr>
          </tbody>
        </table>

        <table class="info-table">
          <colgroup><col class="pf-col-th" /><col class="pf-col-td" /></colgroup>
          <tbody>
            <!-- 소개 -->
            <tr
              :class="['editable-row', { disabled: !canEditFieldLocal('selfintro') }]"
              tabindex="0"
              @click="canEditFieldLocal('selfintro') ? openPopup(3, user.selfintro || '소개 없음') : lock('소개')"
              @keydown.enter="canEditFieldLocal('selfintro') ? openPopup(3, user.selfintro || '소개 없음') : null"
            >
              <td class="pf-th">
                <IonIcon :icon="icons.chatbubbleEllipsesOutline" class="row-icon" />
                <strong class="label">소개</strong>
              </td>
              <td class="pf-td editable-text">{{ user.selfintro || '소개 없음' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <br />

      <!-- ✅ 친구 찾기 설정 카드 -->
      <div v-if="user" class="card pf-scope">
        <h3 class="card-title">
          <IonIcon :icon="icons.optionsOutline" class="title-icon" />
          친구 찾기 설정
        </h3>

        <table class="info-table">
          <colgroup><col class="pf-col-th" /><col class="pf-col-td" /></colgroup>
          <tbody>
            <!-- 검색나이 -->
            <tr
              :class="['editable-row', { disabled: !canEditFieldLocal('search_year') }]"
              tabindex="0"
              @click="canEditFieldLocal('search_year') ? openSearchYearModal() : lock('검색나이')"
              @keydown.enter="canEditFieldLocal('search_year') ? openSearchYearModal() : null"
            >
              <td class="pf-th">
                <IonIcon :icon="icons.calendarNumberOutline" class="row-icon" />
                <strong class="label">검색나이</strong>
              </td>
              <td class="pf-td editable-text">
                {{ toAll(user.search_birthyear1) }} ~ {{ toAll(user.search_birthyear2) }}
              </td>
            </tr>

            <!-- 검색지역 -->
            <tr
              :class="['editable-row', { disabled: !canEditFieldLocal('search_regions') }]"
              tabindex="0"
              @click="canEditFieldLocal('search_regions') ? openSearchRegionModal() : lock('검색지역')"
              @keydown.enter="canEditFieldLocal('search_regions') ? openSearchRegionModal() : null"
            >
              <td class="pf-th">
                <IonIcon :icon="icons.locationOutline" class="row-icon" />
                <strong class="label">검색지역</strong>
              </td>
              <td class="pf-td editable-text">{{ searchRegionDisplay }}</td>
            </tr>

            <!-- 휴대폰 내 번호 연결 끊기 -->
            <tr class="editable-row" tabindex="0" @keydown.enter.prevent="toggleDisconnectLocalContacts">
              <td class="pf-td2 pf-fullcell" colspan="2">
                <div class="pf-fullrow">
                  <IonIcon :icon="icons.optionsOutline" class="row-icon" />
                  <strong class="label pf-fullrow__label">휴대폰 내 번호 연결 끊기</strong>
                  <button
                    type="button"
                    class="pf-switch"
                    role="switch"
                    :aria-checked="disconnectLocalContacts"
                    :class="{ 'is-on': disconnectLocalContacts }"
                    @click.stop="toggleDisconnectLocalContacts"
                  >
                    <span class="pf-switch__text pf-switch__text--left" aria-hidden="true">ON</span>
                    <span class="pf-switch__knob" />
                    <span class="pf-switch__label">{{ disconnectLocalContacts ? 'ON' : 'OFF' }}</span>
                  </button>
                </div>
              </td>
            </tr>

            <!-- 친구 신청 받지 않기 -->
            <tr class="editable-row" tabindex="0" @keydown.enter.prevent="toggleAllowFriendRequests">
              <td class="pf-td2 pf-fullcell" colspan="2">
                <div class="pf-fullrow">
                  <IonIcon :icon="icons.optionsOutline" class="row-icon" />
                  <strong class="label pf-fullrow__label">친구 신청 받지 않기</strong>
                  <button
                    type="button"
                    class="pf-switch"
                    role="switch"
                    :aria-checked="!allowFriendRequests"
                    :class="{ 'is-on': !allowFriendRequests }"
                    @click.stop="toggleAllowFriendRequests"
                  >
                    <span class="pf-switch__text pf-switch__text--left" aria-hidden="true">ON</span>
                    <span class="pf-switch__knob" />
                    <span class="pf-switch__label">{{ !allowFriendRequests ? 'ON' : 'OFF' }}</span>
                  </button>
                </div>
              </td>
            </tr>

            <!-- 알림 받지 않기 -->
            <tr class="editable-row" tabindex="0" @keydown.enter.prevent="toggleAllowNotifications">
              <td class="pf-td2 pf-fullcell" colspan="2">
                <div class="pf-fullrow">
                  <IonIcon :icon="icons.optionsOutline" class="row-icon" />
                  <strong class="label pf-fullrow__label">알림 받지 않기</strong>
                  <button
                    type="button"
                    class="pf-switch"
                    role="switch"
                    :aria-checked="!allowNotifications"
                    :class="{ 'is-on': !allowNotifications }"
                    @click.stop="toggleAllowNotifications"
                  >
                    <span class="pf-switch__text pf-switch__text--left" aria-hidden="true">ON</span>
                    <span class="pf-switch__knob" />
                    <span class="pf-switch__label">{{ !allowNotifications ? 'ON' : 'OFF' }}</span>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <br />

      <!-- 매칭 설정 카드 -->
      <div v-if="user" class="card pf-scope">
        <h3 class="card-title">
          <IonIcon :icon="icons.optionsOutline" class="title-icon" />
          매칭 설정
        </h3>

        <table class="info-table">
          <colgroup><col class="pf-col-th" /><col class="pf-col-td" /></colgroup>
          <tbody>
            <!-- 검색특징 -->
            <tr
              :class="['editable-row', { disabled: !canEditFieldLocal('search_preference') }]"
              tabindex="0"
              @click="canEditFieldLocal('search_preference') ? openSearchPreferenceModal() : lock('검색특징', '라이트회원 이상 사용 가능')"
              @keydown.enter="canEditFieldLocal('search_preference') ? openSearchPreferenceModal() : null"
            >
              <td class="pf-th">
                <IonIcon :icon="icons.sparklesOutline" class="row-icon" />
                <strong class="label">검색특징</strong>
              </td>
              <td class="pf-td editable-text">
                <span v-if="!canEditFieldLocal('search_preference')" class="pf-lock">🔒</span>
                {{ user.search_preference }}
              </td>
            </tr>

            <!-- 검색결혼 -->
            <tr
              :class="['editable-row', { disabled: !canEditFieldLocal('search_marriage') }]"
              tabindex="0"
              @click="canEditFieldLocal('search_marriage') ? openSearchMarriageModal() : lock('검색결혼', '라이트회원 이상 사용 가능')"
              @keydown.enter="canEditFieldLocal('search_marriage') ? openSearchMarriageModal() : null"
            >
              <td class="pf-th">
                <IonIcon :icon="icons.sparklesOutline" class="row-icon" />
                <strong class="label">검색결혼</strong>
              </td>
              <td class="pf-td editable-text">
                <span v-if="!canEditFieldLocal('search_marriage')" class="pf-lock">🔒</span>
                {{ user.search_marriage }}
              </td>
            </tr>

            <!-- 사진 있는 사람만 -->
            <tr class="editable-row">
              <td class="pf-td2 pf-fullcell" colspan="2">
                <div class="pf-fullrow">
                  <IonIcon :icon="icons.optionsOutline" class="row-icon" />
                  <strong class="label pf-fullrow__label">사진 있는 사람만 연결하기</strong>
                  <span v-if="!canEditFieldLocal('onlyWithPhoto')" class="pf-lock-inline">🔒</span>
                  <button
                    type="button"
                    class="pf-switch"
                    :class="{ 'is-on': onlyWithPhoto, disabled: !canEditFieldLocal('onlyWithPhoto') }"
                    role="switch"
                    :aria-checked="onlyWithPhoto"
                    :aria-disabled="!canEditFieldLocal('onlyWithPhoto')"
                    @click.stop="onToggleOnlyWithPhoto"
                  >
                    <span class="pf-switch__text pf-switch__text--left" aria-hidden="true">ON</span>
                    <span class="pf-switch__knob" />
                    <span class="pf-switch__label">
                      {{ onlyWithPhoto ? 'ON' : 'OFF' }}
                    </span>
                  </button>
                </div>
              </td>
            </tr>

          </tbody>
        </table>
      </div>

      <p v-else class="loading-text">유저 정보를 불러오는 중입니다...</p>
    </div>

    <!-- 모달들 (lazy-load) -->
    <PopupModal_1 v-if="showModal1" :message="popupMessage" @close="showModal1 = false" @updated="handleRegionUpdate" />
    <PopupModal_2
      v-if="showModal2"
      :message="popupMessage"
      level="프리미엄회원"
      @close="showModal2 = false"
      @updated="handlePreferenceUpdate"
    />
    <PopupModal_3 v-if="showModal3" :message="popupMessage" @close="showModal3 = false" @updated="handleIntroUpdate" />
    <PopupModal_4 v-if="showModal4" :message="popupMessage" @close="showModal4 = false" @updated="handleNicknameUpdate" />
    <ModalMarriage v-if="showMarriageModal" :message="user?.marriage || ''" @close="showMarriageModal = false" @updated="handleMarriageUpdated" />

    <Search_Year_Modal
      v-if="showSearchYear"
      :initial-from="user?.search_birthyear1 ?? ''"
      :initial-to="user?.search_birthyear2 ?? ''"
      :from="user?.search_birthyear1 ?? ''"
      :to="user?.search_birthyear2 ?? ''"
      @close="showSearchYear = false"
      @updated="onSearchYearUpdated"
    />
    <Search_Region_Modal v-if="showSearchRegion" :regions="regionsForModal" @close="showSearchRegion = false" @updated="onSearchRegionUpdated" />
    <Search_Preference_Modal v-if="showSearchPreference" :message="user?.search_preference ?? ''" @close="showSearchPreference = false" @updated="onSearchPreferenceUpdated" />
    <Search_Marriage v-if="showSearchMarriage" :message="user?.search_marriage ?? '전체'" @close="showSearchMarriage = false" @updated="handleSearchMarriageUpdated" />

    <ModalLevel
      v-if="showLevelModal"
      :current="user?.user_level || '일반회원'"
      @close="showLevelModal = false"
      @updated="handleLevelUpdated"
    />

    <PasswordChangeModal :is-open="showPasswordModal" @close="showPasswordModal = false" @updated="onPasswordUpdated" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, defineAsyncComponent } from 'vue'
import { toastController, alertController, IonIcon, IonButton } from '@ionic/vue'
import axios from '@/shared/services/api'
import { useRouter } from 'vue-router'
import { Capacitor } from '@capacitor/core'
import { setNotificationsOptOut } from '@/shared/services/webPush'
import { getNativeContactPhoneNumbers } from '@/shared/services/nativeContacts'

/**
 * ✅ 핵심 개선
 * 1) 모달/무거운 컴포넌트 lazy-load (초기 진입 번들/파싱량 감소)
 * 2) Contacts 정적 import 제거 (연락처 기능 사용할 때만 동적 import)
 * 3) 스위치 저장 PATCH 디바운스 (연타/중복 요청 방지)
 */

/* ===== lazy-load components ===== */
const PopupModal_1 = defineAsyncComponent(() => import('@/features/profile/components/Modal_region.vue'))
const PopupModal_2 = defineAsyncComponent(() => import('@/features/profile/components/Modal_preference.vue'))
const PopupModal_3 = defineAsyncComponent(() => import('@/features/profile/components/Modal_mention.vue'))
const PopupModal_4 = defineAsyncComponent(() => import('@/features/profile/components/Modal_nickname.vue'))

const Search_Year_Modal = defineAsyncComponent(() => import('@/features/profile/components/Search_Year_Modal.vue'))
const Search_Region_Modal = defineAsyncComponent(() => import('@/features/profile/components/Search_Region_Modal.vue'))
const Search_Preference_Modal = defineAsyncComponent(() => import('@/features/profile/components/Search_Preference_Modal.vue'))

const PasswordChangeModal = defineAsyncComponent(() => import('@/features/profile/components/Modal_password_chagne.vue'))
const ProfilePhotoManager = defineAsyncComponent(() => import('@/features/profile/components/ProfilePhotoManager.vue'))

const ModalMarriage = defineAsyncComponent(() => import('@/features/profile/components/Modal_marriage.vue'))
const Search_Marriage = defineAsyncComponent(() => import('@/features/profile/components/Search_Marriage.vue'))

const ModalLevel = defineAsyncComponent(() => import('@/features/profile/components/Modal_Level.vue'))

/* ===== grade rules (가벼운 js는 그대로 static import) ===== */
import {
  RULES,
  isPremium as isPremiumLevel,
  canEditField as canEditFieldByLevel,
  isRestricted as isRestrictedByLevel,
  normalizeLevel
} from '@/features/membership/grade/gradeRule.js'

import {
  personCircleOutline, lockClosedOutline, calendarOutline, calendarNumberOutline,
  maleFemaleOutline, locationOutline, sparklesOutline, chatbubbleEllipsesOutline,
  logInOutline, timeOutline, optionsOutline, settingsOutline, ribbonOutline,
} from 'ionicons/icons'
const icons = { personCircleOutline, lockClosedOutline, calendarOutline, calendarNumberOutline, maleFemaleOutline, locationOutline, sparklesOutline, chatbubbleEllipsesOutline, logInOutline, timeOutline, optionsOutline, settingsOutline, ribbonOutline }

const router = useRouter()
const nickname = ref('')
const user = ref(null)

/* 등급/편집 규칙 */
const myLevel = computed(() => normalizeLevel(user.value?.user_level || '일반회원'))
const myGender = computed(() => (user.value?.gender === 'woman' ? 'female' : 'male'))
const isPremiumComputed = computed(() => isPremiumLevel(myLevel.value))

function canEditFieldLocal(field) {
  void field
  return true
}
function isRestrictedLocal(field, kind) {
  void field
  void kind
  return false
}

/* 모달 상태 */
const showModal1 = ref(false)
const showModal2 = ref(false)
const showModal3 = ref(false)
const showModal4 = ref(false)
const showMarriageModal = ref(false)
const showSearchMarriage = ref(false)
const popupMessage = ref('')

const showSearchYear = ref(false)
const showSearchRegion = ref(false)
const showSearchPreference = ref(false)

const showLevelModal = ref(false)
function openLevelModal(){ showLevelModal.value = true }
async function handleLevelUpdated(val){
  if (user.value) user.value.user_level = val
  const t = await toastController.create({ message: '회원등급이 변경되었습니다.', duration: 1200, color: 'success' })
  t.present()
}

function openSearchYearModal(){ showSearchYear.value = true }
function openSearchRegionModal(){ showSearchRegion.value = true }
function openSearchPreferenceModal(){ showSearchPreference.value = true }

const showPasswordModal = ref(false)
function openPasswordModal() { showPasswordModal.value = true }
async function onPasswordUpdated() {
  const t = await toastController.create({ message: '비밀번호가 변경되었습니다.', duration: 1400, color: 'success' })
  t.present()
}

/* 이동 */
function goSetting() { router.push('/home/7page') }

/* 사진 */
function onProfilePhotoUpdated() {}
async function onProfileMainChanged() {
  const t = await toastController.create({ message: '대표 사진이 변경되었습니다.', duration: 1200, color: 'success' })
  t.present()
}

/* 유틸 */
const toAll = (v) => (v === null || v === undefined || v === '' ? '전체' : v)
const openPopup = (n, v) => {
  popupMessage.value = v
  showModal1.value = n===1
  showModal2.value = n===2
  showModal3.value = n===3
  showModal4.value = n===4
}

function openMarriageModal() { showMarriageModal.value = true }
function openSearchMarriageModal() { showSearchMarriage.value = true }

/* 지역 모달/표시 */
const regionsForModal = computed(() => {
  if (!user.value) return []
  const fromSnake = Array.isArray(user.value.search_regions) ? user.value.search_regions : []
  const fromCamel = Array.isArray(user.value.searchRegions) ? user.value.searchRegions : []
  const list = (fromSnake.length ? fromSnake : fromCamel).map(r => ({ region1: r?.region1 || '', region2: r?.region2 || '' }))
  if (list.length) return list
  const r1 = user.value.search_region1 || ''; const r2 = user.value.search_region2 || ''
  if (!r1 && !r2) return []
  if (r1 === '전체' && r2 === '전체') return [{ region1: '전체', region2: '전체' }]
  return [{ region1: r1, region2: r2 }]
})

const searchRegionsBuffer = ref([])
const effectiveRegions = computed(() => {
  if (searchRegionsBuffer.value?.length) return searchRegionsBuffer.value
  const snake = Array.isArray(user.value?.search_regions) ? user.value.search_regions : []
  const camel = Array.isArray(user.value?.searchRegions) ? user.value.searchRegions : []
  if (snake.length) return snake
  if (camel.length) return camel
  const r1 = user.value?.search_region1 || ''; const r2 = user.value?.search_region2 || ''
  return r1 || r2 ? [{ region1: r1, region2: r2 }] : []
})
function labelOf(it){
  const r1=(it?.region1||'').trim(), r2=(it?.region2||'').trim()
  if(!r1&&!r2) return '전체'
  if(r1==='전체'&&r2==='전체') return '전체'
  if(r2==='전체') return `${r1} 전체`
  return `${r1} ${r2}`.trim()
}
const searchRegionDisplay = computed(() => {
  const list = effectiveRegions.value
  if (!list.length) return '전체'
  if (list.length === 1 && list[0].region1 === '전체' && list[0].region2 === '전체') return '전체'
  const first = labelOf(list[0]); return list.length === 1 ? first : `${first} 외 ${list.length - 1}`
})

/* 검색나이 저장 */
async function onSearchYearUpdated(payload) {
  let from = '', to = ''
  if (typeof payload === 'string') { const [f='', t=''] = payload.split('~').map(s=>s.trim()); from=f; to=t }
  else if (Array.isArray(payload)) { from = payload[0] ?? ''; to = payload[1] ?? '' }
  else if (payload && typeof payload === 'object') { from = payload.from ?? payload.year1 ?? ''; to = payload.to ?? payload.year2 ?? '' }
  if (user.value) { user.value.search_birthyear1 = from; user.value.search_birthyear2 = to }
  try {
    await axios.patch('/api/search/year', { year1: from, year2: to }, { withCredentials: true })
    const t = await toastController.create({ message: '검색 나이가 적용되었습니다.', duration: 1500, color: 'success' }); await t.present()
  } catch (err) {
    const t = await toastController.create({ message: '저장 실패: ' + (err?.response?.data?.error || err.message), duration: 2000, color: 'danger' }); await t.present()
  } finally { showSearchYear.value = false }
}

/* 검색지역 저장 */
function normalizeRegionsPayload(payload){
  let arr=[]
  if (Array.isArray(payload)) {
    if (payload.length && typeof payload[0] === 'object') arr = payload
    else { const [r1='', r2=''] = payload; arr = [{ region1:r1, region2:r2 }] }
  } else if (payload && typeof payload === 'object') {
    arr = [{ region1: payload.region1 ?? payload.r1 ?? '', region2: payload.region2 ?? payload.r2 ?? '' }]
  } else if (typeof payload === 'string') {
    const parts = payload.split(/[,\s]+/).map(s=>s.trim()).filter(Boolean); const [r1='',r2='']=parts; arr=[{region1:r1, region2:r2}]
  }
  arr = arr.map(it=>({ region1:(it.region1||'').trim(), region2:(it.region2||'').trim() })).filter(it=>it.region1 && it.region2)
  if (arr.some(it=>it.region1==='전체' && it.region2==='전체')) return [{ region1:'전체', region2:'전체' }]
  return arr
}
async function onSearchRegionUpdated(payload){
  const normalized = normalizeRegionsPayload(payload)
  if (user.value) {
    const first = normalized[0] || { region1:'', region2:'' }
    user.value.search_region1 = first.region1 || ''
    user.value.search_region2 = first.region2 || ''
    user.value.search_regions = normalized
    user.value.searchRegions = normalized
  }
  searchRegionsBuffer.value = normalized
  try {
    await axios.patch('/api/search/regions', { regions: normalized }, { withCredentials: true })
    const t = await toastController.create({ message: '검색 지역이 적용되었습니다.', duration: 1500, color: 'success' }); await t.present()
  } catch (err) {
    const t = await toastController.create({ message: '저장 실패: ' + (err?.response?.data?.error || err.message), duration: 2000, color: 'danger' }); await t.present()
  } finally { showSearchRegion.value = false }
}

/* 검색특징 저장 */
async function onSearchPreferenceUpdated(payload){
  const can = canEditFieldLocal('search_preference')
  if (!can) { lock('검색특징', '일반/라이트회원은 "전체"만 사용 가능'); showSearchPreference.value = false; return }
  const preference = typeof payload === 'string' ? payload : payload?.preference ?? ''
  if (user.value) user.value.search_preference = preference
  try {
    await axios.patch('/api/search/preference', { preference }, { withCredentials: true })
    const t = await toastController.create({ message: '검색 특징이 적용되었습니다.', duration: 1500, color: 'success' }); await t.present()
  } catch (err) {
    const t = await toastController.create({ message: '저장 실패: ' + (err?.response?.data?.error || err.message), duration: 2000, color: 'danger' }); await t.present()
  } finally { showSearchPreference.value = false }
}

/* 결혼(본인) */
async function handleMarriageUpdated(value){
  if (user.value) user.value.marriage = value
  const t = await toastController.create({ message: '결혼유무가 변경되었습니다.', duration: 1300, color: 'success' })
  await t.present()
  showMarriageModal.value = false
}

/* 결혼(검색조건) */
async function handleSearchMarriageUpdated(value){
  if (!canEditFieldLocal('search_marriage')) {
    lock('검색결혼', '일반/라이트회원은 "전체"만 사용 가능')
    showSearchMarriage.value = false
    return
  }
  if (user.value) user.value.search_marriage = value
  const t = await toastController.create({ message: '검색 결혼유무가 변경되었습니다.', duration: 1300, color: 'success' })
  await t.present()
  showSearchMarriage.value = false
}

/* 기타 필드 업데이트 */
async function handleNicknameUpdate(payload){
  const v = typeof payload==='string' ? payload : payload?.nickname ?? ''
  if(user.value && v) user.value.nickname=v
  ;(await toastController.create({message:'닉네임이 변경되었습니다.',duration:1400,color:'success'})).present()
  showModal4.value=false
}
async function handleRegionUpdate(payload){
  let r1='',r2=''
  if(Array.isArray(payload)){[r1='',r2='']=payload}
  else if(payload&&typeof payload==='object'){r1=payload.region1??payload.r1??''; r2=payload.region2??payload.r2??''}
  else if(typeof payload==='string'){const p=payload.split(/[,\s]+/).map(s=>s.trim()).filter(Boolean); [r1='',r2='']=p}
  if(user.value){user.value.region1=r1; user.value.region2=r2}
  ;(await toastController.create({message:'지역이 변경되었습니다.',duration:1400,color:'success'})).present()
  showModal1.value=false
}
const preferenceRestricted = computed(() => isRestrictedLocal('preference', 'hetero-only'))
async function handlePreferenceUpdate(payload){
  let pref = typeof payload === 'string' ? payload : payload?.preference ?? ''
  if (!isPremiumComputed.value && preferenceRestricted.value) {
    if (!String(pref).startsWith('이성친구')) {
      pref = '이성친구 - 전체'
      ;(await toastController.create({
        message: '일반/라이트회원은 "이성친구"만 선택할 수 있습니다. 기본값으로 적용합니다.',
        duration: 1600,
        color: 'warning'
      })).present()
    }
  }
  if (user.value) {
    user.value.preference = pref
    if (pref.startsWith('이성친구')) {
      user.value.search_preference = '이성친구 - 전체'
    } else if (pref.startsWith('동성친구')) {
      user.value.search_preference = '동성친구 - 전체'
    }
  }
  ;(await toastController.create({ message: '성향이 변경되었습니다.', duration: 1400, color: 'success' })).present()
  showModal2.value = false
}
async function handleIntroUpdate(payload){
  const intro = typeof payload==='string' ? payload : payload?.selfintro ?? ''
  if(user.value) user.value.selfintro=intro
  ;(await toastController.create({message:'소개이 변경되었습니다.',duration:1400,color:'success'})).present()
  showModal3.value=false
}

/* 스위치들 */
const disconnectLocalContacts = ref(false)
const allowFriendRequests    = ref(false)
const allowNotifications     = ref(false)
const onlyWithPhoto          = ref(false)

const onOffToBool = (v) => String(v || '').toUpperCase() === 'ON'
const boolToOnOff = (b) => (b ? 'ON' : 'OFF')

/** ✅ 스위치 저장 디바운스 (연타/중복 요청 방지) */
let _saveTimer = null
function saveSwitchesDebounced(delay = 250) {
  if (_saveTimer) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(async () => {
    try { await saveSwitchesToDB() }
    finally { _saveTimer = null }
  }, delay)
}

async function saveSwitchesToDB() {
  if (!user.value) return
  user.value.search_disconnectLocalContacts = boolToOnOff(disconnectLocalContacts.value)
  user.value.search_allowFriendRequests    = boolToOnOff(!allowFriendRequests.value)
  user.value.search_allowNotifications     = boolToOnOff(!allowNotifications.value)
  user.value.search_onlyWithPhoto          = boolToOnOff(onlyWithPhoto.value)

  const payload = {
    disconnectLocalContacts: user.value.search_disconnectLocalContacts,
    allowFriendRequests:     boolToOnOff(!allowFriendRequests.value),
    allowNotifications:      boolToOnOff(!allowNotifications.value),
    onlyWithPhoto:           user.value.search_onlyWithPhoto,
  }

  try {
    await axios.patch('/api/search/settings', payload, { withCredentials: true })
  } catch (err) {
    console.error('설정 저장 실패:', err)
    ;(await toastController.create({ message: '설정 저장에 실패했습니다.', duration: 1600, color: 'danger' })).present()
    throw err
  }
}

/* 연락처/토글 로직 */
async function toggleDisconnectLocalContacts(){
  const platform = Capacitor.getPlatform ? Capacitor.getPlatform() : 'web'
  const nextState = !disconnectLocalContacts.value

  // ✅ 1) 웹: 연락처/폰은 건드리지 않고, 스위치 + DB만 업데이트 (디바운스 저장)
  if (platform === 'web') {
    disconnectLocalContacts.value = nextState

    try {
      // 즉시 저장 대신 디바운스
      saveSwitchesDebounced(200)

      if (nextState) {
        const msg =
          '웹에서는 휴대폰 연락처를 불러올 수 없습니다.\n' +
          '이미 앱에서 저장된 전화번호/연락처 기준으로만 필터가 적용됩니다.'
        ;(await toastController.create({
          message: msg,
          duration: 2600,
          color: 'medium'
        })).present()
      } else {
        ;(await toastController.create({
          message: '휴대폰 연락처 기반 필터가 해제되었습니다.',
          duration: 1800,
          color: 'medium'
        })).present()
      }
    } catch (err) {
      console.error('웹 스위치 저장 실패:', err)
      disconnectLocalContacts.value = !nextState
      ;(await toastController.create({
        message: '설정 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.',
        duration: 2000,
        color: 'danger'
      })).present()
    }

    return
  }

  // ✅ 2) 앱(안드로이드/iOS): 연락처 해시 업로드/삭제 + 스위치/DB 동기화
  if (nextState) {
    // OFF → ON : 연락처 읽어서 해시 업로드
    const ok = await confirmDialog('휴대폰 내 번호(연락처)를 업데이트 하겠습니까?')
    if (!ok) return

    try {
      const hashes = await collectLocalContactHashes()
      await axios.post('/api/contacts/hashes', { hashes }, { withCredentials: true })
      disconnectLocalContacts.value = true

      // 업로드 성공 후 저장은 즉시(정합성 중요)
      await saveSwitchesToDB()

      ;(await toastController.create({
        message: `연락처 ${hashes.length}건이 저장되었습니다.`,
        duration: 1500,
        color: 'success'
      })).present()
    } catch (err) {
      console.error('연락처 저장 실패:', err)

      const raw =
        err?.response?.data?.error ||
        err?.message ||
        String(err || '')

      console.log('[contacts] raw error:', raw)

      let msg = '연락처 저장에 실패했습니다.'

      if (/not implemented on web/i.test(raw)) {
        msg = '이 기능은 앱(안드로이드/iOS)에서만 사용할 수 있습니다.'
      } else if (/(READ_CONTACTS|WRITE_CONTACTS|연락처 권한)/i.test(raw)) {
        msg = '연락처 권한이 부족합니다. 앱 설정에서 연락처 권한을 허용해 주세요.'
      } else if (/연락처에서 전화번호를 찾지 못했습니다/.test(raw)) {
        msg = '연락처에서 전화번호를 찾지 못했습니다. 휴대폰에 저장된 연락처를 한번 확인해 주세요.'
      } else if (/plugin[_\s-]?not[_\s-]?installed|not implemented on (android|ios)/i.test(raw)) {
        msg = '앱에 연락처 기능이 아직 올바르게 설치되지 않았습니다. 앱을 최신 버전으로 다시 설치하거나, 개발 중이라면 npx cap sync를 확인해 주세요.'
      } else if (/subtle.*digest/i.test(raw)) {
        msg = '단말기에서 보안 해시 기능을 사용할 수 없습니다. 단말기/앱을 최신 버전으로 업데이트한 뒤 다시 시도해 주세요.'
      } else if (err?.response?.data?.error) {
        msg = err.response.data.error
      }

      ;(await toastController.create({
        message: msg,
        duration: 3000,
        color: 'danger'
      })).present()

      disconnectLocalContacts.value = false
    }
  } else {
    // ON → OFF : 서버에 저장된 연락처 해시 삭제 + 필터 해제
    const ok = await confirmDialog('저장된 전화번호를 삭제하고, 연락처 기반 필터를 해제하겠습니다.')
    if (!ok) return

    try {
      await axios.delete('/api/contacts/hashes', { withCredentials: true })
      disconnectLocalContacts.value = false
      await saveSwitchesToDB()
      ;(await toastController.create({
        message: '저장된 연락처가 삭제되었습니다.',
        duration: 1400,
        color: 'success'
      })).present()
    } catch (err) {
      console.error('연락처 삭제 실패:', err)
      ;(await toastController.create({
        message: '연락처 삭제에 실패했습니다.',
        duration: 1600,
        color: 'danger'
      })).present()
      disconnectLocalContacts.value = true
    }
  }
}

/* 다른 스위치들 (저장은 디바운스 + 사용자 체감 즉시) */
async function toggleAllowFriendRequests() {
  allowFriendRequests.value = !allowFriendRequests.value
  saveSwitchesDebounced(250)
  feedbackOK('설정이 적용되었습니다.')
}

async function toggleAllowNotifications() {
  const previousOptOut = allowNotifications.value
  const nextOptOut = !previousOptOut
  allowNotifications.value = nextOptOut
  try {
    // 알림 설정 저장과 토큰 등록/해제를 하나의 흐름으로 처리해 중복 PATCH를 피한다.
    await setNotificationsOptOut(nextOptOut, user.value)
    if (user.value) user.value.search_allowNotifications = boolToOnOff(!nextOptOut)
    feedbackOK('설정이 적용되었습니다.')
  } catch (err) {
    allowNotifications.value = previousOptOut
    console.error('알림 설정 저장 실패:', err)
    ;(await toastController.create({ message: '알림 설정 저장에 실패했습니다.', duration: 1600, color: 'danger' })).present()
  }
}

async function onToggleOnlyWithPhoto(){
  onlyWithPhoto.value = !onlyWithPhoto.value
  saveSwitchesDebounced(250)
  feedbackOK('설정이 적용되었습니다.')
}

/* 공통 유틸 */
async function confirmDialog(message){
  const alert = await alertController.create({
    header: '확인',
    message,
    cssClass: 'tz-alert',
    buttons: [
      { text: '취소', role: 'cancel' },
      { text: '확인', role: 'confirm' }
    ]
  })
  await alert.present()
  const { role } = await alert.onDidDismiss()
  return role === 'confirm'
}

async function lock(title = '제한됨', message = '현재 등급에서 변경할 수 없습니다.') {
  const t = await toastController.create({
    message: `${title}: ${message}`,
    duration: 1500,
    color: 'medium'
  })
  t.present()
}

/* 연락처 수집 → 정규화 → 해시 */
function normalizePhoneKR(raw=''){
  const digits = String(raw).replace(/[^\d+]/g, '')
  if (!digits) return ''
  if (digits.startsWith('+')) return digits
  if (digits.startsWith('0')) return '+82' + digits.slice(1)
  return '+82' + digits
}
async function sha256Hex(text){
  const enc = new TextEncoder().encode(text)
  const buf = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('')
}

async function getLocalContactPhoneNumbers() {
  return getNativeContactPhoneNumbers()
}

async function collectLocalContactHashes(){
  const phones = await getLocalContactPhoneNumbers()
  const normalized = Array.from(new Set(phones.map(normalizePhoneKR).filter(Boolean)))
  const hashes = await Promise.all(normalized.map(n => sha256Hex(n)))
  return hashes
}

/* 피드백 토스트 */
async function feedbackOK(message){ (await toastController.create({ message, duration: 1200, color: 'success' })).present() }

/* 초기 로딩 */
onMounted(async () => {
  try {
    const res = await axios.get('/api/me', { withCredentials: true })
    user.value = res.data.user
    nickname.value = user.value?.nickname || ''

    const fromSnake = Array.isArray(user.value?.search_regions) ? user.value.search_regions : []
    const fromCamel = Array.isArray(user.value?.searchRegions) ? user.value.searchRegions : []
    const list = fromSnake.length ? fromSnake : fromCamel
    if (list.length) searchRegionsBuffer.value = list

    disconnectLocalContacts.value = onOffToBool(user.value?.search_disconnectLocalContacts)
    allowFriendRequests.value     = !onOffToBool(user.value?.search_allowFriendRequests)
    allowNotifications.value      = !onOffToBool(user.value?.search_allowNotifications)
    onlyWithPhoto.value           = onOffToBool(user.value?.search_onlyWithPhoto)

    if (!canEditFieldLocal('onlyWithPhoto'))      { onlyWithPhoto.value = false }
  } catch (err) {
    console.error('유저 정보 로딩 실패:', err)
  }
})

const formatDate = (s) => (!s ? '없음' : new Date(s).toLocaleString())
const logout = async () => { try { await axios.post('/api/logout', {}, { withCredentials: true }); router.push('/login') } catch (e) { console.error('로그아웃 실패:', e) } }
</script>

<style scoped>
.page-wrapper {
  min-height: 100%;
  background: transparent;
  color: var(--text);
}

.container {
  width: min(100%, 720px);
  margin: 0 auto;
  padding: 4px 2px 22px;
}

.container > br {
  display: block;
  content: "";
  height: 12px;
}

.card {
  position: relative;
  padding: 18px;
  border: 1px solid var(--panel-border);
  border-radius: 22px;
  background: var(--panel);
  color: var(--text);
  box-shadow: var(--shadow-sm);
}

.card-title {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 0 17px;
  color: var(--text-strong);
  font-size: 17px;
  font-weight: 820;
  letter-spacing: -.025em;
}

.profile-card .card-title { padding-right: 92px; }

.title-icon {
  box-sizing: content-box;
  padding: 7px;
  border-radius: 10px;
  background: var(--gold-soft);
  color: var(--gold);
  font-size: 17px;
}

.pf-photo {
  display: flex;
  justify-content: center;
  padding: 2px 0 20px;
}

.pf-photo :deep(.avatar) {
  max-width: 142px;
  border-radius: 28px !important;
  box-shadow: 0 12px 30px rgba(43, 35, 28, .13) !important;
}

.title-actions {
  position: absolute;
  top: 15px;
  right: 15px;
  display: flex;
  align-items: center;
  gap: 7px;
}

.title-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 38px;
  padding: 7px 11px;
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  background: var(--panel-soft);
  color: var(--text-dim);
  font-size: 12px;
  font-weight: 750;
  cursor: pointer;
}

.title-action-btn:hover,
.title-action-btn:focus {
  border-color: #d8c5a5;
  color: var(--gold-strong);
  outline: none;
}

.title-action-btn:active { transform: translateY(1px); }
.action-icon { color: var(--gold); font-size: 15px; }

.info-table {
  width: 100%;
  margin-top: 10px;
  overflow: hidden;
  border: 1px solid var(--panel-border) !important;
  border-collapse: separate !important;
  border-spacing: 0;
  border-radius: 16px !important;
  background: var(--panel-2) !important;
  table-layout: fixed;
  font-size: 13px;
}

.info-table tr:last-child td { border-bottom: 0 !important; }
.pf-col-th { width: 42%; }
.pf-col-td { width: 58%; }
.pf-col-tha { width: 42%; }
.pf-col-tda { width: 58%; }

.pf-scope .pf-th,
.pf-scope .pf-td {
  min-height: 54px;
  padding: 13px 12px;
  border-bottom: 1px solid var(--panel-border) !important;
  background: transparent !important;
  color: var(--text) !important;
  vertical-align: middle;
}

.pf-scope .pf-th {
  color: var(--text-dim) !important;
  font-size: 12.5px !important;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pf-scope .pf-td {
  padding-left: 4px;
  text-align: right;
  font-size: 13px;
  font-weight: 680;
}

.pf-scope .pf-th .row-icon,
.pf-scope .row-icon {
  margin-right: 6px;
  color: var(--gold) !important;
  font-size: 14px !important;
  vertical-align: -2px;
}

.pf-scope .pf-th .label {
  display: inline-block;
  max-width: calc(100% - 26px);
  color: var(--text-dim) !important;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pf-scope .label,
.pf-scope .pf-td {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pf-scope .readonly { color: var(--text-faint) !important; }
.pf-scope .editable-row { cursor: pointer; }
.pf-scope .editable-row .pf-th,
.pf-scope .editable-row .pf-td { transition: background-color .18s ease; }

.pf-scope .editable-row:hover .pf-th,
.pf-scope .editable-row:hover .pf-td,
.pf-scope .editable-row:focus .pf-th,
.pf-scope .editable-row:focus .pf-td,
.pf-scope .editable-row:focus-within .pf-th,
.pf-scope .editable-row:focus-within .pf-td {
  background-color: var(--panel-soft) !important;
}

.loading-text {
  margin: 24px 0;
  color: var(--text-faint);
  text-align: center;
  font-size: 13px;
}

.pf-scope .inline-cta {
  margin-left: 8px;
  padding: 4px 8px;
  border: 1px solid #d8c5a5;
  border-radius: 8px;
  color: var(--gold-strong);
  font-weight: 700;
}

.pf-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 56px;
  height: 28px;
  padding: 0 7px;
  border: 0;
  border-radius: 999px;
  background: #d7d2cc;
  color: var(--text-dim);
  font-weight: 800;
  cursor: pointer;
  transition: background .2s ease, box-shadow .2s ease;
}

.pf-switch.is-on { background: var(--accent-sage); }
.pf-switch__knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 6px rgba(43, 35, 28, .22);
  transition: transform .18s ease;
}

.pf-switch.is-on .pf-switch__knob { transform: translateX(28px); }
.pf-switch__label { margin-left: auto; color: #746e68; font-size: 9px; user-select: none; }
.pf-switch.is-on .pf-switch__label { opacity: 0; }
.pf-switch__text--left {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  color: #fff;
  font-size: 9px;
  font-weight: 800;
  opacity: 0;
  pointer-events: none;
}

.pf-switch.is-on .pf-switch__text--left { opacity: .95; }
.pf-fullcell { padding: 13px 12px !important; }
.pf-fullrow { display: flex; align-items: center; gap: 8px; width: 100%; }
.pf-fullrow__label,
.pf-scope .pf-fullrow .label {
  flex: 1 1 auto;
  color: var(--text-dim) !important;
  font-size: 12.5px !important;
  font-weight: 700;
  line-height: 1.35;
  white-space: normal !important;
  overflow: visible !important;
  text-overflow: unset !important;
}

.editable-row.disabled { cursor: not-allowed; }
.pf-scope .editable-row.disabled .pf-th,
.pf-scope .editable-row.disabled .pf-th .label {
  color: var(--text-dim) !important;
  opacity: 1 !important;
  font-size: 12.5px !important;
  font-weight: 700 !important;
}
.pf-scope .editable-row.disabled .pf-td { color: var(--text-faint) !important; }
.pf-lock,
.pf-hint { margin-left: 6px; color: var(--text-faint); font-size: .85em; }
.pf-switch.disabled { opacity: .5; cursor: not-allowed; }
.pf-lock-inline { margin-left: 6px; opacity: .7; font-size: .9em; }

.btn-inline-gray {
  --background: #f2eee8;
  --color: var(--gold-strong);
  --border-color: #dfd3c1;
  --border-width: 1px;
  --border-style: solid;
  --border-radius: 10px;
  --padding-start: 10px;
  --padding-end: 10px;
  --padding-top: 4px;
  --padding-bottom: 4px;
  min-height: 32px;
  font-size: 11px;
  line-height: 1.2;
}

@media (max-width: 360px) {
  .container { padding-inline: 0; }
  .card { padding: 14px; border-radius: 19px; }
  .card-title { font-size: 15px; }
  .info-table { font-size: 12px; }
  .pf-col-th { width: 45%; }
  .pf-col-td { width: 55%; }
  .pf-col-tha,
  .pf-col-tda { width: 50%; }
  .pf-scope .pf-th,
  .pf-scope .pf-td { padding: 11px 8px; }
  .profile-card .card-title { padding-right: 92px; }
  .action-text { display: none; }
  .title-action-btn { width: 38px; justify-content: center; padding: 0; }
}
</style>
