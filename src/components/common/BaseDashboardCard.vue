<script setup>
// 공통 카드의 모양만 담당하고, 실제 내용은 부모가 slot으로 전달합니다.
defineProps({
  variant: {
    type: String,
    default: 'default',
  },
})
</script>

<template>
  <section class="dashboard-card" :class="`dashboard-card--${variant}`">
    <slot name="header" />
    <slot />
    <slot name="footer" />
  </section>
</template>

<style scoped>
.dashboard-card {
  min-width: 0;
}

.dashboard-card--default {
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.46);
  border-radius: 18px;
  background: rgba(250, 253, 255, 0.82);
  box-shadow: 0 22px 60px rgba(8, 25, 45, 0.16);
  backdrop-filter: blur(22px) saturate(120%);
}

.dashboard-card--glass {
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.09);
  backdrop-filter: blur(12px);
}
</style>
