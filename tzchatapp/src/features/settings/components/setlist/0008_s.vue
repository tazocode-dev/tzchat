<!-- src/components/04610_Page6_profile/ProfilePhotoViewer.vue -->
<template>
  <div class="viewer-root">
    <!-- 대표(없으면 성별 기본) -->
    <img
      class="avatar"
      :style="{ maxWidth: size + 'px' }"
      :src="mainDisplayUrl"
      :alt="altText"
      loading="lazy"
      @click="openViewerAt(mainIndex)"
    />
    <p v-if="hint" class="hint">{{ hint }}</p>

    <Teleport to="body">
      <!-- 🔍 풀스크린 뷰어(스와이프) -->
      <div
        v-if="viewerOpen"
        class="lightbox"
        role="dialog"
        aria-modal="true"
        aria-label="상대방 사진 확대 보기"
        @click.self="closeViewer"
      >
      <button class="viewer-close" aria-label="닫기" @click="closeViewer">×</button>

      <button class="nav prev" aria-label="이전" @click.stop="prev">‹</button>
      <button class="nav next" aria-label="다음" @click.stop="next">›</button>

      <div
        class="carousel"
        @touchstart.passive="onTouchStart"
        @touchmove.prevent="onTouchMove"
        @touchend="onTouchEnd"
      >
        <div class="track" :style="trackStyle">
          <div class="slide" v-for="(u, i) in viewerImages" :key="i">
            <img class="slide-img" :src="u" :alt="`상대방 사진 ${i+1}`" />
          </div>
        </div>
      </div>

      <div class="pager">
        {{ viewerIndex + 1 }} / {{ viewerImages.length }}
        <span v-if="isCurrentMain" class="badge">대표</span>
      </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch} from 'vue'
import api from '@/shared/services/api'

/** 서버가 내보내는 이미지 타입(우리 기존과 동일) */
type ProfileImage = {
  id: string
  kind: 'avatar' | 'gallery'
  aspect: number
  urls: { thumb: string; medium: string; full: string }
  createdAt?: string
}
type GetListResponse = {
  profileMain: string
  profileImages: ProfileImage[]
}

const DEFAULT_MAN = '/img/man.jpg'
const DEFAULT_WOMAN = '/img/woman.jpg'

const props = withDefaults(defineProps<{
  /** 상대방 사용자 ID (주면 이 컴포넌트가 직접 불러옴) */
  userId?: string
  /** 이미 상위에서 받아온 사진 목록을 바로 넘겨도 됨 */
  images?: ProfileImage[]
  /** 대표사진 id (images와 함께 쓸 때) */
  mainId?: string
  /** 상대방 성별(기본이미지 선택용) */
  gender?: string
  /** 대표 썸네일 가로 최대 픽셀 */
  size?: number
  /** 대표 위에 작게 표시할 안내문구 (선택) */
  hint?: string
}>(), {
  size: 180,
  gender: '',
  images: undefined,
  mainId: '',
  userId: '',
  hint: ''
})

const hint = computed(() => props.hint)

/* -----------------------------
 * 데이터 소스(직접 불러오기 or props)
 * ----------------------------- */
const list = ref<ProfileImage[]>([])
const profileMain = ref<string>('')

function isFemale(g: string) {
  const s = (g || '').toLowerCase()
  return s.includes('여') || s.includes('woman') || s.includes('female') || s === 'f'
}

const altText = computed(() => `상대방 대표 프로필 이미지`)

async function fetchIfNeeded() {
  if (props.images?.length) {
    list.value = props.images.slice()
    profileMain.value = props.mainId || ''
    return
  }
  if (!props.userId) {
    list.value = []
    profileMain.value = ''
    return
  }
  // 서버에서 상대방 사진 조회 (우리 라우터는 ?userId= 지원 가정)
  // 필요 시 /api/profile/images/:userId 로 바꿔 쓰세요.
  const { data } = await api.get<GetListResponse>('/api/profile/images', {
    params: { userId: props.userId }
  })
  list.value = (data.profileImages || []).slice().sort((a, b) => {
    const ta = +new Date(a.createdAt || 0)
    const tb = +new Date(b.createdAt || 0)
    return ta - tb
  })
  profileMain.value = data.profileMain || ''
}

onMounted(fetchIfNeeded)
watch(() => [props.images, props.mainId, props.userId], fetchIfNeeded, { deep: true })

