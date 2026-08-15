<template>
  <Teleport to="ion-app">
    <!-- 상위 레이아웃의 transform/스크롤과 무관하게 화면 정중앙에 표시한다. -->
    <div class="popup-overlay" role="presentation" @click.self="onClose">
      <section
        class="popup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="search-region-title"
      >
      <div class="modal-header">
        <h4 id="search-region-title" class="modal-title">검색 지역 선택</h4>

        <!-- 선택 미리보기 -->
        <div class="selected-box">
          <strong>선택된 지역:</strong>
          <div class="selected-tags">
            <div v-if="selectedList.length === 0" class="no-selection">없음</div>
            <div v-else class="tags-wrapper">
              <span v-for="(item, index) in selectedList" :key="index" class="tag">
                {{ item }}
                <button class="remove-btn" @click="removeItem(item)">x</button>
              </span>
            </div>
          </div>
        </div>

        <!-- ✅ 버튼 그룹: 초기화 적용하기 닫기 -->
        <div class="button-group">
          <ion-button class="small-btn" @click="applySelection" color="danger">적용하기</ion-button>
          
          <ion-button class="small-btn" @click="resetSelection" color="primary">초기화</ion-button>
          <ion-button class="small-btn" @click="onClose" color="medium">닫기</ion-button>
         
        </div>

        <!-- ✅ 인라인 상태 메시지 (선택사항) -->
        <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
        <p v-if="successMsg" class="success-msg">{{ successMsg }}</p>
      </div>

      <!-- 스크롤 영역 -->
      <div class="modal-scroll-area">
        <div class="region-container">
          <!-- 좌: 지역1 -->
          <div class="region1-panel">
            <ul>
              <li :class="{ selected: selectedRegion1 === '전체' }" @click="selectRegion1('전체')">전체</li>
              <li
                v-for="region1 in region1Keys"
                :key="region1"
                :class="{ selected: selectedRegion1 === region1 }"
                @click="selectRegion1(region1)"
              >
                {{ region1 }}
              </li>
            </ul>
          </div>

          <!-- 우: 지역2 -->
          <div class="region2-panel" v-if="selectedRegion1">
            <template v-if="selectedRegion1 === '전체'">
              <label>
                <input type="checkbox" :checked="isGlobalAllChecked" @change="toggleGlobalAll($event)" />
                전체
              </label>
            </template>

            <template v-else>
              <label>
                <input
                  type="checkbox"
                  :checked="isAllChecked(selectedRegion1)"
                  @change="toggleAll(selectedRegion1, $event)"
                />
                {{ selectedRegion1 }} 전체
              </label>

              <div class="region2-list">
                <label v-for="region2 in region2Options" :key="region2">
                  <input
                    type="checkbox"
                    :checked="checked[selectedRegion1]?.[region2] || false"
                    @change="toggleSingle(selectedRegion1, region2, $event)"
                  />
                  {{ region2 }}
                </label>
              </div>
            </template>
          </div>
        </div>
      </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
// ✅ 상세 주석/로그 포함
import { ref, reactive, computed, onMounted } from 'vue'
import { IonButton, toastController } from '@ionic/vue'
import { regions as regionTree } from '@/shared/utils/regions' // 기존 사용 경로와 동일 유지

const props = defineProps({
  // 예: [{ region1:'전체', region2:'전체' }] ...
  regions: {
    type: Array,
    default: () => []
  }
})
const emit = defineEmits(['close', 'updated'])

const selectedRegion1 = ref('')
const checked = reactive({})    // 구조: { [region1]: { [region2]: boolean } }
const selectedList = ref([])    // 사용자 표시용 문자열 리스트
const errorMsg = ref('')        // 인라인 에러 메시지(선택)
const successMsg = ref('')      // 인라인 성공 메시지(선택)

console.log('▶ [SearchRegionModal] mounted props.regions:', props.regions)

