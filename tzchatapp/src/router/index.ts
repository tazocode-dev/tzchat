// src/router/index.ts
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import api, { getAgreementStatus } from '@/shared/services/api'
import { useUserStore, type MeUser } from '@/shared/stores/user'
import { hasCompletedProfileOnboarding } from '@/shared/services/accountCompletion'

import {
  modalController,
  actionSheetController,
  alertController,
  loadingController,
  popoverController,
  pickerController,
  toastController,
} from '@ionic/vue'

//로그인 전
import LoginPage from '@/features/auth/pages/LoginPage.vue'
import OnboardingPage from '@/features/auth/pages/OnboardingPage.vue'
import HomePage from '@/layouts/HomePage.vue'

// ✅ 관리자(master) 전용 아이디/비밀번호 로그인 — 일반 사용자 로그인(이메일 인증)과 분리
import AdminLoginPage from '@/features/auth/pages/AdminLoginPage.vue'

import Page1 from '@/features/search/pages/1_alluser.vue'

//Topmenu
import Pagetarget from '@/features/search/pages/2_target_merge.vue'
import Page3 from '@/features/friends/pages/3_list.vue'
import Page4 from '@/features/chat/pages/4_chatList.vue'
import Page6 from '@/features/profile/pages/6_profile.vue'
import Page7 from '@/features/settings/pages/7_setting.vue'

//list_sub
import Page31 from '@/features/friends/pages/Page_Block.vue'
import Page32 from '@/features/friends/pages/Page_Friend.vue'
import Page33 from '@/features/friends/pages/Page_Receive.vue'
import Page34 from '@/features/friends/pages/Page_Send.vue'

// important_parts
import PageuserProfile from '@/features/profile/pages/PageuserProfile.vue'
import PagepremiumProfile from '@/features/profile/pages/PagepremiumProfile.vue'
import ChatRoomPage from '@/features/chat/pages/ChatRoomPage.vue'

// notice
import NoticeEditPage from '@/features/admin/pages/detail/NoticeEditPage.vue'

// setting
import setting01 from '@/features/settings/components/setlist/0001_s_notice.vue'
import setting02 from '@/features/settings/components/setlist/0002_s.vue'
import setting03 from '@/features/settings/components/setlist/0003_s.vue'
import setting04 from '@/features/settings/components/setlist/0004_s.vue'
import setting05 from '@/features/settings/components/setlist/0005_s.vue'
import setting06 from '@/features/settings/components/setlist/0006_s.vue'
import setting07 from '@/features/settings/components/setlist/0007_s.vue'
import setting08 from '@/features/settings/components/setlist/0008_s.vue'
import setting09 from '@/features/settings/components/setlist/0009_s.vue'
import setting10 from '@/features/settings/components/setlist/0010_s.vue'
import setting11 from '@/features/settings/components/setlist/0011_s.vue'
import setting12 from '@/features/settings/components/setlist/0012_s.vue'
import setting13 from '@/features/settings/components/setlist/0013_s.vue'
import setting14 from '@/features/settings/components/setlist/0014_s.vue'
import setting15 from '@/features/settings/components/setlist/0015_s.vue'
import setting16 from '@/features/settings/components/setlist/0016_s.vue'
import setting17 from '@/features/settings/components/setlist/0017_s.vue'
import setting18 from '@/features/settings/components/setlist/0018_s.vue'
import setting19 from '@/features/settings/components/setlist/0019_s_pwchange.vue'
import setting20 from '@/features/settings/components/setlist/0020_s_delete.vue'
import setting21 from '@/features/settings/components/setlist/0021_s_auth_info.vue'

// admin — 실제 운영 기능만 필요할 때 로드한다.
const AdminDashboard = () => import('@/features/admin/pages/adminlist/0000_AdminDashboard.vue')
const AdminVisualTestPage = () => import('@/features/admin/pages/AdminVisualTestPage.vue')
const AdminMembers = () => import('@/features/admin/pages/adminlist/0003_a.vue')
const AdminNotices = () => import('@/features/admin/pages/adminlist/0006_a.vue')
const AdminMigration = () => import('@/features/admin/pages/adminlist/0015_a.vue')

