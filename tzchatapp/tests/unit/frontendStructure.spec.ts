// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const routerSource = readFileSync(resolve(process.cwd(), 'src/router/index.ts'), 'utf8')
const topMenuSource = readFileSync(resolve(process.cwd(), 'src/layouts/TopMenu.vue'), 'utf8')
const profileSource = readFileSync(resolve(process.cwd(), 'src/features/profile/pages/MyProfilePage.vue'), 'utf8')
const apiSource = readFileSync(resolve(process.cwd(), 'src/shared/services/api.ts'), 'utf8')

describe('프론트엔드 운영 화면 구조', () => {
  test('메인·설정·관리자 화면은 역할을 나타내는 파일명을 사용한다', () => {
    expect(routerSource).toContain("import AllUsersPage from '@/features/search/pages/AllUsersPage.vue'")
    expect(routerSource).toContain("import SettingsPage from '@/features/settings/pages/SettingsPage.vue'")
    expect(routerSource).toContain("import NoticeListPage from '@/features/settings/pages/NoticeListPage.vue'")
    expect(routerSource).toContain("const AdminDashboardPage = () => import('@/features/admin/pages/AdminDashboardPage.vue')")
    expect(routerSource).toContain("const AdminReportsPage = () => import('@/features/admin/pages/AdminReportsPage.vue')")
    expect(routerSource).not.toContain('/components/setlist/')
    expect(routerSource).not.toContain('/pages/adminlist/')
  })

  test('친구 하위 화면과 프로필 편집 모달도 역할 기반 파일명을 사용한다', () => {
    expect(routerSource).toContain("import BlockedUsersPage from '@/features/friends/pages/BlockedUsersPage.vue'")
    expect(routerSource).toContain("import FriendsListPage from '@/features/friends/pages/FriendsListPage.vue'")
    expect(profileSource).toContain("import('@/features/profile/components/RegionEditModal.vue')")
    expect(profileSource).toContain("import('@/features/profile/components/SelfIntroductionEditModal.vue')")
    expect(profileSource).toContain("import('@/features/profile/components/NicknameEditModal.vue')")
  })

  test('현행 설정 화면의 숫자 URL은 유지하고 삭제된 화면는 설정·프로필로 안전하게 연결한다', () => {
    expect(routerSource).toContain("{ path: 'setting/0001', name: 'NoticeList', component: NoticeListPage }")
    expect(routerSource).toContain("{ path: 'setting/0019', name: 'PasswordChange', component: PasswordChangePage }")
    expect(routerSource).toContain("{ path: 'setting/0020', name: 'AccountDeletion', component: AccountDeletionPage }")
    expect(routerSource).toContain("{ path: 'setting/0021', name: 'AuthInfo', component: AuthInfoPage }")
    expect(routerSource).toContain("path: 'setting/:legacy(\\\\d{4})'")
    expect(routerSource).toContain("['0008', '0009'].includes(String(to.params.legacy))")
    expect(routerSource).toContain("? '/home/6page'")
    expect(routerSource).toContain(": '/home/7page'")
  })

  test('운영용 하단 메뉴에는 시각 테스트 탭과 라우트가 남지 않는다', () => {
    expect(topMenuSource).not.toContain("name: '테스트'")
    expect(topMenuSource).not.toContain('flaskOutline')
  })

  test('사용자가 자신의 회원 등급을 바꾸는 테스트 모달과 API 호출이 남지 않는다', () => {
    const removedModalName = ['Modal', 'Level'].join('_')
    const removedVisibilityState = ['show', 'Level', 'Modal'].join('')
    const removedEndpoint = ['/api/user', 'grade'].join('/')
    expect(profileSource).not.toContain(removedModalName)
    expect(profileSource).not.toContain(removedVisibilityState)
    expect(profileSource).not.toContain(removedEndpoint)
  })

  test('HTTP 인증 리다이렉트는 router 역참조 없이 브라우저 replace를 사용한다', () => {
    const routerDynamicImport = ['import(', "'@/router'", ')'].join('')
    expect(apiSource).not.toContain(routerDynamicImport)
    expect(apiSource).toContain('window.location.replace(target)')
  })
})