// 안전한 키/옵션 컴퓨티드
const region1Keys = computed(() => Object.keys(regionTree || {}))
const region2Options = computed(() => {
  if (!selectedRegion1.value || selectedRegion1.value === '전체') return []
  return Array.isArray(regionTree[selectedRegion1.value]) ? regionTree[selectedRegion1.value] : []
})

// ✅ 좌측 지역1 클릭
function selectRegion1(region) {
  selectedRegion1.value = region
  if (region !== '전체' && !checked[region]) {
    checked[region] = {}
  }
  console.log('▶ [SearchRegionModal] selectRegion1:', region)
}

// ✅ 전체 전체 체크 여부
const isGlobalAllChecked = computed(() => {
  for (const r1 of Object.keys(regionTree)) {
    for (const r2 of regionTree[r1]) {
      if (!checked[r1]?.[r2]) return false
    }
  }
  return true
})

// ✅ 전체 전체 토글
function toggleGlobalAll(event) {
  const value = !!event?.target?.checked
  for (const r1 of Object.keys(regionTree)) {
    if (!checked[r1]) checked[r1] = {}
    for (const r2 of regionTree[r1]) {
      checked[r1][r2] = value
    }
  }
  updateSelectedList()
  console.log('▶ [SearchRegionModal] toggleGlobalAll:', value)
}

// ✅ 특정 지역1의 전체 체크 여부
function isAllChecked(region1) {
  const list = regionTree[region1] || []
  if (!list.length) return false
  return list.every(r2 => !!checked[region1]?.[r2])
}

// ✅ 특정 지역1 전체 토글
function toggleAll(region1, event) {
  const value = !!event?.target?.checked
  const list = regionTree[region1] || []
  if (!checked[region1]) checked[region1] = {}
  for (const r2 of list) {
    checked[region1][r2] = value
  }
  updateSelectedList()
  console.log('▶ [SearchRegionModal] toggleAll:', region1, value)
}

// ✅ 개별 지역2 토글
function toggleSingle(region1, region2, event) {
  if (!checked[region1]) checked[region1] = {}
  checked[region1][region2] = !!event?.target?.checked
  updateSelectedList()
  console.log('▶ [SearchRegionModal] toggleSingle:', region1, region2, checked[region1][region2])
}

// ✅ 표시 리스트 재계산
function updateSelectedList() {
  const list = []
  if (isGlobalAllChecked.value) {
    list.push('전체')
  } else {
    for (const r1 in checked) {
      const r2Map = checked[r1] || {}
      const all = isAllChecked(r1)
      if (all) {
        list.push(`${r1} 전체`)
      } else {
        for (const r2 in r2Map) {
          if (r2Map[r2]) list.push(`${r1} - ${r2}`)
        }
      }
    }
  }
  selectedList.value = list
}

// ✅ 선택 태그 삭제
function removeItem(item) {
  if (item === '전체') {
    for (const r1 in checked) {
      for (const r2 in checked[r1]) checked[r1][r2] = false
    }
  } else if (item.endsWith('전체')) {
    const r1 = item.replace(' 전체', '')
    for (const r2 of regionTree[r1] || []) {
      if (!checked[r1]) checked[r1] = {}
      checked[r1][r2] = false
    }
  } else if (item.includes(' - ')) {
    const [r1, r2] = item.split(' - ')
    if (!checked[r1]) checked[r1] = {}
    checked[r1][r2] = false
  }
  updateSelectedList()
  console.log('▶ [SearchRegionModal] removeItem:', item)
}

// ✅ 초기화
function resetSelection() {
  for (const r1 in checked) {
    for (const r2 in checked[r1]) checked[r1][r2] = false
  }
  updateSelectedList()
  errorMsg.value = ''
  successMsg.value = ''
  console.log('▶ [SearchRegionModal] resetSelection')
}