// ✅ 동의 전용 페이지
const AgreementPage = () => import('@/features/legal/AgreementPage.vue')

// (문서 목록/단일)
const LegalDocs = () => import('@/features/legal/LegalDocs.vue')
const LegalContainer = () => import('@/features/legal/LegalContainer.vue')
const TermsAdmin = () => import('@/features/legal/admin/TermsAdmin.vue')

// ✅ 탈퇴신청 전용 페이지
const DeletionPending = () => import('@/features/account/pages/DeletionPending.vue')

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/login' },
  // ✅ 일반 사용자 로그인: 이메일 인증(6자리 코드) 방식
  { path: '/login', component: LoginPage },

  // ✅ 관리자(master) 전용 로그인 — 메인 네비게이션에는 노출하지 않음
  { path: '/admin/login', name: 'AdminLogin', component: AdminLoginPage, meta: { public: true } },

  {
    path: '/legal/consent',
    name: 'AgreementPagePublic',
    component: AgreementPage,
    meta: { requiresAuth: true, allowsIncompleteAccount: true },
  },
  {
    path: '/onboarding',
    name: 'Onboarding',
    component: OnboardingPage,
    meta: { requiresAuth: true, allowsIncompleteAccount: true },
  },
  { path: '/legals/v2', name: 'LegalDocsV2Public', component: LegalDocs, meta: { public: true } },
  { path: '/legals/v2/:slug', name: 'LegalPageV2Public', component: LegalContainer, props: true, meta: { public: true } },

  {
    path: '/account/deletion-pending',
    name: 'AccountDeletionPending',
    component: DeletionPending,
    meta: { requiresAuth: true, allowsIncompleteAccount: true },
  },

  {
    path: '/admin/terms/:slug',
    name: 'AdminTermsEdit',
    component: TermsAdmin,
    props: true,
    meta: { requiresAuth: true, requiresMaster: true },
  },

  {
    path: '/home',
    component: HomePage,
    meta: { requiresAuth: true },
    children: [
      { path: '', component: Page6 },

      { path: 'membership/buy', redirect: '/home/6page' },
      { path: 'membership/history', redirect: '/home/6page' },

      { path: '1page', component: Page1 },
      { path: 'targetpage', component: Pagetarget },
      { path: '3page', component: Page3 },

      { path: '4page', component: Page4 },
      { path: '6page', component: Page6 },
      { path: '7page', component: Page7 },

      { path: '31page', component: Page31 },
      { path: '32page', component: Page32 },
      { path: '33page', component: Page33 },
      { path: '34page', component: Page34 },
      { path: 'user/:id', component: PageuserProfile, props: true },

      {
        path: 'speeduser/:id',
        component: PagepremiumProfile,
        props: true,
        alias: ['/home/premiumuser/:id', '/home/premuimuser/:id'],
      },

      { path: 'chat/:id', component: ChatRoomPage, props: true },

      { path: 'purchase/main', redirect: '/home/6page' },

      { path: 'setting/0001', component: setting01 },
      { path: 'setting/0002', component: setting02 },
      { path: 'setting/0002/write', redirect: '/home/admin/notices/write' },
      { path: 'setting/0002/edit/:id', redirect: (to) => `/home/admin/notices/edit/${to.params.id}` },

      { path: 'setting/0003', component: setting03 },
      { path: 'setting/0004', component: setting04 },
      { path: 'setting/0005', component: setting05 },
      { path: 'setting/0006', component: setting06 },
      { path: 'setting/0007', component: setting07 },
      { path: 'setting/0008', component: setting08 },
      { path: 'setting/0009', component: setting09 },
      { path: 'setting/0010', component: setting10 },
      { path: 'setting/0011', component: setting11 },
      { path: 'setting/0012', component: setting12 },
      { path: 'setting/0013', component: setting13 },
      { path: 'setting/0014', component: setting14 },
      { path: 'setting/0015', component: setting15 },
      { path: 'setting/0016', component: setting16 },
      { path: 'setting/0017', component: setting17 },
      { path: 'setting/0018', component: setting18 },
      { path: 'setting/0019', component: setting19 },
      { path: 'setting/0020', component: setting20 },
      { path: 'setting/0021', component: setting21 },

      { path: 'admin', component: AdminDashboard, meta: { requiresMaster: true } },
      { path: 'admin-test', component: AdminVisualTestPage, meta: { requiresMaster: true } },
      { path: 'admin/members', component: AdminMembers, meta: { requiresMaster: true } },
      { path: 'admin/notices', component: AdminNotices, meta: { requiresMaster: true } },
      { path: 'admin/notices/write', component: NoticeEditPage, meta: { requiresMaster: true } },
      { path: 'admin/notices/edit/:id', component: NoticeEditPage, meta: { requiresMaster: true }, props: true },
      { path: 'admin/migration', component: AdminMigration, meta: { requiresMaster: true } },
      {
        path: 'admin/:legacy(\\d{4})',
        redirect: (to) => {
          const redirects: Record<string, string> = {
            '0003': '/home/admin/members',
            '0006': '/home/admin/notices',
            '0015': '/home/admin/migration',
          }
          return redirects[String(to.params.legacy)] || '/home/admin'
        },
        meta: { requiresMaster: true },
      },

      { path: 'legals/v2', name: 'LegalDocsV2Internal', component: LegalDocs },
      { path: 'legals/v2/:slug', name: 'LegalPageV2Internal', component: LegalContainer, props: true },
    ],
  },

  // 알 수 없는 주소에서 메인 컴포넌트를 직접 렌더하면 인증·완료 meta를 우회할 수 있다.
  { path: '/:pathMatch(.*)*', name: 'NotFound', redirect: '/home/6page' },
]

