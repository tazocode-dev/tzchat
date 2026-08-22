<template>
  <section class="speed-results" aria-labelledby="speed-results-title">
    <header class="section-header">
      <div>
        <h3 id="speed-results-title">스피드 매칭 결과</h3>
        <p>일반 매칭 신청과 분리해서 보여드립니다.</p>
      </div>
      <span class="count">{{ users.length }}</span>
    </header>

    <UserList
      :users="users"
      :is-loading="isLoading"
      empty-text="스피드 매칭 신청이나 결과가 없습니다."
      @select="user => router.push(`/home/user/${user._id}`)"
    >
      <template #item-extra="{ user }">
        <div class="result-meta">
          <span class="status" :class="statusClass(user._speedRequest)">
            {{ statusText(user._speedRequest) }}
          </span>
          <p v-if="user._speedRequest?.message" class="message">{{ user._speedRequest.message }}</p>
        </div>
      </template>

      <template #item-actions="{ user }">
        <template v-if="isIncomingPending(user._speedRequest)">
          <ion-button class="btn-primary" :disabled="busy" @click.stop="accept(user._speedRequest)">수락</ion-button>
          <ion-button class="btn-outline" :disabled="busy" @click.stop="reject(user._speedRequest)">거절</ion-button>
        </template>
        <ion-button
          v-else-if="isOutgoingPending(user._speedRequest)"
          class="btn-outline"
          :disabled="busy"
          @click.stop="cancel(user._speedRequest)"
        >신청 취소</ion-button>
        <ion-button
          v-else-if="user._speedRequest?.status === 'accepted'"
          class="btn-primary"
          @click.stop="openChat(user._speedRequest)"
        >대화하기</ion-button>
      </template>
    </UserList>

    <ion-toast
      :is-open="toast.open"
      :message="toast.message"
      :color="toast.color"
      duration="1700"
      position="top"
      @didDismiss="toast.open = false"
    />
  </section>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { IonButton, IonToast } from '@ionic/vue'
import api from '@/shared/services/api'
import UserList from '@/shared/components/UserList.vue'

const router = useRouter()
const users = ref([])
const myId = ref('')
const isLoading = ref(true)
const busy = ref(false)
const toast = ref({ open: false, message: '', color: 'dark' })

const idOf = value => String(value?._id ?? value ?? '')
const isIncomingPending = request => request?.status === 'pending' && idOf(request?.to) === myId.value
const isOutgoingPending = request => request?.status === 'pending' && idOf(request?.from) === myId.value

function statusText(request) {
  if (request?.status === 'accepted') return '스피드 매칭 성공'
  if (isIncomingPending(request)) return '받은 스피드 신청'
  return '응답 대기 중'
}

function statusClass(request) {
  if (request?.status === 'accepted') return 'success'
  if (isIncomingPending(request)) return 'incoming'
  return 'waiting'
}

function showToast(message, color = 'dark') {
  toast.value = { open: true, message, color }
}

async function fetchUser(id) {
  try {
    const response = await api.get(`/api/users/${id}`)
    return response?.data?.user || response?.data || null
  } catch {
    return null
  }
}

async function loadResults() {
  isLoading.value = true
  try {
    const [meResponse, resultResponse] = await Promise.all([
      api.get('/api/me'),
      api.get('/api/friend-requests/speed/results'),
    ])
    myId.value = idOf(meResponse?.data?.user)
    const requests = Array.isArray(resultResponse?.data) ? resultResponse.data : []

    const rows = await Promise.all(requests.map(async request => {
      const otherId = idOf(request.from) === myId.value ? idOf(request.to) : idOf(request.from)
      if (!otherId) return null
      const populated = idOf(request.from) === otherId ? request.from : request.to
      const full = await fetchUser(otherId)
      return {
        ...(typeof populated === 'object' ? populated : {}),
        ...(full || {}),
        _id: otherId,
        _speedRequest: request,
      }
    }))

    const unique = new Map()
    for (const row of rows.filter(Boolean)) {
      if (!unique.has(row._id)) unique.set(row._id, row)
    }
    users.value = Array.from(unique.values())
  } catch (error) {
    console.error('스피드 매칭 결과 로딩 실패:', error)
    users.value = []
    showToast('스피드 매칭 결과를 불러오지 못했습니다.', 'danger')
  } finally {
    isLoading.value = false
  }
}

async function accept(request) {
  if (!request?._id || busy.value) return
  busy.value = true
  try {
    const response = await api.put(`/api/friend-request/${request._id}/accept`, {})
    const roomId = response?.data?.roomId
    showToast('스피드 매칭이 성사되었습니다.', 'success')
    await loadResults()
    if (roomId) await router.push(`/home/chat/${roomId}`)
  } finally {
    busy.value = false
  }
}

async function reject(request) {
  if (!request?._id || busy.value) return
  busy.value = true
  try {
    await api.put(`/api/friend-request/${request._id}/reject`, {})
    showToast('스피드 매칭 신청을 거절했습니다.')
    await loadResults()
  } finally {
    busy.value = false
  }
}

async function cancel(request) {
  if (!request?._id || busy.value) return
  busy.value = true
  try {
    await api.delete(`/api/friend-request/${request._id}`)
    showToast('스피드 매칭 신청을 취소했습니다.')
    await loadResults()
  } finally {
    busy.value = false
  }
}

async function openChat(request) {
  if (request?.roomId) return router.push(`/home/chat/${request.roomId}`)
  return router.push('/home/4page')
}

onMounted(loadResults)
</script>

<style scoped>
.speed-results { display: grid; gap: 12px; }
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border: 1px solid #e3d2b8;
  border-radius: 18px;
  background: linear-gradient(135deg, #fff8eb, #fff);
}
.section-header h3 { margin: 0; color: var(--text-strong); font-size: 16px; }
.section-header p { margin: 4px 0 0; color: var(--text-dim); font-size: 11px; }
.count { display: grid; place-items: center; min-width: 32px; height: 32px; border-radius: 50%; background: var(--gold-soft); color: var(--gold-strong); font-weight: 800; }
.result-meta { display: grid; gap: 5px; }
.status { width: fit-content; padding: 4px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 800; }
.status.success { background: #e7f4ea; color: #28723a; }
.status.incoming { background: var(--gold-soft); color: var(--gold-strong); }
.status.waiting { background: var(--panel-soft); color: var(--text-dim); }
.message { margin: 0; color: var(--text-dim); font-size: 11.5px; white-space: pre-wrap; }
.btn-primary { --background: var(--gold-strong); --color: #fff; }
.btn-outline { --background: #fff; --color: var(--gold-strong); --border-color: #d8c5a5; --border-style: solid; --border-width: 1px; }
</style>