// ✅ 적용 → 부모에 결과 전달 + 성공 토스트
async function applySelection() {
  errorMsg.value = ''
  successMsg.value = ''

  const result = []

  if (isGlobalAllChecked.value) {
    result.push({ region1: '전체', region2: '전체' })
  } else {
    for (const r1 in checked) {
      const r2Map = checked[r1] || {}
      const all = isAllChecked(r1)
      if (all) {
        result.push({ region1: r1, region2: '전체' })
      } else {
        for (const r2 in r2Map) {
          if (r2Map[r2]) result.push({ region1: r1, region2: r2 })
        }
      }
    }
  }

  // 선택 없음 방어
  if (result.length === 0) {
    errorMsg.value = '선택된 지역이 없습니다.'
    console.warn('❗ [SearchRegionModal] applySelection: empty selection')
    return
  }

  console.log('✅ [SearchRegionModal] applySelection -> emit updated:', result)

  // ✅ 먼저 토스트로 사용자 피드백
  try {
    const t = await toastController.create({
      message: '적용되었습니다.',
      duration: 1200,
      color: 'success'
    })
    await t.present()
    successMsg.value = '적용되었습니다.'
  } catch (e) {
    console.warn('⚠️ [SearchRegionModal] toast failed:', e)
  }

  // ✅ 부모에 전달 후 닫기
  emit('updated', result)
  emit('close')
}

// ✅ 닫기
function onClose() {
  console.log('▶ [SearchRegionModal] close (button or backdrop)')
  emit('close')
}

// ✅ 초기값 복원
onMounted(() => {
  try {
    console.log('▶ [SearchRegionModal] onMounted, restore from props.regions')
    if (!Array.isArray(props.regions)) return

    // 전달된 값이 없으면 미선택 상태 유지
    if (props.regions.length === 0) {
      updateSelectedList()
      return
    }

    for (const item of props.regions) {
      const region1 = item?.region1
      const region2 = item?.region2
      if (!region1 || !region2 || region1 === '전체') {
        // 전체
        for (const r1 of Object.keys(regionTree)) {
          if (!checked[r1]) checked[r1] = {}
          for (const r2 of regionTree[r1]) checked[r1][r2] = true
        }
        break
      } else if (region2 === '전체') {
        if (!checked[region1]) checked[region1] = {}
        for (const r2 of (regionTree[region1] || [])) checked[region1][r2] = true
      } else {
        if (!checked[region1]) checked[region1] = {}
        // region2가 실제 목록에 없는 경우도 방어적으로 true 처리(데이터 이행 중 호환)
        checked[region1][region2] = true
      }
    }
    updateSelectedList()
  } catch (e) {
    console.error('❌ [SearchRegionModal] restore failed:', e)
    errorMsg.value = '초기값 복원 중 오류가 발생했습니다.'
  }
})
</script>

<style scoped>
/* ✅ 가독성: 기본 검정 글씨 */
* { box-sizing: border-box; color: #000; }

/* =========================================
   모달 레이아웃
========================================= */
.popup-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 100dvh;
  padding: calc(var(--safe-top, 0px) + 18px) 16px calc(var(--safe-bottom, 0px) + 18px);
  background-color: rgba(24, 20, 17, 0.52);
  overflow: hidden;
}

.popup-modal {
  background: #fff;
  color: #000;
  width: min(560px, 100%);
  max-height: calc(100dvh - var(--safe-top, 0px) - var(--safe-bottom, 0px) - 36px);
  border: 1px solid #e2ddd7;
  border-radius: 18px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 22px 60px rgba(34, 27, 21, 0.24);
}

.modal-header {
  flex: 0 0 auto;
  padding: 18px 18px 14px;
  border-bottom: 1px solid #e5e0da;
  background-color: #fcfbf9;
}

.modal-title {
  margin: 0 0 14px;
  color: #24211f;
  font-size: 20px;
  font-weight: 850;
  line-height: 1.3;
  letter-spacing: -0.03em;
}

/* 스크롤 영역 */
.modal-scroll-area {
  min-height: 0;
  overflow-y: auto;
  flex: 1 1 auto;
  padding: 14px 16px 18px;
  overscroll-behavior: contain;
}

/* 선택된 박스 */
.selected-box {
  min-height: 82px;
  max-height: 130px;
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid #ddd6ce;
  border-radius: 12px;
  background: #fff;
  font-size: 15px;
  line-height: 1.45;
  overflow-y: auto;
}

