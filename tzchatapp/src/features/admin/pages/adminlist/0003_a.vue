<template>
  <main class="admin-subpage">
    <header class="page-header">
      <div>
        <button class="text-button" type="button" @click="goBack">← 뒤로가기</button>
        <h1>회원 확인</h1>
        <p>가입 회원을 검색하고 공개 프로필 정보를 확인합니다.</p>
      </div>
      <span class="total-badge">총 {{ number(total) }}명</span>
    </header>

    <form class="search-form" role="search" @submit.prevent="searchUsers">
      <IonIcon :icon="searchOutline" aria-hidden="true" />
      <input
        v-model="searchText"
        type="search"
        autocomplete="off"
        placeholder="이메일, 아이디, 닉네임 검색"
        aria-label="회원 검색"
      />
      <button type="submit" :disabled="loading">검색</button>
    </form>

    <div v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</div>

    <section class="member-card" aria-live="polite">
      <div v-if="loading" class="empty-state">회원 정보를 불러오고 있습니다.</div>
      <div v-else-if="!users.length" class="empty-state">조건에 맞는 회원이 없습니다.</div>
      <ul v-else class="member-list">
        <li v-for="user in users" :key="user._id">
          <button type="button" @click="goToUserProfile(user._id)">
            <span class="avatar">{{ avatarText(user) }}</span>
            <span class="member-main">
              <span class="member-name">
                <strong>{{ user.nickname || '닉네임 없음' }}</strong>
                <span v-if="user.role === 'master'" class="role-badge">MASTER</span>
                <span v-if="user.suspended" class="suspended-badge">이용 정지</span>
              </span>
              <small>{{ user.email || user.username || '계정 정보 없음' }}</small>
              <span class="member-meta">
                {{ genderLabel(user.gender) }} · {{ user.birthyear || '출생연도 미입력' }} ·
                {{ [user.region1, user.region2].filter(Boolean).join(' ') || '지역 미입력' }}
              </span>
            </span>
            <span class="member-side">
              <small>{{ user.user_level || '일반회원' }}</small>
              <IonIcon :icon="chevronForwardOutline" aria-hidden="true" />
            </span>
          </button>
        </li>
      </ul>
    </section>

    <nav v-if="pages > 1" class="pagination" aria-label="회원 목록 페이지">
      <button type="button" :disabled="loading || page <= 1" @click="movePage(page - 1)">이전</button>
      <span>{{ page }} / {{ pages }}</span>
      <button type="button" :disabled="loading || page >= pages" @click="movePage(page + 1)">다음</button>
    </nav>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { IonIcon } from '@ionic/vue'
import { chevronForwardOutline, searchOutline } from 'ionicons/icons'
import api from '@/shared/services/api'

type AdminUser = {
  _id: string
  username?: string
  email?: string
  nickname?: string
  birthyear?: number
  gender?: string
  region1?: string
  region2?: string
  role?: string
  user_level?: string
  suspended?: boolean
}

const router = useRouter()
const users = ref<AdminUser[]>([])
const searchText = ref('')
const appliedSearch = ref('')
const page = ref(1)
const pages = ref(1)
const total = ref(0)
const loading = ref(false)
const errorMessage = ref('')

function goBack() {
  if (window.history.state?.back) router.back()
  else router.replace('/home/admin')
}

function goToUserProfile(userId: string) {
  if (userId) router.push(`/home/user/${userId}`)
}

function avatarText(user: AdminUser) {
  return String(user.nickname || user.username || '?').trim().slice(0, 1).toUpperCase()
}

function genderLabel(gender?: string) {
  const value = String(gender || '').toLowerCase()
  if (value === 'man' || value === 'male') return '남성'
  if (value === 'woman' || value === 'female') return '여성'
  return '성별 미입력'
}

function number(value: number) {
  return Number(value || 0).toLocaleString('ko-KR')
}

