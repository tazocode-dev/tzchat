<!-- 친구 목록 -->
<template>
  <div class="friends-page-inner">
    <!-- 상단 섹션 헤더 -->
    <div class="section-header" role="heading" aria-level="2">
      <ion-icon :icon="icons.peopleOutline" class="section-icon" aria-hidden="true" />
      <h3 class="section-title">
        친구 리스트
        <span class="count">({{ friendsCount }})</span>
      </h3>
    </div>

    <!-- 본문: 상위 IonContent가 스크롤 담당 -->
    <div class="friends-only-wrapper">
      <!-- 공통 리스트 + 하단 액션(대화하기/친구삭제/차단하기)
           Premium 가림을 위해 viewer-level / is-premium 전달 -->
      <UserList
        :users="users"
        :isLoading="isLoading"
        :viewer-level="viewerLevel"
        :is-premium="isPremium"
        emptyText="아직 친구가 없습니다."
        @select="u => goToUserProfile(u._id)"
      >
        <template #item-actions="{ user }">
          <ion-button
            size="small"
            color="primary"
            class="btn-gold-solid"
            @click.stop="onChatClick(user._id)"
          >대화하기</ion-button>

          <ion-button
            size="small"
            color="medium"
            class="btn-gold-outline"
            @click.stop="onRemoveClick(user._id)"
          >친구삭제</ion-button>

          <ion-button
            size="small"
            color="danger"
            class="btn-gold-outline"
            @click.stop="onBlockClick(user._id)"
          >차단하기</ion-button>
        </template>
      </UserList>
    </div>
  </div>
</template>

<script setup>
/* -----------------------------------------------------------
   Friends List (헤더 카운트 + 공통 UserList + 하단 액션)
   - 중첩 안전 버전: 이 파일 자체는 ion-page/ion-content를 가지지 않음
   - 헤더는 상단에 고정 UI, 상위 IonContent가 스크롤
   - 액션: 대화하기 / 친구삭제 / 차단하기
   - Premium 가림: viewerLevel / isPremium 전달
----------------------------------------------------------- */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '@/shared/services/api'
import UserList from '@/shared/components/UserList.vue'
import { IonButton, IonIcon } from '@ionic/vue'
import { peopleOutline } from 'ionicons/icons'

const router = useRouter()
const icons = { peopleOutline }

/* 부모 FriendsPage에서 내려오는 값 수신: fragment 경고 제거용 */
const props = defineProps({
  // kebab-case 속성(viewer-level, is-premium)이 camelCase로 매핑되어 들어옵니다.
  viewerLevel: { type: String, default: undefined },
  isPremium:   { type: Boolean, default: undefined },
})

/* ✅ 이 컴포넌트에서 수신/발신할 수 있는 커스텀 이벤트를 선언 (경고 제거) */
const emit = defineEmits(['openReceive', 'closeReceive'])

/* 상태 */
const users = ref([])
const isLoading = ref(true)

/* ✅ 프리미엄회원 가림 로직: 부모값 우선, 없으면 서버/로컬 폴백 */
const viewerLevel = ref(props.viewerLevel ?? '')
const isPremium   = ref(typeof props.isPremium === 'boolean' ? props.isPremium : false)

/* 유틸 */
const uniq = (arr = []) => Array.from(new Set(arr.map(String)))
function toTS(v) {
  if (!v) return 0
  try {
    const t = new Date(v).getTime()
    return Number.isFinite(t) ? t : 0
  } catch { return 0 }
}
function sortByRecent(list) {
  return [...list].sort((a, b) => {
    const aTS = toTS(a.last_login || a.lastLogin || a.updatedAt || a.createdAt)
    const bTS = toTS(b.last_login || b.lastLogin || b.updatedAt || b.createdAt)
    return bTS - aTS
  })
}
function normalizeUser(u = {}) {
  const r1 = u.region1 ?? u.region1Name ?? u.regionName1 ?? u.city1 ?? u.area1 ?? (Array.isArray(u.region) ? u.region[0] : undefined) ?? '/'
  const r2 = u.region2 ?? u.region2Name ?? u.regionName2 ?? u.city2 ?? u.area2 ?? (Array.isArray(u.region) ? u.region[1] : undefined) ?? '/'
  const pref = u.preference ?? u.preferenceText ?? u.pref ?? u.trait ?? u.feature ?? (Array.isArray(u.tags) ? u.tags.join(', ') : undefined) ?? '-'
  const lastLogin = u.last_login || u.lastLogin || u.updatedAt || u.createdAt
  return { ...u, region1: r1, region2: r2, preference: pref, last_login: lastLogin }
}

/* 네비게이션 */
const goToUserProfile = (userId) => { if (!userId) return; router.push(`/home/user/${userId}`) }
const onChatClick = (userId) => { if (!userId) return; router.push(`/home/chat/${userId}`) }

/* friends 응답 → id 추출 (객체/문자열 모두 지원) */
function extractFriendIds(data) {
  if (Array.isArray(data) && data.length) {
    if (typeof data[0] === 'object') {
      return uniq(data.map(x => x?._id).filter(Boolean).map(String))
    }
    return uniq(data.map(String))
  }
  if (Array.isArray(data?.ids)) return uniq(data.ids.map(String))
  return []
}

