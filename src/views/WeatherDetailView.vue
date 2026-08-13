<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import LiveSun from '../components/weather/LiveSun.vue'
import WeatherVideoBackground from '../components/weather/WeatherVideoBackground.vue'
import { createFallbackWeather, findWeatherLocation } from '../data/weatherMockData'
import {
  getDaylightPalette,
  getWeatherSceneProfile,
  getWeatherVideoGroup,
  getWeatherVideoSources,
} from '../features/weather-scene/index.js'
import { fetchKmaWeather } from '../services/kmaWeather'
import { useTemperature } from '../composables/useTemperature'

const props = defineProps({
  cityId: { type: String, required: true },
})

const router = useRouter()
const location = ref(null)
const weather = ref(null)
const isLoading = ref(true)
const errorMessage = ref('')
const dataNotice = ref('')
const isMetricsOpen = ref(false)
const isSceneExpanded = ref(false)
const currentTime = ref(new Date())
const { displayTemp, unitSymbol } = useTemperature()
let requestVersion = 0

const clockTimer = window.setInterval(() => {
  currentTime.value = new Date()
}, 60_000)

const locationTitle = computed(() => {
  if (!location.value) return '지역을 찾을 수 없습니다'
  return location.value.parentRegionId
    ? `${location.value.parentRegionName} ${location.value.name}`
    : location.value.name
})

