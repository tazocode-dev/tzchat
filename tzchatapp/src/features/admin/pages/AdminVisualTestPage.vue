<template>
  <main class="visual-test-page">
    <header class="test-hero">
      <div>
        <p class="eyebrow">ADMIN PREVIEW LAB</p>
        <h1>운영 시각 테스트</h1>
        <p>서비스 상태 화면을 구현하기 전에 표현 방식과 우선순위를 검토하는 공간입니다.</p>
      </div>
      <span class="preview-only" role="status">시각 전용 · 실제 동작 없음</span>
    </header>

    <aside class="safety-banner">
      <strong>모든 항목은 샘플입니다.</strong>
      <span>API 호출, 데이터 변경, 권한 요청, 알림 발송, 네이티브 기능 실행이 없습니다.</span>
    </aside>

    <section aria-labelledby="account-scenarios-title">
      <div class="section-heading">
        <div>
          <p class="section-kicker">ACCOUNT STATES</p>
          <h2 id="account-scenarios-title">계정 상태 시나리오</h2>
        </div>
        <span class="sample-label">샘플</span>
      </div>
      <div class="scenario-grid">
        <article v-for="item in accountScenarios" :key="item.label" class="scenario-card">
          <span class="state-dot" :class="`state-dot--${item.tone}`" />
          <div>
            <strong>{{ item.label }} · 샘플</strong>
            <p>{{ item.description }}</p>
          </div>
        </article>
      </div>
    </section>

    <section aria-labelledby="notification-previews-title">
      <div class="section-heading">
        <div>
          <p class="section-kicker">NOTIFICATION CARDS</p>
          <h2 id="notification-previews-title">알림 미리보기</h2>
        </div>
        <span class="sample-label">미리보기</span>
      </div>
      <div class="notification-grid">
        <article v-for="item in notificationPreviews" :key="item.type" class="notification-card">
          <span class="notification-type">{{ item.type }} · 미리보기</span>
          <strong>{{ item.title }}</strong>
          <p>{{ item.body }}</p>
          <time>방금 전 · 샘플</time>
        </article>
      </div>
    </section>

    <div class="split-sections">
      <section aria-labelledby="matching-states-title">
        <div class="section-heading">
          <div>
            <p class="section-kicker">MATCHING</p>
            <h2 id="matching-states-title">매칭 상태</h2>
          </div>
          <span class="sample-label">샘플</span>
        </div>
        <div class="panel-list">
          <div v-for="item in matchingStates" :key="item.label" class="panel-row">
            <span>{{ item.label }} · 샘플</span>
            <strong :class="`text-${item.tone}`">{{ item.status }}</strong>
          </div>
        </div>
      </section>

      <section aria-labelledby="connection-states-title">
        <div class="section-heading">
          <div>
            <p class="section-kicker">CONNECTIONS</p>
            <h2 id="connection-states-title">운영 연결 상태</h2>
          </div>
          <span class="sample-label">샘플</span>
        </div>
        <div class="panel-list">
          <div v-for="item in connectionStates" :key="item.label" class="panel-row">
            <span>{{ item.label }} · 샘플</span>
            <strong :class="`text-${item.tone}`">{{ item.status }}</strong>
          </div>
        </div>
      </section>
    </div>

    <section aria-labelledby="common-ui-title">
      <div class="section-heading">
        <div>
          <p class="section-kicker">COMMON UI</p>
          <h2 id="common-ui-title">공통 UI 상태</h2>
        </div>
        <span class="sample-label">미리보기</span>
      </div>
      <div class="ui-state-grid">
        <article v-for="item in commonUiStates" :key="item.label" class="ui-state-card">
          <span class="ui-state-icon" :class="`ui-state-icon--${item.tone}`" aria-hidden="true">
            {{ item.symbol }}
          </span>
          <strong>{{ item.label }} · 미리보기</strong>
          <p>{{ item.description }}</p>
          <button type="button" disabled>검토 예정</button>
        </article>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
const accountScenarios = [
  { label: '정상', description: '서비스의 모든 기본 기능을 이용할 수 있는 상태', tone: 'success' },
  { label: '약관 필요', description: '필수 약관 동의 화면으로 안내해야 하는 상태', tone: 'warning' },
  { label: '나이 필요', description: '성인 확인을 위한 출생연도 입력이 필요한 상태', tone: 'warning' },
  { label: '성별 필요', description: '온보딩의 성별 선택 단계가 남아 있는 상태', tone: 'warning' },
  { label: '탈퇴 대기', description: '복구 가능 기간과 최종 삭제일을 안내하는 상태', tone: 'danger' },
]

const notificationPreviews = [
  { type: '채팅', title: '새 메시지가 도착했습니다', body: '대화 내용은 알림 설정에 따라 숨겨서 표시합니다.' },
  { type: '친구', title: '새 친구 요청이 있습니다', body: '받은 요청 목록에서 프로필을 확인할 수 있습니다.' },
  { type: '매칭', title: '매칭 결과를 확인해 주세요', body: '새로운 연결 가능성이 생긴 상황을 안내합니다.' },
  { type: '시스템', title: '서비스 점검 안내', body: '예정된 점검 시간과 영향을 간결하게 전달합니다.' },
]