async function loadUsers() {
  if (loading.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    const { data } = await api.get('/api/admin/users', {
      params: { page: page.value, limit: 30, search: appliedSearch.value || undefined },
    })
    users.value = Array.isArray(data?.users) ? data.users : []
    total.value = Number(data?.total || 0)
    pages.value = Math.max(1, Number(data?.pages || 1))
  } catch (error: any) {
    users.value = []
    errorMessage.value = error?.response?.data?.error || '회원 목록을 불러오지 못했습니다.'
  } finally {
    loading.value = false
  }
}

function searchUsers() {
  appliedSearch.value = searchText.value.trim()
  page.value = 1
  loadUsers()
}

function movePage(nextPage: number) {
  page.value = Math.min(Math.max(nextPage, 1), pages.value)
  loadUsers()
}

onMounted(loadUsers)
</script>

<style scoped>
.admin-subpage {
  width: min(100%, 820px);
  margin: 0 auto;
  padding: 20px 16px 34px;
  color: var(--text);
}
.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}
.text-button {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--gold-strong);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}
.page-header h1 { margin: 8px 0 4px; font-size: 25px; letter-spacing: -.035em; }
.page-header p { margin: 0; color: var(--text-dim); font-size: 12px; }
.total-badge {
  flex: 0 0 auto;
  padding: 7px 10px;
  border-radius: 999px;
  background: var(--gold-soft);
  color: var(--gold-strong);
  font-size: 11px;
  font-weight: 800;
}
.search-form {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 9px;
  padding: 7px 7px 7px 13px;
  border: 1px solid var(--panel-border);
  border-radius: 15px;
  background: var(--panel-2);
}
.search-form > ion-icon { color: var(--text-dim); }
.search-form input {
  min-width: 0;
  height: 38px;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--text);
  font-size: 13px;
}
.search-form button,
.pagination button {
  min-height: 36px;
  padding: 0 13px;
  border: 1px solid #d7c5a4;
  border-radius: 10px;
  background: var(--gold-soft);
  color: var(--gold-strong);
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}
.search-form button:disabled,
.pagination button:disabled { cursor: default; opacity: .45; }
.error-message {
  margin-top: 12px;
  padding: 11px 13px;
  border-radius: 12px;
  background: #fff0ed;
  color: #9a3f30;
  font-size: 12px;
}
.member-card {
  margin-top: 14px;
  overflow: hidden;
  border: 1px solid var(--panel-border);
  border-radius: 18px;
  background: var(--panel-2);
}
.member-list { margin: 0; padding: 0; list-style: none; }
.member-list li { border-bottom: 1px solid var(--panel-border); }
.member-list li:last-child { border-bottom: 0; }
.member-list button {
  appearance: none;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 15px;
  border: 0;
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.member-list button:hover,
.member-list button:focus-visible { background: var(--panel-soft); outline: none; }
.avatar {
  display: grid;
  place-items: center;
  width: 41px;
  height: 41px;
  border-radius: 14px;
  background: var(--gold-soft);
  color: var(--gold-strong);
  font-size: 15px;
  font-weight: 850;
}
.member-main { min-width: 0; }
.member-name { display: flex; align-items: center; gap: 6px; min-width: 0; }
.member-name strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.role-badge,
.suspended-badge { padding: 3px 5px; border-radius: 6px; font-size: 8px; font-weight: 900; }
.role-badge { background: var(--gold-soft); color: var(--gold-strong); }
.suspended-badge { background: #fff0ed; color: #a34838; }
.member-main > small,
.member-meta { display: block; overflow: hidden; margin-top: 3px; color: var(--text-dim); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.member-side { display: flex; align-items: center; gap: 6px; color: var(--text-dim); }
.member-side small { font-size: 10px; }
.member-side ion-icon { font-size: 15px; }
.empty-state { padding: 32px 16px; color: var(--text-dim); font-size: 13px; text-align: center; }
.pagination { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 16px; }
.pagination span { color: var(--text-dim); font-size: 12px; }

@media (max-width: 520px) {
  .admin-subpage { padding: 14px 12px 28px; }
  .page-header { align-items: flex-start; }
  .member-list button { grid-template-columns: auto 1fr; }
  .member-side { grid-column: 2; }
}
</style>