/* 사용자 조회: bulk → 개별, 최종 id 필터 */
async function fetchUsersByIdsStrict(ids = []) {
  if (!ids.length) return []
  let bulkList = []
  try {
    const res = await api.post('/api/search/users', { ids })
    bulkList = Array.isArray(res?.data?.users) ? res.data.users : (Array.isArray(res?.data) ? res.data : [])
  } catch (e) { console.warn('[friends] bulk failed; per-id fallback', e?.message || e) }
  if (Array.isArray(bulkList) && bulkList.length) {
    const set = new Set(ids.map(String))
    const filtered = bulkList.filter(u => u && set.has(String(u._id)))
    if (filtered.length === ids.length) return filtered
  }
  const per = await Promise.all(ids.map(async id => {
    try {
      const r = await api.get(`/api/users/${id}`)
      return r?.data?.user || r?.data || null
    } catch { return null }
  }))
  return per.filter(Boolean)
}

/* 액션: 친구삭제 / 차단하기
   ⚠️ 백엔드 friendRouter 기준:
   - 친구삭제: DELETE /api/friend/:id
   - 차단하기: PUT    /api/block/:id
*/
async function removeFriend(userId) {
  if (!userId) return
  await api.delete(`/api/friend/${userId}`)
  users.value = users.value.filter(u => String(u._id) !== String(userId))
}
async function blockUser(userId) {
  if (!userId) return
  await api.put(`/api/block/${userId}`)
  users.value = users.value.filter(u => String(u._id) !== String(userId))
}
const onRemoveClick = (userId) => removeFriend(userId)
const onBlockClick  = (userId) => blockUser(userId)

/* 헤더 카운트 */
const friendsCount = computed(() => users.value.length)

/* 초기 로딩: props가 비어있는 항목만 서버/로컬에서 보충 */
onMounted(async () => {
  try {
    isLoading.value = true

    const needLevel = (props.viewerLevel === undefined)
    const needPrem  = (props.isPremium   === undefined)

    if (needLevel || needPrem) {
      try {
        const me = (await api.get('/api/me')).data?.user || {}
        if (needLevel) {
          const levelFromApi = me?.level || me?.user_level || me?.membership || ''
          viewerLevel.value = String(levelFromApi || '').trim()
        }
        if (needPrem) {
          const levelStr = String(me?.level || me?.user_level || me?.membership || '').trim()
          const premiumBool = me?.isPremium ?? me?.premium ?? (levelStr === '프리미엄회원')
          isPremium.value = Boolean(premiumBool)
        }
      } catch {
        // 로컬 폴백
        if (needLevel) {
          const lv = (localStorage.getItem('user_level') || localStorage.getItem('level') || '').trim().toLowerCase()
          viewerLevel.value = lv
        }
        if (needPrem) {
          const lv = (viewerLevel.value || '').toString().toLowerCase()
          const boolish = (localStorage.getItem('isPremium') || '').trim().toLowerCase()
          isPremium.value =
            ['프리미엄회원', 'premium', 'premium_member', 'prem'].includes(lv) ||
            ['true', '1', 'yes', 'y'].includes(boolish)
        }
      }
    }

    const res = await api.get('/api/friends')
    const friendIds = extractFriendIds(res?.data)
    const raw = await fetchUsersByIdsStrict(friendIds)
    const set = new Set(friendIds.map(String))
    const strictFinal = raw.filter(u => u && set.has(String(u._id)))
    users.value = sortByRecent(strictFinal.map(normalizeUser))
  } catch (e) {
    console.error('❌ 친구 리스트 로딩 실패:', e)
    users.value = []
  } finally {
    isLoading.value = false
  }
})
</script>

<style scoped>
/* 루트 래퍼: 단일 루트 보장 */
.friends-page-inner{
  display:flex;
  flex-direction:column;
  min-height:100%;
  width:100%;
  background:transparent;
  color:var(--text);
}

/* 상단 헤더 */
.section-header{
  display:flex; align-items:center; gap:10px;
  padding:12px 14px; margin:0 0 12px;
  border:1px solid var(--panel-border);
  background:var(--panel); border-radius:16px;
  box-shadow:var(--shadow-xs);
}
.section-title{
  display:flex; align-items:center; gap:8px;
  margin:0; color:var(--text-strong); font-weight:800; font-size:15px;
}
.section-icon{ font-size:18px; color:var(--gold); }
.count{ font-weight:800; color:var(--gold); }

/* 본문 래퍼 */
.friends-only-wrapper{
  color:var(--text);
  background:transparent;

  /* 상위 컨테이너가 flex여도 가운데 정렬 방지 */
  display:flex; flex-direction:column; justify-content:flex-start; align-items:stretch;

  min-height: 100%;
  width: 100%;

  /* 안전 영역 보정 */
  padding-top: var(--safe-top);
}

/* 버튼 공통 톤 */
.btn-gold-solid,
.btn-gold-outline {
  --height: 18px;
  --border-radius: 12px;
  --padding-start: 1px;
  --padding-end: 1px;
  --padding-top: 0;
  --padding-bottom: 0;

  font-size: 12px;
  font-weight: 800;
  min-width: 65px;
  min-height: 30px;

  --background: linear-gradient(135deg, var(--gold), var(--gold-strong));
  --color: #fff;
}
.btn-gold-outline {
  --background: transparent;
  --color: var(--gold-strong);
  border: 1px solid #d8c5a5;
}

/* UserList 내부 액션 바 정렬 */
:deep(.actions-bar) {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 8px;
}
</style>