.selected-tags { margin-top: 8px; }
.no-selection { color: #7f7770; font-size: 15px; }
.tags-wrapper { display: flex; flex-wrap: wrap; gap: 8px; }
.tag {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 5px 8px 5px 10px;
  border-radius: 999px;
  background: #f2eee9;
  color: #000;
  font-size: 14px;
  line-height: 1.35;
}
.remove-btn {
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  margin-left: 4px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #b43c43;
  font-size: 17px;
  cursor: pointer;
}

/* 버튼 */
.button-group {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.button-group ion-button {
  --border-radius: 12px;
  --padding-start: 10px;
  --padding-end: 10px;
  --padding-top: 12px;
  --padding-bottom: 12px;
  min-height: 48px;
  margin: 0;
  font-size: 15px;
  font-weight: 800;
}

.small-btn {
  font-size: 15px;
}

/* =========================================
   좌/우 패널 레이아웃 (기존 유지)
========================================= */
.region-container {
  display: flex;
  min-height: 270px;
  border: 1px solid #e4ded7;
  border-radius: 12px;
  overflow: hidden;
}
.region1-panel {
  flex: 0 0 124px;
  border-right: 1px solid #ddd6ce;
  background: #f8f6f3;
}
.region1-panel ul { list-style: none; padding: 0; margin: 0; }
.region1-panel li {
  min-height: 44px;
  padding: 11px 12px;
  cursor: pointer;
  font-size: 16px;
  line-height: 1.35;
}
.region1-panel li.selected { background-color: #a97832; color: #fff; font-weight: 800; }
.region2-panel { flex: 1 1 auto; min-width: 0; padding: 12px 14px; background: #fff; }
.region2-list { display: flex; flex-direction: column; gap: 2px; margin-top: 4px; }

/* =========================================
   체크박스와 라벨: 모바일 터치 및 본문 가독성 기준
========================================= */

/* 라벨을 체크박스와 정렬 */
.region2-panel label,
.region2-panel .region2-list label,
.region2-panel > label,  /* '전체', '서울 전체' 라벨 */
.popup-modal .region2-list label {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 8px 2px;
  font-size: 16px;
  line-height: 1.4;
  cursor: pointer;
}

/* ✅ 기본 체크박스를 축소하지 않고 충분한 터치 크기를 유지한다. */
.popup-modal input[type="checkbox"] {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  margin: 0;
  accent-color: #a97832;
}

/* 체크박스 오른쪽 텍스트가 너무 붙지 않도록 보조 마진 */
.popup-modal input[type="checkbox"] + span,
.popup-modal input[type="checkbox"] + label {
  margin-left: 2px;
}

/* 접근성: 탭 포커스 시 윤곽선 */
.popup-modal input[type="checkbox"]:focus-visible {
  outline: 3px solid rgba(169, 120, 50, .25);
  outline-offset: 3px;
  border-radius: 3px;
}

/* 메시지 */
.error-msg { color: #c0392b; font-size: 15px; margin: 10px 0 0; line-height: 1.4; }
.success-msg { color: #2d7a33; font-size: 15px; margin: 10px 0 0; line-height: 1.4; }

@media (max-width: 420px) {
  .popup-overlay {
    padding-inline: 10px;
  }

  .modal-header {
    padding: 16px 14px 12px;
  }

  .modal-scroll-area {
    padding: 12px 12px 14px;
  }

  .region1-panel {
    flex-basis: 108px;
  }

  .region1-panel li,
  .region2-panel label,
  .region2-panel .region2-list label,
  .region2-panel > label,
  .popup-modal .region2-list label {
    font-size: 15px;
  }
}

@media (max-height: 620px) {
  .popup-overlay {
    align-items: center;
    padding-block: calc(var(--safe-top, 0px) + 8px) calc(var(--safe-bottom, 0px) + 8px);
  }

  .popup-modal {
    max-height: calc(100dvh - var(--safe-top, 0px) - var(--safe-bottom, 0px) - 16px);
  }
}
</style>
