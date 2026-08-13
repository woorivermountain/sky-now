<script setup>
import { storeToRefs } from 'pinia'
import UnitToggle from './components/common/UnitToggle.vue'
import { useConfigStore } from './stores/configStore'

const configStore = useConfigStore()
const { viewMode, viewModeLabel } = storeToRefs(configStore)
</script>

<template>
  <div class="app-shell">
    <header v-show="viewMode !== 'landscape'" class="app-navigation">
      <RouterLink class="app-brand" to="/">SKY NOW</RouterLink>

      <nav aria-label="주요 메뉴">
        <RouterLink to="/">서비스 소개</RouterLink>
        <RouterLink to="/weather">날씨 홈</RouterLink>
        <RouterLink to="/scene-guide">디지털 창문 안내</RouterLink>
        <span v-if="$route.path === '/weather'" class="view-state" :class="{ live: viewMode === 'landscape' }">
          <i></i>{{ viewModeLabel }}
        </span>
        <UnitToggle />
      </nav>
    </header>

    <RouterView />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  background: #eef4fb;
}

.app-navigation {
  position: relative;
  z-index: 1000;
  display: flex;
  min-height: 62px;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 10px clamp(20px, 3vw, 68px);
  border-bottom: 1px solid rgba(148, 163, 184, 0.24);
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 8px 28px rgba(15, 23, 42, 0.05);
  backdrop-filter: blur(18px);
}

.app-brand {
  color: #123c83;
  font-size: 14px;
  font-weight: 900;
  letter-spacing: 0.14em;
}

nav {
  display: flex;
  align-items: center;
  gap: 7px;
}

nav a {
  padding: 8px 12px;
  border-radius: 999px;
  color: #475569;
  font-size: 13px;
  font-weight: 750;
}

nav a:hover {
  background: #eff6ff;
  color: #1d4ed8;
}

nav a.router-link-exact-active {
  background: #dbeafe;
  color: #1d4ed8;
}

.view-state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-radius: 999px;
  background: #f1f5f9;
  color: #64748b;
  font-size: 10px;
  font-weight: 850;
}

.view-state i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #94a3b8;
}

.view-state.live {
  background: #ecfdf5;
  color: #047857;
}

.view-state.live i {
  background: #22c55e;
  box-shadow: 0 0 0 4px rgba(34, 197, 94, .12);
}

@media (max-width: 620px) {
  .app-navigation {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
    padding-block: 12px;
  }

  nav {
    width: 100%;
    overflow-x: auto;
  }
}
</style>
