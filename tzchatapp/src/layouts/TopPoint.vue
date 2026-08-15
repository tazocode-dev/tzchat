<template>
  <header class="brand-header" aria-label="손끝">
    <strong>손끝</strong>
  </header>
</template>

<style scoped>
.brand-header {
  display: flex;
  align-items: center;
  min-height: 52px;
  padding: calc(6px + var(--safe-top)) 16px 8px;
  border-bottom: 1px solid var(--panel-border);
  background: rgba(251, 250, 248, 0.94);
  color: var(--text-strong);
  backdrop-filter: saturate(150%) blur(18px);
  -webkit-backdrop-filter: saturate(150%) blur(18px);
}

.brand-header strong {
  font-size: 19px;
  font-weight: 850;
  letter-spacing: -0.04em;
}

@media (max-width: 360px) {
  .brand-header { min-height: 48px; padding-inline: 12px; }
}
</style>
