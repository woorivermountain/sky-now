<script setup>
import { storeToRefs } from 'pinia'
import { useConfigStore } from '../../stores/configStore'

const configStore = useConfigStore()
const { unit, unitName, unitSymbol } = storeToRefs(configStore)
</script>

<template>
  <div class="unit-toggle" aria-label="날씨 온도 단위 설정">
    <span>날씨 단위</span>
    <button
      type="button"
      :aria-label="`현재 ${unitName} ${unitSymbol}. 눌러서 ${unit === 'celsius' ? '화씨' : '섭씨'}로 변경`"
      @click="configStore.toggleUnit()"
    >
      <i :class="{ fahrenheit: unit === 'fahrenheit' }"></i>
      <b :class="{ active: unit === 'celsius' }">°C</b>
      <b :class="{ active: unit === 'fahrenheit' }">°F</b>
    </button>
  </div>
</template>

<style scoped>
.unit-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 11px;
  border-left: 1px solid #dbe5f0;
}

.unit-toggle > span {
  color: #64748b;
  font-size: 10px;
  font-weight: 800;
}

button {
  position: relative;
  display: grid;
  width: 70px;
  height: 32px;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  padding: 3px;
  border: 1px solid #bfdbfe;
  border-radius: 999px;
  background: #eff6ff;
  cursor: pointer;
}

button i {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  width: 30px;
  border-radius: 999px;
  background: #1d4ed8;
  box-shadow: 0 4px 10px rgba(29, 78, 216, .24);
  transition: transform .2s ease;
}

button i.fahrenheit {
  transform: translateX(32px);
}

button b {
  position: relative;
  z-index: 1;
  color: #64748b;
  font-size: 11px;
  transition: color .2s ease;
}

button b.active {
  color: white;
}

@media (max-width: 720px) {
  .unit-toggle > span {
    display: none;
  }
}
</style>