/* 대표 표시용 */
const mainIndex = computed(() => {
  if (!list.value.length) return 0
  const i = list.value.findIndex(i => i.id === (profileMain.value || props.mainId || ''))
  return i >= 0 ? i : 0
})
const mainDisplayUrl = computed(() => {
  if (list.value.length) {
    return list.value[mainIndex.value]?.urls.medium || list.value[0]?.urls.medium
  }
  return isFemale(props.gender || '') ? DEFAULT_WOMAN : DEFAULT_MAN
})

/* -----------------------------
 * 라이트박스(스와이프 캐러셀)
 * ----------------------------- */
const viewerOpen = ref(false)
const viewerIndex = ref(0)
const viewerImages = computed(() => list.value.map(i => i.urls.full))
const viewerIds = computed(() => list.value.map(i => i.id))
const isCurrentMain = computed(() => {
  const id = viewerIds.value[viewerIndex.value]
  const mid = profileMain.value || props.mainId || ''
  return !!id && id === mid
})

function openViewerAt(idx: number) {
  if (!list.value.length) return
  viewerIndex.value = Math.max(0, Math.min(idx, viewerImages.value.length - 1))
  viewerOpen.value = true
}
function closeViewer() { viewerOpen.value = false }
function prev() { viewerIndex.value = Math.max(0, viewerIndex.value - 1) }
function next() { viewerIndex.value = Math.min(viewerImages.value.length - 1, viewerIndex.value + 1) }

const dragging = ref(false)
const startX = ref(0)
const deltaX = ref(0)
function onTouchStart(ev: TouchEvent) {
  if (!viewerOpen.value) return
  dragging.value = true
  startX.value = ev.touches[0].clientX
  deltaX.value = 0
}
function onTouchMove(ev: TouchEvent) {
  if (!dragging.value) return
  deltaX.value = ev.touches[0].clientX - startX.value
}
function onTouchEnd() {
  if (!dragging.value) return
  const threshold = Math.min(60, window.innerWidth * 0.15)
  if (deltaX.value > threshold) prev()
  else if (deltaX.value < -threshold) next()
  dragging.value = false
  deltaX.value = 0
}
const trackStyle = computed(() => {
  const vwShift = (-viewerIndex.value * 100) + (dragging.value ? (deltaX.value / Math.max(1, window.innerWidth)) * 100 : 0)
  return { transform: `translateX(${vwShift}vw)`, transition: dragging.value ? 'none' : 'transform 300ms ease' }
})

/* 외부에서 강제 새로고침하고 싶을 때 */
function reload() { fetchIfNeeded() }
defineExpose({ reload })
</script>

<style scoped>
.viewer-root { text-align: center; }

/* 대표 썸네일 */
.avatar {
  display: block;
  width: 100%;
  aspect-ratio: 1/1;
  object-fit: cover;
  border-radius: 16px;
  background: #111;
  margin: 0 auto;
  cursor: pointer;
}

/* 작은 안내문구(선택) */
.hint { color: #9aa0a6; font-size: 12px; margin-top: 6px; }

/* 라이트박스 */
.lightbox {
  position: fixed; inset: 0; background: rgba(0,0,0,0.88); z-index: 1400;
  display: flex; align-items: center; justify-content: center; flex-direction: column;
}
.viewer-close {
  position: fixed; top: 10px; right: 12px;
  width: 40px; height: 40px; border-radius: 999px; border: 0;
  background: rgba(255,255,255,0.18); color: #fff; font-size: 26px; cursor: pointer;
}
.carousel { position: relative; width: 100vw; height: 86vh; overflow: hidden; }
.track { height: 100%; display: flex; }
.slide { flex: 0 0 100vw; height: 100%; display: flex; align-items: center; justify-content: center; }
.slide-img {
  max-width: 92vw; max-height: 86vh; object-fit: contain;
  border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.4);
}
.nav {
  position: fixed; top: 50%; transform: translateY(-50%);
  width: 44px; height: 44px; border-radius: 999px; border: 0;
  background: rgba(255,255,255,0.18); color: #fff; font-size: 28px; cursor: pointer;
}
.nav.prev { left: 12px; }
.nav.next { right: 12px; }
.pager {
  position: fixed; bottom: 12px; left: 50%; transform: translateX(-50%);
  color: #fff; background: rgba(0,0,0,0.35); padding: 4px 10px; border-radius: 999px; font-weight: 700;
}
.badge {
  margin-left: 8px;
  padding: 2px 6px; border-radius: 999px;
  background: #111; color: #fff; font-size: 12px; font-weight: 800;
  box-shadow: 0 2px 6px rgba(0,0,0,0.25);
}
</style>
