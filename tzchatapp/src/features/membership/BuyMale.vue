<!-- front/components/05110_Membership/BuyMale.vue -->
<template>
  <section class="membership-safe">
    <section class="membership-section membership-header">
      <p>현재 사용자: <strong>남성 회원</strong></p>
    </section>

    <!-- 플랜 목록 -->
    <section v-if="plans.length" class="plan-grid">
      <PlanCard
        v-for="plan in plans"
        :key="plan.code"
        :plan="plan"
        :processing="processingPlanCode === plan.code && loading"
        @buy="onBuy"
      />
    </section>

    <!-- 로딩 -->
    <section v-else-if="loading" class="membership-center mt-8">
      <ion-spinner name="crescent" />
    </section>

    <!-- 오류 -->
    <section v-else-if="error" class="membership-center membership-error mt-8">
      {{ error }}
    </section>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { IonSpinner } from '@ionic/vue'
import '@/shared/theme/membership.css'
import PlanCard from '@/features/membership/PlanCard.vue'
import { fetchPlans, purchase, type PlanItem } from '@/shared/services/membershipApi'
// store 별칭 문제 회피가 필요하면 상대경로 유지
import { useUserStore } from '@/shared/stores/user'

const router = useRouter()
const userStore = useUserStore()

const plans = ref<PlanItem[]>([])
const loading = ref(false)
const error = ref('')
const processingPlanCode = ref<PlanItem['code'] | ''>('')

onMounted(async () => {
  loading.value = true
  try {
    const res = await fetchPlans('male')
    console.log('[plans][male] response:', res)
    if (res.ok) {
      plans.value = res.plans || []
      error.value = ''
    } else {
      error.value = res.error || '플랜 정보를 불러오지 못했습니다.'
    }
  } catch (e: any) {
    console.error('[plans][male] error:', e?.message || e)
    error.value = '플랜 정보를 불러오는 중 오류가 발생했습니다.'
  } finally {
    loading.value = false
  }
})

async function onBuy(plan: PlanItem) {
  try {
    if (!userStore.user?._id) {
      alert('로그인이 필요합니다.')
      return router.push('/login')
    }

    loading.value = true
    processingPlanCode.value = plan.code

    const res = await purchase({
      userId: userStore.user._id,
      planCode: plan.code,
      gender: 'male',
    })

    if (res.ok) {
      userStore.user.user_level = res.user?.user_level || plan.name
      alert(`${plan.name} 결제가 완료되었습니다.`)
      router.push('/home')
    } else {
      alert('결제 실패: ' + (res.error || '알 수 없는 오류'))
    }
  } catch (e) {
    console.error(e)
    alert('결제 처리 중 오류가 발생했습니다.')
  } finally {
    loading.value = false
    processingPlanCode.value = ''
  }
}
</script>

<style scoped>
/* 공통 스타일은 membership.css 사용 */
</style>
