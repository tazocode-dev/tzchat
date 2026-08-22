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

// 로그인 전 화면
import LoginPage from '@/features/auth/pages/LoginPage.vue'
import OnboardingPage from '@/features/auth/pages/OnboardingPage.vue'
import HomePage from '@/layouts/HomePage.vue'

// 관리자(master) 전용 아이디/비밀번호 로그인은 일반 사용자의 전화번호 인증과 분리한다.
import AdminLoginPage from '@/features/auth/pages/AdminLoginPage.vue'

// 메인 탭
import AllUsersPage from '@/features/search/pages/AllUsersPage.vue'
import TargetSearchPage from '@/features/search/pages/TargetSearchPage.vue'
import FriendsPage from '@/features/friends/pages/FriendsPage.vue'
import ChatListPage from '@/features/chat/pages/ChatListPage.vue'
import MyProfilePage from '@/features/profile/pages/MyProfilePage.vue'
import SettingsPage from '@/features/settings/pages/SettingsPage.vue'

// 친구 탭 하위 목록
import BlockedUsersPage from '@/features/friends/pages/BlockedUsersPage.vue'
import FriendsListPage from '@/features/friends/pages/FriendsListPage.vue'
import ReceivedFriendRequestsPage from '@/features/friends/pages/ReceivedFriendRequestsPage.vue'
import SentFriendRequestsPage from '@/features/friends/pages/SentFriendRequestsPage.vue'

// 사용자 프로필과 채팅
import UserProfilePage from '@/features/profile/pages/UserProfilePage.vue'
import SpeedUserProfilePage from '@/features/profile/pages/SpeedUserProfilePage.vue'
import ChatRoomPage from '@/features/chat/pages/ChatRoomPage.vue'

// notice
import NoticeEditPage from '@/features/admin/pages/detail/NoticeEditPage.vue'

// 설정 하위 화면
import NoticeListPage from '@/features/settings/pages/NoticeListPage.vue'
import PasswordChangePage from '@/features/settings/pages/PasswordChangePage.vue'
import AccountDeletionPage from '@/features/settings/pages/AccountDeletionPage.vue'
import AuthInfoPage from '@/features/settings/pages/AuthInfoPage.vue'

// admin — 실제 운영 기능만 필요할 때 로드한다.
const AdminDashboardPage = () => import('@/features/admin/pages/AdminDashboardPage.vue')
const AdminMembersPage = () => import('@/features/admin/pages/AdminMembersPage.vue')
const AdminNoticesPage = () => import('@/features/admin/pages/AdminNoticesPage.vue')
const AdminReportsPage = () => import('@/features/admin/pages/AdminReportsPage.vue')
const AdminMigrationPage = () => import('@/features/admin/pages/AdminMigrationPage.vue')

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
  // 일반 사용자는 전화번호 문자 인증으로 가입·로그인한다.
  { path: '/login', name: 'Login', component: LoginPage },

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
      { path: '', name: 'HomeDefault', component: MyProfilePage },

      { path: 'membership/buy', redirect: '/home/6page' },
      { path: 'membership/history', redirect: '/home/6page' },

      { path: '1page', name: 'AllUsers', component: AllUsersPage },
      { path: 'targetpage', name: 'TargetSearch', component: TargetSearchPage },
      { path: '3page', name: 'Friends', component: FriendsPage },

      { path: '4page', name: 'ChatList', component: ChatListPage },
      { path: '6page', name: 'MyProfile', component: MyProfilePage },
      { path: '7page', name: 'Settings', component: SettingsPage },

      { path: '31page', name: 'BlockedUsers', component: BlockedUsersPage },
      { path: '32page', name: 'FriendList', component: FriendsListPage },
      { path: '33page', name: 'ReceivedFriendRequests', component: ReceivedFriendRequestsPage },
      { path: '34page', name: 'SentFriendRequests', component: SentFriendRequestsPage },
      { path: 'user/:id', name: 'UserProfile', component: UserProfilePage, props: true },

      {
        path: 'speeduser/:id',
        name: 'SpeedUserProfile',
        component: SpeedUserProfilePage,
        props: true,
        alias: ['/home/premiumuser/:id', '/home/premuimuser/:id'],
      },

      { path: 'chat/:id', name: 'ChatRoom', component: ChatRoomPage, props: true },

      { path: 'purchase/main', redirect: '/home/6page' },

      { path: 'setting/0001', name: 'NoticeList', component: NoticeListPage },
      { path: 'setting/0002/write', redirect: '/home/admin/notices/write' },
      { path: 'setting/0002/edit/:id', redirect: (to) => `/home/admin/notices/edit/${to.params.id}` },

      { path: 'setting/0005', redirect: '/home/legals/v2/privacy' },
      { path: 'setting/0006', redirect: '/home/legals/v2/terms' },
      { path: 'setting/0007', redirect: '/home/legals/v2/youth-policy' },
      { path: 'setting/0019', name: 'PasswordChange', component: PasswordChangePage },
      { path: 'setting/0020', name: 'AccountDeletion', component: AccountDeletionPage },
      { path: 'setting/0021', name: 'AuthInfo', component: AuthInfoPage },
      {
        path: 'setting/:legacy(\\d{4})',
        name: 'LegacySettings',
        redirect: (to) => ['0008', '0009'].includes(String(to.params.legacy))
          ? '/home/6page'
          : '/home/7page',
      },

      { path: 'admin', name: 'AdminDashboard', component: AdminDashboardPage, meta: { requiresMaster: true } },
      { path: 'admin/members', name: 'AdminMembers', component: AdminMembersPage, meta: { requiresMaster: true } },
      { path: 'admin/notices', name: 'AdminNotices', component: AdminNoticesPage, meta: { requiresMaster: true } },
      { path: 'admin/reports', name: 'AdminReports', component: AdminReportsPage, meta: { requiresMaster: true } },
      { path: 'admin/notices/write', name: 'AdminNoticeCreate', component: NoticeEditPage, meta: { requiresMaster: true } },
      { path: 'admin/notices/edit/:id', name: 'AdminNoticeEdit', component: NoticeEditPage, meta: { requiresMaster: true }, props: true },
      { path: 'admin/migration', name: 'AdminMigration', component: AdminMigrationPage, meta: { requiresMaster: true } },
      {
        path: 'admin/:legacy(\\d{4})',
        name: 'LegacyAdmin',
        redirect: (to) => {
          const redirects: Record<string, string> = {
            '0003': '/home/admin/members',
            '0006': '/home/admin/notices',
            '0007': '/home/admin/reports',
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