// ===== helpers =====
function isLegalRoute(path: string) {
  return path.startsWith('/legal/consent') || path.startsWith('/legals/v2') || path.includes('/home/legals/v2')
}

// ✅ “채팅 라우트” 판별 (router 쪽에서도 동일 기준)
function isChatRoutePath(path: string) {
  const p = String(path || '').toLowerCase()
  return p.startsWith('/home/chat/') || p.startsWith('/home/chat') // /home/chat/:id 포함
}

async function dismissAllOverlaysOnce() {
  try {
    await Promise.allSettled([
      modalController.dismiss(),
      actionSheetController.dismiss(),
      alertController.dismiss(),
      loadingController.dismiss(),
      popoverController.dismiss(),
      pickerController.dismiss(),
      toastController.dismiss(),
    ])
  } catch {}
}

async function fetchAccountStatus(): Promise<'active' | 'pendingDeletion' | 'unknown'> {
  try {
    const res = await api.get('/api/account/status', { withCredentials: true })
    const status = res?.data?.status || res?.data?.data?.status
    return status === 'pendingDeletion' ? 'pendingDeletion' : 'active'
  } catch {
    return 'unknown'
  }
}

// ✅ 백그라운드 실행 (첫 페인트/전환 방해 금지)
function runInBackground(fn: () => void, delayMs = 0) {
  // @ts-ignore
  const ric = (window as any).requestIdleCallback as undefined | ((cb: Function, opts?: any) => any)
  if (ric) {
    ric(() => fn(), { timeout: 1200 })
    return
  }
  setTimeout(fn, delayMs)
}

// ✅ “전환이 안정화된 후” 네비게이션 실행
function safeReplace(to: any) {
  // 2프레임 뒤에 실행: 전환/레이아웃 먼저 안정화
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      router.replace(to).catch(() => {})
    })
  })
}

