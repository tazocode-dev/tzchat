<template>
  <main class="container">
    <div class="page-head">
      <h1>약관 및 법적 안내</h1>
      <button class="btn-back" type="button" @click="goBack">뒤로가기</button>
    </div>

    <ul class="cards">
      <li v-for="item in PUBLIC_LEGAL_DOCUMENTS" :key="item.file">
        <button class="card" type="button" @click="go(item.slug)">
          <strong>{{ item.label }}</strong>
          <span>{{ item.summary }}</span>
        </button>
      </li>
    </ul>
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { PUBLIC_LEGAL_DOCUMENTS } from '@/features/legal/constants/legals'

const router = useRouter()
const route = useRoute()
const isInternal = computed(() => route.fullPath.startsWith('/home/'))

function go(slug: string) {
  router.push(`${isInternal.value ? '/home/legals/v2' : '/legals/v2'}/${encodeURIComponent(slug)}`)
}
function goBack() {
  if (typeof window !== 'undefined' && window.history.length > 1) router.back()
  else router.replace('/home/6page')
}
</script>

<style scoped>
.container{width:min(100%,760px);margin:0 auto;padding:18px 16px 32px;color:var(--text,#2d241f)}
.page-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:20px}.page-head h1{margin:0;font-size:clamp(1.45rem,5vw,2rem)}
.btn-back{border:1px solid var(--border,#ddd2c9);background:var(--surface,#fff);color:var(--text,#2d241f);font-weight:700;padding:8px 12px;border-radius:10px;cursor:pointer}
.cards{list-style:none;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px;padding:0;margin:0}.card{width:100%;height:100%;text-align:left;border:1px solid var(--border,#ddd2c9);border-radius:14px;padding:20px;background:var(--surface,#fff);color:var(--text,#2d241f);cursor:pointer}.card strong{display:block;font-size:1rem}.card span{display:block;margin-top:8px;color:var(--text-muted,#655b54);line-height:1.45;font-size:.92rem}.card:hover{box-shadow:0 6px 18px rgba(70,50,35,.12)}.card:focus-visible{outline:3px solid rgba(154,105,42,.45);outline-offset:2px}
@media(max-width:480px){.cards{grid-template-columns:1fr;gap:10px}.card{padding:16px}.page-head{align-items:flex-start}}
</style>
