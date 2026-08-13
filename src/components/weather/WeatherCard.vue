<script setup>
import { computed } from 'vue'
import { useTemperature } from '../../composables/useTemperature'

const props = defineProps({
  weather: {
    type: Object,
    required: true,
  },
  averageTemperature: {
    type: Number,
    default: null,
  },
})

const { displayTemp, unitSymbol } = useTemperature()

const weatherBasis = computed(() => {
  if (props.weather.dataSource?.includes('nowcast')) {
    return `기상청 실황 ${String(props.weather.observationTime ?? '').slice(11, 16)}`
  }
  if (props.weather.dataSource?.startsWith('kma-')) {
    return `기상청 예보 ${String(props.weather.observationTime ?? '').slice(11, 16)}`
  }
  return '기본 데이터'
})

// 카드는 데이터를 바꾸지 않고 선택·상세·풍경 이벤트만 부모에게 전달합니다.
const emit = defineEmits(['select-card', 'click-detail', 'open-landscape'])

function selectCard() {
  emit('select-card', props.weather)
}
</script>

<template>
  <li class="weather-card" tabindex="0" @click="selectCard" @keydown.enter="selectCard">
    <div class="card-main">
      <div>
        <p class="city">{{ weather.city }}</p>
        <h3>{{ weather.name }}</h3>
      </div>
      <p class="temperature">{{ displayTemp(weather.temp) }}<span>{{ unitSymbol }}</span></p>
    </div>

    <div class="card-meta">
      <span class="status-pill">{{ weather.status }}</span>
      <span
        v-if="weather.temp !== null && averageTemperature !== null && weather.temp > averageTemperature"
        class="warmer-pill"
      >
        평균 이상
      </span>
      <small class="weather-basis">{{ weatherBasis }}</small>
    </div>

    <div class="card-actions">
      <button class="detail-button" @click.stop="emit('click-detail', weather)">상세 날씨 보기</button>
      <button class="landscape-button" @click.stop="emit('open-landscape', weather)">이 지역 디지털 창문</button>
    </div>
  </li>
</template>

<style scoped>
.weather-card {
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.72);
  cursor: pointer;
  list-style: none;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.weather-card:hover,
.weather-card:focus-visible {
  border-color: #bfdbfe;
  outline: none;
  box-shadow: 0 10px 24px rgba(30, 64, 175, 0.12);
  transform: translateY(-2px);
}

.card-main {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
}

.city {
  margin: 0 0 3px;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

h3 {
  margin: 0;
  color: #1e293b;
  font-size: 16px;
  letter-spacing: -0.04em;
}

.temperature {
  margin: 0;
  color: #1d4ed8;
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.07em;
}

.temperature span {
  margin-left: 2px;
  color: #64748b;
  font-size: 12px;
  letter-spacing: 0;
}

.card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 12px 0;
}

.weather-basis {
  width: 100%;
  margin-top: 2px;
  color: #64748b;
  font-size: 10px;
}

.status-pill,
.warmer-pill {
  padding: 5px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
}

.status-pill {
  background: #e0ecff;
  color: #2563eb;
}

.warmer-pill {
  background: #fff7ed;
  color: #c2410c;
}

.card-actions {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 7px;
}

button {
  min-width: 0;
  width: 100%;
  padding: 9px 6px;
  border: 0;
  border-radius: 9px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: -0.025em;
  white-space: nowrap;
  transition: background 0.2s ease, transform 0.2s ease;
}

button:hover {
  transform: translateY(-1px);
}

.detail-button {
  background: #1f5f9f;
  color: white;
}

.detail-button:hover {
  background: #174d83;
}

.landscape-button {
  background: rgba(20, 63, 101, 0.09);
  color: #174d83;
}

.landscape-button:hover {
  background: rgba(20, 63, 101, 0.17);
}

@media (max-width: 520px) {
  .card-actions {
    grid-template-columns: 1fr;
  }
}
</style>