async function backgroundPostChecks(toFullPath: string, requiresMaster: boolean, me: MeUser) {
  try {
    const role = String(me?.role || '').toLowerCase()
    if (requiresMaster && role !== 'master') {
      safeReplace('/home')
      return
    }

    const status = await fetchAccountStatus()
    const isOnDeletionPage =
      toFullPath === '/account/deletion-pending' || toFullPath.startsWith('/account/deletion-pending?')
    if (status === 'pendingDeletion' && !isOnDeletionPage) {
      safeReplace({ name: 'AccountDeletionPending' })
      return
    }

  } catch (e) {
    console.warn('⚠️ backgroundPostChecks err', e)
  }
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,

  // ✅ 채팅에서는 Router의 스크롤 개입을 끊어서 튕김/멈칫 방지
  scrollBehavior(to, _from, savedPosition) {
    if (isChatRoutePath(to.fullPath)) return false as any
    if (savedPosition) return savedPosition
    return { top: 0, left: 0 }
  },
})

router.beforeEach(async (to, _from, next) => {
  const requiresAuth = to.matched.some((r) => r.meta.requiresAuth)
  const requiresMaster = to.matched.some((r) => r.meta.requiresMaster)

  if (to.matched.some((r) => r.meta?.public)) return next()
  if (isLegalRoute(to.fullPath) && !requiresAuth && !requiresMaster) return next()

  if (to.path === '/login') {
    const auth = await useUserStore().bootstrapAuth({ silent: true })
    if (auth.status === 'authenticated' && auth.user) {
      const redirect = typeof to.query.redirect === 'string' ? String(to.query.redirect) : '/home/6page'
      const target = redirect.startsWith('/home') ? redirect : '/home/6page'
      return next({ path: target, replace: true })
    }
    return next()
  }

  if (!requiresAuth && !requiresMaster) return next()

  const auth = await useUserStore().bootstrapAuth({ silent: true })
  if (auth.status !== 'authenticated' || !auth.user) {
    const query: Record<string, string> = { redirect: to.fullPath }
    if (auth.status === 'unavailable') query.e = 'unavailable'
    return next({ path: '/login', query })
  }

  const role = String(auth.user.role || '').toLowerCase()
  if (requiresMaster && role !== 'master') return next('/home')

  if (role !== 'master') {
    const isConsentPage = to.name === 'AgreementPagePublic'
    const isOnboardingPage = to.name === 'Onboarding'
    const isDeletionPage = to.name === 'AccountDeletionPending'

    // 최초 필수/선택 항목은 한 번 모두 보여주되, 선택 항목의 거부는 이용을 막지 않는다.
    if (!isConsentPage && !isDeletionPage) {
      try {
        const agreement = await getAgreementStatus()
        const pending = Array.isArray(agreement?.data?.pending) ? agreement.data.pending : []
        const mustReview = pending.some((item) => item.isRequired || item.hasRecord === false)
        if (mustReview) {
          return next({
            name: 'AgreementPagePublic',
            query: { return: to.fullPath },
            replace: true,
          })
        }
      } catch (error) {
        console.error('⚠️ 동의 상태 조회 실패:', error)
        return next({
          name: 'AgreementPagePublic',
          query: { return: to.fullPath },
          replace: true,
        })
      }
    }

    if (!isConsentPage && !isDeletionPage) {
      const profileComplete = hasCompletedProfileOnboarding(auth.user)
      if (!profileComplete && !isOnboardingPage) {
        return next({
          name: 'Onboarding',
          query: { return: to.fullPath },
          replace: true,
        })
      }
      if (profileComplete && isOnboardingPage) {
        const requested = typeof to.query.return === 'string' ? to.query.return : ''
        return next({ path: requested.startsWith('/home') ? requested : '/home/6page', replace: true })
      }
    }
  }

  next()
  runInBackground(() => {
    backgroundPostChecks(to.fullPath, requiresMaster, auth.user!).catch(() => {})
  }, 0)
})

/**
 * ✅ afterEach:
 * - 채팅에서는 오버레이 정리도 스킵(최소 부하)
 * - await로 전환 막지 않음
 */
router.afterEach((to) => {
  if (isChatRoutePath(to.fullPath)) return
  runInBackground(() => {
    dismissAllOverlaysOnce().catch(() => {})
  }, 0)
})

export default router