function parseKoreaTime(value) {
  if (!value) return null
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}+09:00`
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatTime(value) {
  return value ? value.slice(11, 16) : '—'
}

function formatObservedAt(value) {
  if (!value) return '확인 중'
  return value.replace('T', ' ').slice(0, 16)
}

function formatWindDirection(degrees) {
  const value = Number(degrees)
  if (!Number.isFinite(value)) return '—'
  const directions = ['북', '북동', '동', '남동', '남', '남서', '서', '북서']
  return `${directions[Math.round(value / 45) % 8]}풍`
}

function createSceneState(data) {
  const sunrise = parseKoreaTime(data?.sunrise)
  const sunset = parseKoreaTime(data?.sunset)
  const now = currentTime.value.getTime()

  if (!sunrise || !sunset) {
    return { phase: data?.isDay ? 'midday' : 'night', sunX: 50, sunY: 25, progress: 0.5, message: '태양 위치를 계산하는 중입니다.' }
  }

  const sunriseTime = sunrise.getTime()
  const sunsetTime = sunset.getTime()
  const hour = 60 * 60 * 1000

  if (now < sunriseTime - hour) {
    return { phase: 'night', sunX: 4, sunY: 84, progress: 0, message: `일출은 ${formatTime(data.sunrise)}입니다.` }
  }
  if (now < sunriseTime) {
    const dawnProgress = (now - (sunriseTime - hour)) / hour
    return { phase: 'dawn', sunX: 4 + dawnProgress * 4, sunY: 84 - dawnProgress * 5, progress: 0, message: '곧 해가 뜹니다.' }
  }
  if (now >= sunsetTime + hour) {
    return { phase: 'night', sunX: 96, sunY: 84, progress: 1, message: `오늘 일몰은 ${formatTime(data.sunset)}이었습니다.` }
  }
  if (now >= sunsetTime) {
    const duskProgress = (now - sunsetTime) / hour
    return { phase: 'dusk', sunX: 92 + duskProgress * 4, sunY: 79 + duskProgress * 5, progress: 1, message: '노을이 밤으로 바뀌고 있습니다.' }
  }

  const progress = Math.min(1, Math.max(0, (now - sunriseTime) / (sunsetTime - sunriseTime)))
  const remainingMinutes = Math.max(0, Math.round((sunsetTime - now) / 60_000))
  const hours = Math.floor(remainingMinutes / 60)
  const minutes = remainingMinutes % 60
  const phase = progress < 0.1
    ? 'sunrise'
    : progress < 0.3
      ? 'morning'
      : progress < 0.68
        ? 'midday'
        : progress < 0.84
          ? 'afternoon'
          : 'golden-hour'

  return {
    phase,
    sunX: 8 + progress * 84,
    sunY: 78 - Math.sin(progress * Math.PI) * 58,
    progress,
    message: hours ? `일몰까지 ${hours}시간 ${minutes}분 남았습니다.` : `일몰까지 ${minutes}분 남았습니다.`,
  }
}

const sceneState = computed(() => createSceneState(weather.value))
const sceneProfile = computed(() => getWeatherSceneProfile(weather.value, sceneState.value.phase))
const videoGroup = computed(() => getWeatherVideoGroup(weather.value, sceneState.value.phase))
const videoSources = computed(() => getWeatherVideoSources(videoGroup.value))
const cloudOpacity = computed(() => {
  const cloudCover = Math.min(100, Math.max(0, Number(weather.value?.cloudCover ?? 30)))
  return Math.round((0.035 + ((cloudCover / 100) ** 0.88) * 0.9) * 100) / 100
})
const sunOpacity = computed(() => {
  const cloudCover = Math.min(100, Math.max(0, Number(weather.value?.cloudCover ?? 30)))
  return Math.max(0.03, 1 - cloudCover / 100 * 0.92)
})
const sceneStyle = computed(() => {
  const phase = sceneState.value.phase
  const isNight = ['night', 'dusk'].includes(phase)
  const palette = isNight ? null : getDaylightPalette(sceneState.value.progress)
  const nightColors = phase === 'dusk'
    ? { top: '#171d43', middle: '#684e77', horizon: '#cf7c79' }
    : { top: '#030817', middle: '#0b1c3b', horizon: '#263b5d' }
  const colors = palette ?? nightColors

  return {
    '--detail-sky-top': colors.top,
    '--detail-sky-middle': colors.middle,
    '--detail-sky-horizon': colors.horizon,
  }
})

const sunTimelineStyle = computed(() => {
  const progress = Math.min(1, Math.max(0, sceneState.value.progress))
  return {
    '--day-progress': `${Math.round(progress * 100)}%`,
    '--day-height': `${Math.round(10 + Math.sin(progress * Math.PI) * 70)}px`,
  }
})

const lifeInsights = computed(() => {
  if (!weather.value) return []

  const rainChance = Number(weather.value.rainChance ?? 0)
  const windSpeed = Number(weather.value.windSpeed ?? 0)
  const uvIndex = Number(weather.value.uvIndex ?? 0)
  const rainDescription = rainChance >= 60
    ? '외출할 때 우산을 챙기는 편이 좋습니다.'
    : rainChance >= 30
      ? '접이식 우산이 있으면 안심할 수 있습니다.'
      : '당장 우산이 필요할 가능성은 낮습니다.'
  const windDescription = windSpeed >= 28
    ? '보행할 때 바람이 강하게 느껴질 수 있습니다.'
    : windSpeed >= 15
      ? '가벼운 겉옷이 흔들릴 정도의 바람입니다.'
      : '이동에 큰 불편이 없는 바람입니다.'
  const uvDescription = uvIndex >= 6
    ? '한낮 외출에는 자외선 차단이 필요합니다.'
    : uvIndex >= 3
      ? '장시간 야외 활동이라면 차단제를 권장합니다.'
      : '자외선 부담이 비교적 낮습니다.'

  return [
    { icon: '☂', label: '우산', value: `강수확률 ${rainChance}%`, description: rainDescription, tone: rainChance >= 60 ? 'rain' : 'calm' },
    { icon: '◉', label: '남은 햇빛', value: sceneState.value.message, description: `일몰 예정 시각은 ${formatTime(weather.value.sunset)}입니다.`, tone: 'sun' },
    { icon: '↗', label: '바람', value: `${windSpeed} km/h · ${formatWindDirection(weather.value.windDirection)}`, description: windDescription, tone: windSpeed >= 28 ? 'wind' : 'calm' },
    { icon: 'UV', label: '자외선', value: `지수 ${uvIndex}`, description: uvDescription, tone: uvIndex >= 6 ? 'sun' : 'calm' },
  ]
})

function mapWeatherData(data) {
  return {
    id: data.id,
    name: data.name,
    temp: data.temp,
    feelsLike: data.feelsLike,
    humidity: data.humidity,
    status: data.status,
    cloudCover: data.cloudCover,
    precipitation: data.precipitation,
    precipitationIntensity: data.precipitationIntensity,
    windSpeed: data.windSpeed,
    windDirection: data.windDirection,
    pressure: data.pressureMsl,
    visibility: Math.round(data.visibility / 100) / 10,
    isDay: data.isDay === 1,
    max: data.tempMax,
    min: data.tempMin,
    sunrise: data.sunrise,
    sunset: data.sunset,
    rainChance: data.precipitationProbability,
    uvIndex: data.uvIndexMax,
    weatherCode: data.weatherCode,
    kmaCodes: data.kmaCodes,
    commuteForecast: data.commuteForecast,
    observedAt: data.observationTime,
    source: data.dataSource?.includes('nowcast')
      ? '기상청 초단기실황 + 초단기예보'
      : data.dataSource?.startsWith('kma-')
        ? '기상청 초단기예보'
        : '계절·좌표 기준 기본 데이터',
  }
}

async function loadDetailWeather() {
  const version = ++requestVersion
  isLoading.value = true
  errorMessage.value = ''
  dataNotice.value = ''
  weather.value = null
  location.value = findWeatherLocation(String(props.cityId))

  if (!location.value) {
    errorMessage.value = `“${props.cityId}”에 해당하는 지역이 없습니다.`
    isLoading.value = false
    return
  }

  try {
    const data = await fetchKmaWeather(location.value)
    if (version === requestVersion) weather.value = mapWeatherData(data)
  } catch (error) {
    if (version !== requestVersion) return
    weather.value = mapWeatherData(createFallbackWeather(location.value))
    dataNotice.value = '기상청 응답을 받을 수 없어 계절·좌표 기준 기본 데이터를 표시합니다.'
    console.warn(error.message)
  } finally {
    if (version === requestVersion) isLoading.value = false
  }
}

function goHome() {
  router.push({ name: 'weather-home' })
}

watch(() => props.cityId, loadDetailWeather, { immediate: true })

onBeforeUnmount(() => {
  requestVersion += 1
  window.clearInterval(clockTimer)
})
</script>

<template>
  <main class="detail-page">
    <nav class="detail-nav" aria-label="상세 날씨 탐색">
      <button class="back-button" @click="goHome">← 날씨 홈</button>
      <span v-if="weather">{{ formatObservedAt(weather.observedAt) }} 기준</span>
    </nav>

    <p v-if="isLoading" class="state-message">{{ locationTitle }}의 최신 날씨를 불러오는 중입니다…</p>
    <p v-else-if="errorMessage" class="state-message state-message--error">{{ errorMessage }}</p>

    <template v-else-if="weather">
      <section
        class="weather-hero"
        :class="[{ 'weather-hero--expanded': isSceneExpanded }, `weather-hero--${sceneState.phase}`]"
        :style="sceneStyle"
      >
        <div class="hero-sky" aria-hidden="true">
          <WeatherVideoBackground
            :group="videoGroup"
            :sources="videoSources"
            :opacity="cloudOpacity"
            :weather="weather"
          />
          <LiveSun
            :x="sceneState.sunX"
            :y="sceneState.sunY"
            :opacity="sunOpacity"
            :phase="sceneState.phase"
          />
          <div class="sky-shade"></div>
        </div>

        <div class="hero-content">
          <div class="hero-heading">
            <p class="eyebrow">{{ sceneProfile.icon }} {{ sceneProfile.label }}</p>
            <h1>{{ locationTitle }}</h1>
            <p>{{ sceneState.message }}</p>
          </div>

          <div class="hero-temperature">
            <strong>{{ displayTemp(weather.temp) }}<small>{{ unitSymbol }}</small></strong>
            <div>
              <b>{{ weather.status }}</b>
              <span>체감 {{ displayTemp(weather.feelsLike) }}{{ unitSymbol }}</span>
              <span>최고 {{ displayTemp(weather.max) }}{{ unitSymbol }} · 최저 {{ displayTemp(weather.min) }}{{ unitSymbol }}</span>
            </div>
          </div>

          <button class="scene-toggle" @click="isSceneExpanded = !isSceneExpanded">
            {{ isSceneExpanded ? '정보와 함께 보기' : '하늘 크게 보기' }}
          </button>
        </div>
      </section>

      <p v-if="dataNotice" class="data-notice">{{ dataNotice }}</p>

      <section class="detail-layout">
        <div class="main-column">
          <section class="content-section insight-section">
            <div class="section-heading">
              <div>
                <p>AT A GLANCE</p>
                <h2>오늘 생활에 필요한 해석</h2>
              </div>
              <span>숫자를 일상 언어로 바꿨어요</span>
            </div>

            <div class="insight-grid">
              <article v-for="insight in lifeInsights" :key="insight.label" :class="`insight-card--${insight.tone}`">
                <span class="insight-icon">{{ insight.icon }}</span>
                <div>
                  <small>{{ insight.label }}</small>
                  <strong>{{ insight.value }}</strong>
                  <p>{{ insight.description }}</p>
                </div>
              </article>
            </div>
          </section>

          <section class="content-section observation-section">
            <button
              class="observation-toggle"
              :aria-expanded="isMetricsOpen"
              aria-controls="observation-metrics"
              @click="isMetricsOpen = !isMetricsOpen"
            >
              <span>
                <small>OBSERVATION</small>
                <strong>상세 관측값 {{ isMetricsOpen ? '접기' : '보기' }}</strong>
              </span>
              <b>{{ isMetricsOpen ? '−' : '+' }}</b>
            </button>

            <div v-show="isMetricsOpen" id="observation-metrics" class="metric-grid">
              <article><span>습도</span><strong>{{ weather.humidity }}%</strong></article>
              <article><span>구름량</span><strong>{{ weather.cloudCover }}%</strong></article>
              <article><span>시간당 강수량</span><strong>{{ weather.precipitation }} mm</strong></article>
              <article><span>가시거리</span><strong>{{ weather.visibility }} km</strong></article>
              <article><span>해면 기압</span><strong>{{ weather.pressure }} hPa</strong></article>
              <article><span>풍향</span><strong>{{ formatWindDirection(weather.windDirection) }} · {{ weather.windDirection }}°</strong></article>
            </div>
          </section>
        </div>

        <aside class="sun-card">
          <div class="section-heading section-heading--sun">
            <div>
              <p>DAYLIGHT</p>
              <h2>오늘의 태양</h2>
            </div>
          </div>

          <div class="sun-arc" :style="sunTimelineStyle" aria-hidden="true">
            <div class="sun-arc-line"></div>
            <span class="sun-dot"></span>
          </div>

          <div class="sun-times">
            <div><span>일출</span><strong>{{ formatTime(weather.sunrise) }}</strong></div>
            <div class="sun-now"><span>현재</span><strong>{{ sceneState.message }}</strong></div>
            <div><span>일몰</span><strong>{{ formatTime(weather.sunset) }}</strong></div>
          </div>

          <p class="scene-detail">{{ sceneProfile.detail }}</p>

          <div class="source-note">
            <span>데이터 기준 {{ formatObservedAt(weather.observedAt) }}</span>
            <strong>{{ weather.source }}</strong>
          </div>
        </aside>
      </section>
    </template>
  </main>
</template>

<style scoped>
:global(body) {
  margin: 0;
  background: #edf3f7;
}

.detail-page {
  width: min(1440px, calc(100% - 48px));
  min-height: 100vh;
  margin: 0 auto;
  padding: 24px 0 72px;
  color: #102a43;
}

.detail-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
  margin-bottom: 14px;
}

.detail-nav > span {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.back-button,
.scene-toggle,
.observation-toggle {
  border: 0;
  cursor: pointer;
  font: inherit;
}

.back-button {
  padding: 10px 15px;
  border: 1px solid rgba(30, 64, 175, 0.13);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.82);
  color: #174d83;
  font-size: 13px;
  font-weight: 850;
  backdrop-filter: blur(14px);
}

.state-message,
.data-notice {
  border-radius: 18px;
  background: white;
  box-shadow: 0 14px 38px rgba(30, 51, 75, 0.08);
}

.state-message {
  padding: 36px;
}

.state-message--error {
  color: #b91c1c;
}

.weather-hero {
  position: relative;
  min-height: 500px;
  overflow: hidden;
  border-radius: 32px;
  background: linear-gradient(180deg, var(--detail-sky-top), var(--detail-sky-middle) 56%, var(--detail-sky-horizon));
  box-shadow: 0 28px 80px rgba(25, 59, 91, 0.2);
  transition: min-height 0.7s cubic-bezier(.2, .75, .2, 1), border-radius 0.5s ease;
}

.weather-hero--expanded {
  min-height: min(820px, calc(100vh - 80px));
}

.hero-sky,
.sky-shade {
  position: absolute;
  inset: 0;
}

.hero-sky {
  overflow: hidden;
}

.hero-sky::before {
  position: absolute;
  z-index: 4;
  inset: -10%;
  background: radial-gradient(circle at 50% 26%, rgba(255, 255, 255, 0.18), transparent 35%);
  content: '';
  mix-blend-mode: screen;
  pointer-events: none;
}

.sky-shade {
  z-index: 6;
  background:
    linear-gradient(90deg, rgba(5, 22, 42, 0.4), rgba(5, 22, 42, 0.05) 58%, rgba(5, 22, 42, 0.16)),
    linear-gradient(0deg, rgba(2, 12, 27, 0.32), transparent 55%);
}

.weather-hero--night .sky-shade,
.weather-hero--dusk .sky-shade {
  background: linear-gradient(90deg, rgba(1, 8, 22, 0.68), rgba(4, 12, 29, 0.18) 62%, rgba(2, 8, 20, 0.42));
}

.hero-content {
  position: relative;
  z-index: 8;
  display: grid;
  align-content: space-between;
  min-height: 500px;
  box-sizing: border-box;
  padding: clamp(30px, 5vw, 68px);
  color: white;
  transition: min-height 0.7s cubic-bezier(.2, .75, .2, 1);
}

.weather-hero--expanded .hero-content {
  min-height: min(820px, calc(100vh - 80px));
}

.hero-heading {
  max-width: 680px;
}

.eyebrow,
.section-heading p {
  margin: 0 0 9px;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.16em;
}

.eyebrow {
  color: rgba(255, 255, 255, 0.78);
}

.hero-heading h1 {
  margin: 0;
  font-size: clamp(38px, 5vw, 72px);
  letter-spacing: -0.065em;
  text-shadow: 0 3px 22px rgba(0, 0, 0, 0.22);
}

.hero-heading > p:last-child {
  margin: 12px 0 0;
  color: rgba(255, 255, 255, 0.86);
  font-weight: 700;
}

.hero-temperature {
  display: flex;
  align-items: flex-end;
  gap: 26px;
  margin-top: 70px;
}

.hero-temperature > strong {
  font-size: clamp(82px, 11vw, 154px);
  font-weight: 300;
  line-height: 0.78;
  letter-spacing: -0.1em;
  text-shadow: 0 5px 26px rgba(0, 0, 0, 0.24);
}

.hero-temperature > strong small {
  margin-left: 8px;
  font-size: 0.25em;
  font-weight: 700;
  letter-spacing: 0;
}

.hero-temperature > div {
  display: grid;
  gap: 5px;
  padding-bottom: 2px;
}

.hero-temperature b {
  font-size: 20px;
}

.hero-temperature span {
  color: rgba(255, 255, 255, 0.78);
  font-size: 13px;
  font-weight: 650;
}

.scene-toggle {
  position: absolute;
  right: clamp(24px, 4vw, 56px);
  bottom: clamp(24px, 4vw, 50px);
  padding: 11px 15px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  background: rgba(4, 19, 37, 0.3);
  color: white;
  font-size: 12px;
  font-weight: 850;
  backdrop-filter: blur(16px);
}

.data-notice {
  margin: 18px 0 0;
  padding: 12px 15px;
  color: #9a4d0a;
  font-size: 13px;
}

.detail-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(320px, 0.75fr);
  align-items: start;
  gap: 18px;
  margin-top: 18px;
}

.main-column {
  display: grid;
  gap: 18px;
}

.content-section,
.sun-card {
  border: 1px solid rgba(123, 157, 184, 0.14);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 15px 42px rgba(39, 69, 96, 0.08);
  backdrop-filter: blur(20px);
}

.content-section {
  padding: clamp(22px, 3vw, 34px);
}

.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 22px;
}

.section-heading p {
  color: #5281a8;
}

.section-heading h2 {
  margin: 0;
  color: #102f4d;
  font-size: clamp(21px, 2.3vw, 30px);
  letter-spacing: -0.045em;
}

.section-heading > span {
  color: #7890a3;
  font-size: 12px;
}

.insight-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 11px;
}

.insight-grid article {
  display: grid;
  grid-template-columns: 38px 1fr;
  gap: 12px;
  min-height: 118px;
  padding: 18px;
  border: 1px solid #e2eaf0;
  border-radius: 18px;
  background: #f7fafc;
}

.insight-card--rain { background: linear-gradient(135deg, #edf7ff, #f7fbff) !important; }
.insight-card--sun { background: linear-gradient(135deg, #fff9ec, #fffdf7) !important; }
.insight-card--wind { background: linear-gradient(135deg, #eef8f8, #f8fbfb) !important; }

.insight-icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 12px;
  background: white;
  color: #285e8c;
  box-shadow: 0 7px 18px rgba(48, 82, 110, 0.08);
  font-size: 14px;
  font-weight: 900;
}

.insight-grid article > div {
  display: grid;
  align-content: start;
  gap: 5px;
}

.insight-grid small {
  color: #7890a3;
  font-size: 11px;
  font-weight: 800;
}

.insight-grid strong {
  color: #173c5f;
  font-size: 15px;
}

.insight-grid p {
  margin: 2px 0 0;
  color: #61798e;
  font-size: 12px;
  line-height: 1.55;
}

.observation-section {
  padding: 0;
  overflow: hidden;
}

.observation-toggle {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  padding: 22px 26px;
  background: transparent;
  color: #153b5e;
  text-align: left;
}

.observation-toggle > span {
  display: grid;
  gap: 4px;
}

.observation-toggle small {
  color: #5281a8;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.15em;
}

.observation-toggle b {
  font-size: 25px;
  font-weight: 400;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  border-top: 1px solid #e4ebf0;
  background: #e4ebf0;
}

.metric-grid article {
  display: grid;
  gap: 8px;
  padding: 19px 22px;
  background: rgba(255, 255, 255, 0.96);
}

.metric-grid span,
.sun-times span {
  color: #7890a3;
  font-size: 11px;
  font-weight: 750;
}

.metric-grid strong {
  color: #173c5f;
  font-size: 14px;
}

.sun-card {
  position: sticky;
  top: 18px;
  padding: 28px;
  overflow: hidden;
}

.section-heading--sun {
  margin-bottom: 12px;
}

.sun-arc {
  position: relative;
  height: 120px;
  margin: 8px 0 0;
  overflow: hidden;
}

.sun-arc-line {
  position: absolute;
  width: 160%;
  height: 190px;
  bottom: -122px;
  left: -30%;
  border: 1px dashed #a9bfd0;
  border-radius: 50%;
}

.sun-dot {
  position: absolute;
  width: 15px;
  height: 15px;
  left: clamp(7px, var(--day-progress), calc(100% - 22px));
  bottom: var(--day-height);
  border: 4px solid rgba(255, 255, 255, 0.8);
  border-radius: 50%;
  background: #ffb32e;
  box-shadow: 0 0 24px rgba(255, 174, 42, 0.7);
  transform: translateX(-50%);
}

.sun-times {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  padding-top: 15px;
  border-top: 1px solid #e3ebf1;
}

.sun-times > div {
  display: grid;
  gap: 5px;
}

.sun-times > div:last-child {
  text-align: right;
}

.sun-times strong {
  color: #173c5f;
  font-size: 14px;
}

.sun-now {
  min-width: 0;
  text-align: center;
}

.sun-now strong {
  overflow: hidden;
  color: #b66a10;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scene-detail {
  margin: 22px 0;
  padding: 15px;
  border-radius: 14px;
  background: #f5f9fc;
  color: #5d7488;
  font-size: 12px;
  line-height: 1.6;
}

.source-note {
  display: grid;
  gap: 5px;
  padding-top: 18px;
  border-top: 1px solid #e3ebf1;
}

.source-note span {
  color: #7890a3;
  font-size: 10px;
}

.source-note strong {
  color: #365a77;
  font-size: 11px;
}

@media (max-width: 980px) {
  .detail-layout {
    grid-template-columns: 1fr;
  }

  .sun-card {
    position: static;
  }
}

@media (max-width: 680px) {
  .detail-page {
    width: min(100% - 24px, 1440px);
    padding-top: 12px;
  }

  .detail-nav > span {
    display: none;
  }

  .weather-hero {
    min-height: 540px;
    border-radius: 24px;
  }

  .hero-content {
    min-height: 540px;
    padding: 28px 24px;
  }

  .hero-temperature {
    align-items: flex-start;
    flex-direction: column;
    gap: 20px;
    margin: 70px 0 58px;
  }

  .scene-toggle {
    right: 20px;
    bottom: 20px;
  }

  .section-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .section-heading > span {
    display: none;
  }

  .insight-grid,
  .metric-grid {
    grid-template-columns: 1fr;
  }

  .content-section,
  .sun-card {
    border-radius: 20px;
  }
}
</style>