const matchingStates = [
  { label: '대기', status: '상대 탐색 중', tone: 'muted' },
  { label: '진행', status: '매칭 진행 중', tone: 'success' },
  { label: '숨김', status: '목록에서 숨김', tone: 'warning' },
  { label: '종료', status: '매칭 종료', tone: 'danger' },
]

const connectionStates = [
  { label: 'Web', status: '연결 샘플', tone: 'success' },
  { label: 'API', status: '응답 샘플', tone: 'success' },
  { label: 'Socket', status: '재연결 샘플', tone: 'warning' },
  { label: 'FCM', status: '미확인 샘플', tone: 'muted' },
]

const commonUiStates = [
  { label: '로딩', description: '응답을 기다리는 동안 사용할 자리 표시 상태', tone: 'loading', symbol: '···' },
  { label: '빈 목록', description: '표시할 데이터가 없을 때 다음 행동을 안내하는 상태', tone: 'empty', symbol: '0' },
  { label: '오류', description: '실패 이유와 재시도 가능 여부를 구분하는 상태', tone: 'error', symbol: '!' },
  { label: '성공', description: '작업이 완료되었음을 짧고 명확하게 알리는 상태', tone: 'success', symbol: '✓' },
]
</script>

<style scoped>
.visual-test-page {
  min-height: 100%;
  padding: 22px 18px calc(36px + env(safe-area-inset-bottom));
  color: var(--text);
  background: var(--bg);
}

.test-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 22px;
  border: 1px solid var(--panel-border);
  border-radius: 22px;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}

.eyebrow,
.section-kicker {
  margin: 0 0 5px;
  color: var(--gold-strong);
  font-size: 11px;
  font-weight: 850;
  letter-spacing: .12em;
}

h1,
h2,
p { margin-top: 0; }
h1 { margin-bottom: 8px; font-size: clamp(25px, 6vw, 34px); }
h2 { margin-bottom: 0; font-size: 19px; }
.test-hero p:last-child { margin-bottom: 0; color: var(--text-dim); line-height: 1.55; }

.preview-only,
.sample-label {
  flex: 0 0 auto;
  border: 1px solid var(--panel-border);
  border-radius: 999px;
  background: var(--gold-soft);
  color: var(--gold-strong);
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}
.preview-only { padding: 8px 11px; }
.sample-label { padding: 5px 8px; }

.safety-banner {
  display: flex;
  gap: 8px;
  margin: 12px 0 28px;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--gold-soft);
  color: var(--text-dim);
  font-size: 13px;
}
.safety-banner strong { color: var(--text); white-space: nowrap; }

section { margin-top: 28px; }
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.scenario-grid,
.notification-grid,
.ui-state-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 10px;
}

.scenario-card,
.notification-card,
.ui-state-card,
.panel-list {
  border: 1px solid var(--panel-border);
  border-radius: 16px;
  background: var(--panel);
  box-shadow: var(--shadow-sm);
}

.scenario-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 15px;
}
.scenario-card p,
.notification-card p,
.ui-state-card p { margin: 5px 0 0; color: var(--text-dim); font-size: 13px; line-height: 1.45; }

.state-dot { width: 9px; height: 9px; margin-top: 5px; border-radius: 50%; background: var(--text-dim); }
.state-dot--success { background: var(--success); }
.state-dot--warning { background: var(--ion-color-warning); }
.state-dot--danger { background: var(--danger); }

.notification-card { padding: 16px; }
.notification-type { display: block; margin-bottom: 10px; color: var(--gold-strong); font-size: 11px; font-weight: 800; }
.notification-card time { display: block; margin-top: 12px; color: var(--text-dim); font-size: 11px; }

.split-sections { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.panel-list { overflow: hidden; }
.panel-row { display: flex; justify-content: space-between; gap: 12px; padding: 14px 15px; font-size: 13px; }
.panel-row + .panel-row { border-top: 1px solid var(--panel-border); }
.text-success { color: var(--success); }
.text-warning { color: var(--ion-color-warning); }
.text-danger { color: var(--danger); }
.text-muted { color: var(--text-dim); }

.ui-state-card { padding: 16px; }
.ui-state-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  margin-bottom: 12px;
  border-radius: 11px;
  background: var(--gold-soft);
  color: var(--gold-strong);
  font-weight: 900;
}
.ui-state-icon--error { background: rgba(180, 54, 54, .1); color: var(--danger); }
.ui-state-icon--success { background: rgba(41, 135, 89, .1); color: var(--success); }
.ui-state-card button {
  width: 100%;
  min-height: 40px;
  margin-top: 14px;
  border: 1px solid var(--panel-border);
  border-radius: 11px;
  background: var(--panel-soft);
  color: var(--text-dim);
  font-weight: 750;
  opacity: .8;
}

@media (max-width: 720px) {
  .visual-test-page { padding: 16px 12px calc(28px + env(safe-area-inset-bottom)); }
  .test-hero { flex-direction: column; padding: 18px; }
  .safety-banner { flex-direction: column; }
  .safety-banner strong { white-space: normal; }
  .split-sections { grid-template-columns: 1fr; }
  .scenario-grid,
  .notification-grid,
  .ui-state-grid { grid-template-columns: 1fr; }
}
</style>
