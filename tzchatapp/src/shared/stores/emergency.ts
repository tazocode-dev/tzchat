import { defineStore } from 'pinia'
import api from '@/shared/services/api'

export interface EmergencyUser {
  _id: string
  [key: string]: any
}

interface Availability {
  isOpen?: boolean
  nextStartsAt?: string | null
  scheduleText?: string
  timezone?: string
  currentWindow?: { slotKey?: string; startsAt?: string; closesAt?: string } | null
}

interface EmergencyMeta {
  isActive?: boolean
  hasSession?: boolean
  activatedAt?: string | null
  expiresAt?: string | null
  slotKey?: string
  remainingSeconds?: number
  durationSeconds?: number
  availability?: Availability
}

let countdownTimer: ReturnType<typeof setInterval> | null = null

export const useEmergencyStore = defineStore('emergency', {
  state: () => ({
    isActive: false,
    hasSession: false,
    activatedAt: null as string | null,
    expiresAt: null as string | null,
    slotKey: '',
    durationSeconds: 3600,
    remainingSeconds: 0,
    availability: {
      isOpen: false,
      nextStartsAt: null,
      scheduleText: '매일 13:00~15:00 · 21:00~23:00',
      timezone: 'Asia/Seoul',
      currentWindow: null,
    } as Availability,
    rawList: [] as EmergencyUser[],
    loading: false,
    error: '',
  }),

  actions: {
    applyServerState(data: EmergencyMeta = {}) {
      this.isActive = data.isActive === true
      this.activatedAt = data.activatedAt || null
      this.expiresAt = data.expiresAt || null
      this.slotKey = data.slotKey || ''
      this.durationSeconds = Number(data.durationSeconds) || this.durationSeconds || 3600
      this.remainingSeconds = Math.max(0, Number(data.remainingSeconds) || 0)
      this.hasSession = data.hasSession === true || this.remainingSeconds > 0
      if (data.availability) this.availability = { ...this.availability, ...data.availability }

      if (this.hasSession && this.remainingSeconds > 0) this.startCountdown()
      else this.stopCountdown()
    },

    bootstrapFromMe(emergency: EmergencyMeta | undefined) {
      this.applyServerState(emergency || {})
    },

    async turnOn() {
      this.loading = true
      this.error = ''
      try {
        const res = await api.put('/api/emergencyon')
        this.applyServerState({ ...(res?.data || {}), isActive: true, hasSession: true })
      } catch (err: any) {
        const data = err?.response?.data || {}
        this.error = data.message || err?.message || '스피드 매칭을 시작하지 못했습니다.'
        if (data.availability) this.availability = { ...this.availability, ...data.availability }
        throw err
      } finally {
        this.loading = false
      }
    },

    async turnOff() {
      this.loading = true
      this.error = ''
      try {
        const res = await api.put('/api/emergencyoff')
        this.applyServerState({ ...(res?.data || {}), isActive: false })
      } catch (err: any) {
        this.error = err?.response?.data?.message || err?.message || '잠시 숨기기에 실패했습니다.'
        throw err
      } finally {
        this.loading = false
      }
    },

    async fetchList() {
      try {
        const res = await api.get('/api/emergencyusers')
        this.rawList = Array.isArray(res?.data?.users) ? res.data.users : []
        if (res?.data?.availability) {
          this.availability = { ...this.availability, ...res.data.availability }
        }
      } catch (err) {
        console.error('스피드 매칭 목록 로딩 실패:', err)
      }
    },

    startCountdown() {
      this.stopCountdown()
      const due = this.expiresAt
        ? new Date(this.expiresAt).getTime()
        : (this.activatedAt ? new Date(this.activatedAt).getTime() + this.durationSeconds * 1000 : NaN)
      if (!Number.isFinite(due)) return

      const tick = () => {
        const left = Math.max(0, Math.ceil((due - Date.now()) / 1000))
        this.remainingSeconds = left
        if (left <= 0) {
          this.isActive = false
          this.hasSession = false
          this.stopCountdown()
        }
      }
      tick()
      countdownTimer = setInterval(tick, 1000)
    },

    stopCountdown() {
      if (countdownTimer) {
        clearInterval(countdownTimer)
        countdownTimer = null
      }
    },

    dispose() {
      this.stopCountdown()
    },
  },
})
