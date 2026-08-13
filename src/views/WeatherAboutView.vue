<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import LiveSun from '../components/weather/LiveSun.vue'
import WeatherVideoBackground from '../components/weather/WeatherVideoBackground.vue'
import { getDaylightPalette, getWeatherVideoGroup, WEATHER_VIDEO_GROUPS } from '../features/weather-scene/index.js'
import { fetchKmaWeather } from '../services/kmaWeather'
import { useTemperature } from '../composables/useTemperature'

const SEOUL = {
  id: 'seoul-preview',
  name: '서울특별시',
  city: '서울',
  latitude: 37.5665,
  longitude: 126.978,
}

const previewProgress = ref(0)
const nextSection = ref(null)
const seoulWeather = ref({
  ...SEOUL,
  temp: 28,
  status: '현재 날씨 연결 중',
  humidity: 52,
  cloudCover: 42,
  precipitation: 0,
  windSpeed: 8,
  sunrise: '2026-08-12T05:46',
  sunset: '2026-08-12T19:27',
  weatherCode: 2,
})
const { displayTemp, unitSymbol } = useTemperature()
let previewFrameId
let previewCycleStartedAt
let previewScrollTimer
let userInterruptedPreview = false

function getTimeMinutes(value, fallback) {
  const match = String(value ?? '').match(/T?(\d{2}):(\d{2})/)
  return match ? Number(match[1]) * 60 + Number(match[2]) : fallback
}

const previewScene = computed(() => {
  const sunrise = getTimeMinutes(seoulWeather.value.sunrise, 5 * 60 + 45)
  const sunset = getTimeMinutes(seoulWeather.value.sunset, 19 * 60 + 25)
  const progress = previewProgress.value
  const demoMinutes = sunrise + (sunset - sunrise) * progress
  const phase = progress < 0.12
    ? 'sunrise'
    : progress > 0.84
      ? 'golden-hour'
      : progress < 0.38
        ? 'morning'
        : progress < 0.68
          ? 'midday'
          : 'afternoon'

  return {
    phase,
    progress,
    demoMinutes,
    sunX: 8 + progress * 84,
    sunY: 77 - Math.sin(progress * Math.PI) * 58,
    darkness: Math.max(0.02, 0.39 - Math.sin(progress * Math.PI) * 0.37),
  }
})

const previewClock = computed(() => {
  const hours = Math.floor(previewScene.value.demoMinutes / 60)
  const minutes = Math.floor(previewScene.value.demoMinutes % 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
})

// 12초 소개 장면에서는 실제 최저·최고기온과 현재 관측값을 기준으로
// 일출부터 일몰까지의 변화를 부드럽게 보간해 데이터도 함께 흐르게 합니다.
const previewDemoWeather = computed(() => {
  const progress = previewScene.value.progress
  const daylightCurve = Math.sin(progress * Math.PI)
  const baseTemp = Number(seoulWeather.value.temp ?? 20)
  const minTemp = Number(seoulWeather.value.tempMin ?? baseTemp - 4)
  const maxTemp = Number(seoulWeather.value.tempMax ?? baseTemp + 3)
  const baseHumidity = Number(seoulWeather.value.humidity ?? 55)
  const baseCloudCover = Number(seoulWeather.value.cloudCover ?? 35)
  const baseWindSpeed = Number(seoulWeather.value.windSpeed ?? 8)
  const basePrecipitation = Number(seoulWeather.value.precipitation ?? 0)

  return {
    temp: Math.round((minTemp + (maxTemp - minTemp) * daylightCurve) * 10) / 10,
    humidity: Math.round(Math.min(100, Math.max(20, baseHumidity + (0.5 - daylightCurve) * 16))),
    cloudCover: Math.round(Math.min(100, Math.max(0, baseCloudCover + Math.sin(progress * Math.PI * 2) * 6))),
    windSpeed: Math.round(Math.max(0, baseWindSpeed * (0.78 + daylightCurve * 0.34)) * 10) / 10,
    precipitation: Math.round(Math.max(0, basePrecipitation * (0.88 + Math.sin(progress * Math.PI * 2) * 0.12)) * 10) / 10,
  }
})

const previewStatusLabel = computed(() => {
  const lightLabel = ({
    sunrise: '아침빛',
    morning: '오전빛',
    midday: '한낮',
    afternoon: '오후빛',
    'golden-hour': '노을빛',
  })[previewScene.value.phase]

  return `${seoulWeather.value.status} · ${lightLabel}`
})

const previewWorkday = computed(() => {
  const nowMinutes = previewScene.value.demoMinutes
  const endMinutes = 18 * 60
  const remaining = Math.round(endMinutes - nowMinutes)

  if (remaining <= 0) return { value: '퇴근 시간이에요', detail: '일몰 전 남은 빛을 확인해요' }

  const hours = Math.floor(remaining / 60)
  const minutes = remaining % 60
  return {
    value: `${hours}시간 ${minutes}분`,
    detail: '18:00 퇴근 기준 남은 시간',
  }
})

const previewCommute = computed(() => {
  const commuteWeather = seoulWeather.value.commuteForecast ?? seoulWeather.value
  const precipitation = Number(commuteWeather.precipitation ?? 0)
  const status = commuteWeather.status ?? seoulWeather.value.status
  const windSpeed = Number(commuteWeather.windSpeed ?? 0)
  const needsUmbrella = precipitation > 0 || /비|눈|소나기/.test(status)

  return {
    value: needsUmbrella ? '우산을 챙겨요' : '우산 없이 무난',
    detail: windSpeed >= 25 ? '강한 바람도 함께 확인하세요' : `풍속 ${windSpeed} km/h · ${status}`,
  }
})

const previewSunsetGuide = computed(() => {
  const sunset = getTimeMinutes(seoulWeather.value.sunset, 19 * 60 + 25)
  const remaining = Math.max(0, Math.round(sunset - previewScene.value.demoMinutes))
  const hours = Math.floor(remaining / 60)
  const minutes = remaining % 60
  const value = remaining > 0
    ? hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`
    : '일몰 도착'

  return {
    value,
    detail: remaining > 0 ? `현재 장면에서 일몰까지 · ${previewClock.value}` : `오늘의 태양 이동이 끝났어요`,
  }
})

const previewNarrative = computed(() => {
  const weather = previewDemoWeather.value

  return ({
    sunrise: `해가 떠오르며 기온이 ${weather.temp}°C로 천천히 오르고 있어요.`,
    morning: `구름 ${weather.cloudCover}% 사이로 선명한 오전빛이 들어옵니다.`,
    midday: `태양이 가장 높은 시간, 풍속 ${weather.windSpeed} km/h의 한낮이에요.`,
    afternoon: `퇴근까지 ${previewWorkday.value.value}, 오후의 빛이 천천히 낮아집니다.`,
    'golden-hour': `일몰까지 ${previewSunsetGuide.value.value}, 하늘이 노을빛으로 바뀌고 있어요.`,
  })[previewScene.value.phase]
})

const previewPalette = computed(() => getDaylightPalette(previewScene.value.progress))
const previewVideoGroup = computed(() => getWeatherVideoGroup(seoulWeather.value, 'midday'))
const previewVideoSources = computed(() => WEATHER_VIDEO_GROUPS[previewVideoGroup.value] ?? WEATHER_VIDEO_GROUPS['partly-cloudy-day'])
const previewSunOpacity = computed(() => {
  const cloudCover = Math.min(100, Math.max(0, Number(seoulWeather.value.cloudCover ?? 30)))
  const obscuredWeather = [3, 45, 48, 55, 57, 63, 65, 66, 67, 73, 75, 82, 86, 95, 96, 99]
    .includes(Number(seoulWeather.value.weatherCode))
  const calculatedOpacity = Math.max(.015, 1 - cloudCover / 100 * .92)
  return obscuredWeather ? Math.min(.08, calculatedOpacity) : calculatedOpacity
})
const previewStyle = computed(() => ({
  '--preview-sun-x': `${previewScene.value.sunX}%`,
  '--preview-sun-y': `${previewScene.value.sunY}%`,
  '--preview-darkness': previewScene.value.darkness,
  '--preview-cloud-opacity': Math.min(0.62, 0.08 + Number(seoulWeather.value.cloudCover ?? 30) / 145),
  '--preview-sky-top': previewPalette.value.top,
  '--preview-sky-middle': previewPalette.value.middle,
  '--preview-sky-horizon': previewPalette.value.horizon,
  '--preview-warmth': previewPalette.value.warmth,
}))

function animatePreviewCycle(timestamp) {
  if (!previewCycleStartedAt) previewCycleStartedAt = timestamp
  const elapsed = timestamp - previewCycleStartedAt
  previewProgress.value = Math.min(1, elapsed / 12_000)

  if (elapsed < 12_000) {
    previewFrameId = window.requestAnimationFrame(animatePreviewCycle)
    return
  }

  // 한 사이클을 모두 본 뒤, 사용자가 직접 탐색 중이 아닐 때만 다음 이야기로 이동합니다.
  previewScrollTimer = window.setTimeout(() => {
    const heroStillVisible = window.scrollY < window.innerHeight * 0.55
    if (!userInterruptedPreview && heroStillVisible) {
      nextSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, 650)
}

function markPreviewInteraction() {
  userInterruptedPreview = true
}

onMounted(async () => {
  previewFrameId = window.requestAnimationFrame(animatePreviewCycle)
  window.addEventListener('wheel', markPreviewInteraction, { passive: true, once: true })
  window.addEventListener('touchstart', markPreviewInteraction, { passive: true, once: true })

  try {
    seoulWeather.value = await fetchKmaWeather(SEOUL)
  } catch (error) {
    console.warn('서울 소개 미리보기 데이터를 불러오지 못했습니다.', error.message)
  }
})

onBeforeUnmount(() => {
  window.cancelAnimationFrame(previewFrameId)
  window.clearTimeout(previewScrollTimer)
  window.removeEventListener('wheel', markPreviewInteraction)
  window.removeEventListener('touchstart', markPreviewInteraction)
})
</script>

<template>
  <main class="about-page">
    <section class="about-hero">
      <div class="hero-copy">
        <p class="eyebrow">REAL-TIME DIGITAL WINDOW</p>
        <h1><span>창문이 없는 공간에도</span><span>지금의 하늘을.</span></h1>
        <p class="lead">
          SKY NOW는 기상청 날씨와 천문 데이터를 빛, 구름, 태양 위치와 강수 효과로 번역해
          선택한 지역의 바깥 풍경을 실시간처럼 보여주는 디지털 창문 서비스입니다.
        </p>
        <div class="hero-actions">
          <RouterLink class="primary-action" to="/weather">지금 날씨 시작하기</RouterLink>
          <RouterLink class="secondary-action" to="/scene-guide">디지털 창문 알아보기</RouterLink>
        </div>
      </div>

      <div class="weather-preview" :class="`weather-preview--${previewScene.phase}`" :style="previewStyle"
        aria-label="서울특별시 일출부터 일몰까지의 디지털 창문 소개 영상">
        <div class="preview-sky-gradient"></div>
        <WeatherVideoBackground class="preview-cloud-video" :group="previewVideoGroup" :sources="previewVideoSources"
          :opacity="Number.parseFloat(previewStyle['--preview-cloud-opacity'])" :weather="seoulWeather" />
        <div class="preview-stars"></div>
        <LiveSun :x="previewScene.sunX" :y="previewScene.sunY" :opacity="previewSunOpacity"
          :phase="previewScene.phase" />
        <div class="preview-atmosphere"></div>
        <div class="preview-horizon"><i></i><i></i><i></i><i></i><i></i><i></i></div>

        <header class="preview-topbar">
          <span class="preview-live"><i></i> DAYLIGHT DATA PREVIEW</span>
          <time>{{ previewClock }} KST</time>
        </header>

        <div class="preview-info">
          <div class="preview-location">
            <span>서울특별시 · 디지털 창문</span>
          </div>

          <div class="preview-current">
            <strong>{{ displayTemp(previewDemoWeather.temp) }}<small>{{ unitSymbol }}</small></strong>
            <div>
              <p>{{ previewStatusLabel }}</p>
              <small>{{ previewNarrative }}</small>
            </div>
          </div>

          <div class="preview-metrics">
            <i>구름 {{ previewDemoWeather.cloudCover }}%</i>
            <i>습도 {{ previewDemoWeather.humidity }}%</i>
            <i>풍속 {{ previewDemoWeather.windSpeed }} km/h</i>
            <i>강수 {{ previewDemoWeather.precipitation }} mm</i>
          </div>

          <div class="preview-service-grid" aria-label="디지털 창문에서 제공하는 정보">
            <article>
              <span>퇴근까지</span>
              <strong>{{ previewWorkday.value }}</strong>
              <small>{{ previewWorkday.detail }}</small>
            </article>
            <article>
              <span>18시 퇴근길</span>
              <strong>{{ previewCommute.value }}</strong>
              <small>{{ previewCommute.detail }}</small>
            </article>
            <article>
              <span>남은 햇빛</span>
              <strong>{{ previewSunsetGuide.value }}</strong>
              <small>{{ previewSunsetGuide.detail }}</small>
            </article>
          </div>
        </div>

        <div class="preview-timeline" aria-label="일출부터 일몰까지의 소개 영상 진행률">
          <span>일출 {{ String(seoulWeather.sunrise ?? '').slice(11, 16) }}</span>
          <div><i :style="{ left: `${previewScene.progress * 100}%` }"></i></div>
          <span>일몰 {{ String(seoulWeather.sunset ?? '').slice(11, 16) }}</span>
        </div>
      </div>
    </section>

    <section ref="nextSection" class="benchmark-section content-section">
      <div class="section-heading">
        <p>DESIGN BENCHMARK</p>
        <h2>아이폰 날씨 앱의 직관적인 정보 경험을 벤치마킹했습니다.</h2>
      </div>
      <div class="feature-grid">
        <article>
          <span>01</span>
          <strong>한눈에 읽는 정보 위계</strong>
          <p>현재 기온과 날씨를 크게 보여주고, 습도·강수·풍속 등의 정보는 카드 단위로 정리했습니다.</p>
        </article>
        <article>
          <span>02</span>
          <strong>지역 중심 탐색</strong>
          <p>전국 지도와 지역 검색을 연결해 광역시·도부터 시·군·구까지 단계적으로 살펴볼 수 있습니다.</p>
        </article>
        <article>
          <span>03</span>
          <strong>업무 공간에 여는 디지털 창문</strong>
          <p>현재 날씨와 시간의 흐름을 배경처럼 바라보다가 퇴근 시각, 우산, 바람과 일몰 여유를 필요한 순간에 확인합니다.</p>
        </article>
      </div>
    </section>

    <section class="commute-value-section content-section">
      <div class="section-heading">
        <p>WAY HOME EXPERIENCE</p>
        <h2>퇴근을 기다리는 시간부터 집으로 향하는 순간까지.</h2>
        <span>디지털 창문은 창문이 없는 업무 공간에서도 바깥의 빛, 날씨와 하루의 흐름을 자연스럽게 느끼게 하는 일상형 도구입니다.</span>
      </div>
      <div class="commute-value-grid">
        <article>
          <span>NOW · 퇴근 준비</span>
          <strong>18시 날씨를 먼저 확인</strong>
          <p>기상청 예보로 우산 여부, 바람과 귀가길 체감을 묶어 보여줍니다.</p>
        </article>
        <article>
          <span>NOW · 남은 햇빛</span>
          <strong>해가 떠 있을 때 퇴근할 수 있을까?</strong>
          <p>퇴근 시각과 일몰을 비교해 집으로 가는 동안 남아 있는 밝은 시간을 알려줍니다.</p>
        </article>
        <article class="is-planned">
          <span>NEXT · 경로 기반 안내</span>
          <strong>출발지부터 도착지까지</strong>
          <p>향후 이동 경로의 시간대별 비구름과 대중교통 지연 정보를 연결해 실제 퇴근길 판단으로 확장합니다.</p>
        </article>
      </div>
    </section>

    <section class="engine-section content-section">
      <div class="section-heading section-heading--light">
        <p>SCENE ENGINE</p>
        <h2>현재 기상 데이터를 화면의 분위기로 변환합니다.</h2>
        <span>API의 숫자를 그대로 나열하지 않고 사용자가 바로 느낄 수 있는 시각 요소로 계산합니다.</span>
      </div>
      <div class="engine-flow">
        <article><small>INPUT</small><strong>날씨 데이터</strong>
          <p>현재 시각 · 일출/일몰<br />구름량 · 강수 · 풍속</p>
        </article>
        <i>→</i>
        <article><small>COMPUTED</small><strong>풍경 계산</strong>
          <p>낮/밤 단계 · 태양 높이<br />밝기 · 구름 농도</p>
        </article>
        <i>→</i>
        <article><small>OUTPUT</small><strong>디지털 창문 장면</strong>
          <p>영상 소스 · 색온도<br />태양 위치 · 날씨 효과</p>
        </article>
      </div>
    </section>

    <section class="api-section content-section">
      <div class="section-heading">
        <p>DATA SOURCES</p>
        <h2>디지털 창문은 실제 날씨·천문·위치·지도 데이터를 조합합니다.</h2>
        <span>외부 데이터는 API 계층에서 요청하고 서비스 계층에서 화면용 데이터로 변환한 뒤, 지도·상세 날씨와 디지털 창문이 같은 값을 공유합니다.</span>
      </div>
      <div class="kma-api-summary">
        <div>
          <span>SECURE DATA FLOW</span>
          <strong>인증키를 화면에 노출하지 않는 API 구조</strong>
          <p>Vue 화면 → 앱 프록시 → 공공데이터 API → 서비스 변환 → 디지털 창문</p>
        </div>
        <ul>
          <li><b>날씨</b><span>기상청 JSON · 초단기실황 + 초단기예보</span></li>
          <li><b>태양</b><span>한국천문연구원 XML · 일출 + 일몰 + 박명</span></li>
          <li><b>인증키</b><span><code>.env.local</code> 또는 배포 환경변수에서 서버만 읽음</span></li>
          <li><b>프록시</b><span>개발 Vite · 운영 Node가 같은 <code>weatherProxy</code> 사용</span></li>
          <li><b>캐시</b><span><code>useWeatherCache</code> 10분 · 출몰시각은 날짜·대표 지역 단위 재사용</span></li>
        </ul>
      </div>

      <div class="api-usage-board">
        <article>
          <span>01 · KMA WEATHER</span>
          <strong>기상청 단기예보 조회서비스 2.0</strong>
          <div class="field-tags">
            <i><b>T1H</b> 기온</i><i><b>REH</b> 습도</i><i><b>SKY</b> 하늘 상태</i>
            <i><b>PTY</b> 강수 형태</i><i><b>RN1</b> 1시간 강수량</i><i><b>WSD</b> 풍속</i><i><b>VEC</b> 풍향</i>
          </div>
        </article>
        <article>
          <span>02 · KASI SUN</span>
          <strong>한국천문연구원 출몰시각 정보</strong>
          <div class="field-tags">
            <i><b>sunrise</b> 일출</i><i><b>sunset</b> 일몰</i>
            <i><b>civilm</b> 아침 시민박명</i><i><b>civile</b> 저녁 시민박명</i>
            <i><b>suntransit</b> 태양 남중</i>
          </div>
        </article>
        <article>
          <span>03 · DIGITAL WINDOW</span>
          <strong>데이터가 사용되는 화면</strong>
          <ul>
            <li><b>날씨 홈</b><small>지역 카드 · 전국 평균 · 지도 핀</small></li>
            <li><b>상세 화면</b><small>기온 · 습도 · 강수 · 바람 · 일출/일몰</small></li>
            <li><b>디지털 창문</b><small>영상 · 밝기 · 태양 위치 · 날씨 효과 · 멘트</small></li>
          </ul>
        </article>
      </div>

      <div class="api-grid">
        <article><span>WEATHER API</span><strong>기상청 초단기실황·예보</strong>
          <p><code>getUltraSrtNcst</code>와 <code>getUltraSrtFcst</code>를 결합해 현재에 가까운 날씨를 구성합니다.</p>
        </article>
        <article><span>ASTRONOMY API</span><strong>한국천문연구원 출몰시각</strong>
          <p><code>getAreaRiseSetInfo</code> 응답으로 지역별 일출·일몰과 박명 시간을 적용합니다.</p>
        </article>
        <article><span>LOCATION</span><strong>Browser Geolocation</strong>
          <p>허용된 좌표를 프로젝트의 시·군·구 중심 좌표와 비교해 가장 가까운 지역명과 날씨를 표시합니다.</p>
        </article>
        <article><span>MAP</span><strong>OpenStreetMap + Leaflet</strong>
          <p>대한민국 지역 좌표와 전국 평균 기준 상대 기온 핀을 지도에서 탐색합니다.</p>
        </article>
      </div>
    </section>

    <section class="structure-section content-section">
      <div class="section-heading">
        <p>VUE PROJECT STRUCTURE</p>
        <h2>화면부터 데이터 처리와 운영 서버까지 역할별로 분리했습니다.</h2>
        <span>현재 제출 구조를 기준으로 정리했습니다. Vue 화면은 외부 API 주소나 인증키를 알지 않고 정규화된 날씨 객체만 전달받습니다.</span>
      </div>
      <div class="structure-board">
        <div class="root-node">
          <div><i></i><b>sky-now/</b></div>
          <span>Vue 애플리케이션과 운영 서버를 역할별로 분리한 구조</span>
        </div>

        <div class="structure-layers">
          <section class="structure-layer">
            <header class="layer-heading">
              <span>01</span>
              <div><strong>화면과 인터페이스</strong><small>사용자가 보고 조작하는 Vue UI</small></div>
            </header>
            <div class="folder-columns">
              <article class="folder-card">
                <header><span>ROUTE PAGE</span><strong>src/views/</strong></header>
                <ul>
                  <li><b>WeatherAboutView</b><small>서비스 첫 화면</small></li>
                  <li><b>WeatherHomeView</b><small>날씨 대시보드</small></li>
                  <li><b>WeatherDetailView</b><small>지역 상세 페이지</small></li>
                  <li><b>SceneGuide · 404</b><small>안내와 예외 화면</small></li>
                </ul>
              </article>

              <article class="folder-card">
                <header><span>SHARED UI</span><strong>components/common/</strong></header>
                <ul>
                  <li><b>BaseDashboardCard</b><small>슬롯 기반 공통 카드</small></li>
                  <li><b>UnitToggle</b><small>전역 온도 단위 설정</small></li>
                </ul>
              </article>

              <article class="folder-card">
                <header><span>WEATHER UI</span><strong>components/weather/</strong></header>
                <ul>
                  <li><b>WeatherHome</b><small>홈 화면과 스타일</small></li>
                  <li><b>Map · Card · Search</b><small>지역 탐색 기능</small></li>
                  <li><b>LiveSun · Video</b><small>디지털 창문 표현</small></li>
                  <li><b>scene/</b><small>비·눈 Canvas 효과</small></li>
                </ul>
              </article>
            </div>
          </section>

          <section class="structure-layer">
            <header class="layer-heading">
              <span>02</span>
              <div><strong>상태와 데이터 처리</strong><small>공유 상태, 외부 데이터와 장면 계산</small></div>
            </header>
            <div class="folder-columns">
              <article class="folder-card">
                <header><span>SHARED LOGIC</span><strong>stores/ · composables/</strong></header>
                <ul>
                  <li><b>configStore</b><small>단위 · 보기 모드</small></li>
                  <li><b>useTemperature</b><small>온도 변환</small></li>
                  <li><b>useWeatherCache</b><small>10분 날씨 캐시</small></li>
                </ul>
              </article>

              <article class="folder-card">
                <header><span>EXTERNAL DATA</span><strong>api/ · services/</strong></header>
                <ul>
                  <li><b>httpClient · APIs</b><small>JSON · XML 요청</small></li>
                  <li><b>kmaWeather</b><small>날씨 객체 변환</small></li>
                  <li><b>astronomyService</b><small>일출·일몰 정규화</small></li>
                </ul>
              </article>

              <article class="folder-card">
                <header><span>ENGINE & DATA</span><strong>features/ · data/ · router/</strong></header>
                <ul>
                  <li><b>weather-scene/</b><small>장면 분류와 팔레트</small></li>
                  <li><b>regions · districts</b><small>전국 지역 좌표</small></li>
                  <li><b>router/index</b><small>페이지 주소 연결</small></li>
                </ul>
              </article>
            </div>
          </section>

          <section class="structure-layer structure-layer--runtime">
            <header class="layer-heading">
              <span>03</span>
              <div><strong>운영 환경</strong><small>인증키를 보호하고 빌드 결과를 제공하는 서버</small></div>
            </header>
            <article class="runtime-strip">
              <div><b>server/weatherProxy</b><small>기상청·천문연구원 보안 프록시</small></div>
              <i></i>
              <div><b>server/index</b><small>정적 빌드와 SPA fallback</small></div>
              <i></i>
              <div><b>.env.local</b><small>브라우저 밖에서 인증키 주입</small></div>
            </article>
          </section>
        </div>

        <div class="architecture-flow" aria-label="날씨 서비스 실행 흐름">
          <div><span>01</span><b>Router</b><small>주소에 맞는 View 선택</small></div>
          <i>→</i>
          <div><span>02</span><b>View</b><small>페이지 단위 화면 구성</small></div>
          <i>→</i>
          <div><span>03</span><b>Weather Components</b><small>지도·카드·디지털 창문 조합</small></div>
          <i>↔</i>
          <div><span>04</span><b>Store · Service · Proxy</b><small>설정 공유 · 데이터 변환 · 보안 요청</small></div>
        </div>

        <div class="api-usage-board composition-usage-board" aria-label="Composition API 사용 구조">
          <article><span>COMPOSITION API</span><strong>ref()</strong>
            <p>검색어, 선택 지역, 로딩 상태와 디지털 창문 UI처럼 직접 변경되는 상태를 저장합니다.</p><code>searchQuery · selectedCityInfo</code>
          </article>
          <article><span>DERIVED STATE</span><strong>computed()</strong>
            <p>검색 결과, 전국 평균 기온, 장면 단계와 조건별 멘트를 의존 데이터가 바뀔 때 다시 계산합니다.</p>
            <code>averageTemperature · windowMomentMessage</code>
          </article>
          <article><span>SIDE EFFECT</span><strong>watch()</strong>
            <p>보기 모드와 선택 지역이 바뀌면 장면 전환, 멘트 순환과 지역 데이터 요청을 실행합니다.</p><code>viewMode · selectedCityInfo</code>
          </article>
          <article><span>AUTO TRACKING</span><strong>watchEffect()</strong>
            <p>검색어처럼 함수 안에서 참조한 반응형 값을 자동 추적해 관련 동작을 갱신합니다.</p><code>searchQuery → filter log</code>
          </article>
        </div>
      </div>
    </section>

    <section class="final-cta">
      <p>현재 대한민국 17개 광역시·도와 시·군·구 날씨를 확인할 수 있습니다.</p>
      <h2>지금 지역의 하늘을 확인해 보세요.</h2>
      <RouterLink to="/weather">디지털 창문 열기 →</RouterLink>
    </section>
  </main>
</template>

<style scoped>
.about-page {
  overflow: hidden;
  color: #102a4c;
  word-break: keep-all;
  overflow-wrap: break-word;
}

.about-hero,
.content-section,
.final-cta {
  width: min(1240px, calc(100% - 40px));
  margin: 0 auto;
}

.about-hero {
  display: grid;
  min-height: min(780px, calc(100vh - 62px));
  grid-template-columns: minmax(0, 0.9fr) minmax(480px, 1.1fr);
  align-items: center;
  gap: clamp(42px, 7vw, 100px);
  padding: 70px 0 90px;
}

.eyebrow {
  margin: 0 0 14px;
  color: #2563eb;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.16em;
}

h1 {
  max-width: 700px;
  margin: 0;
  color: #102a4c;
  font-size: clamp(44px, 4.45vw, 72px);
  line-height: 1.06;
  letter-spacing: -0.045em;
}

h1 span {
  display: block;
}

.lead {
  max-width: 640px;
  margin: 28px 0 34px;
  color: #52647a;
  font-size: clamp(17px, 1.7vw, 21px);
  line-height: 1.72;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.hero-actions a,
.final-cta a {
  padding: 13px 18px;
  border-radius: 999px;
  font-weight: 850;
}

.primary-action,
.final-cta a {
  background: #1d4ed8;
  color: white;
  box-shadow: 0 12px 28px rgba(37, 99, 235, 0.25);
}

.secondary-action {
  border: 1px solid #bfdbfe;
  background: white;
  color: #1d4ed8;
}

.weather-preview {
  position: relative;
  min-height: 650px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 38px;
  background: #7abcf2;
  box-shadow: 0 34px 90px rgba(25, 75, 122, 0.3);
  isolation: isolate;
}

.preview-sky-gradient,
.preview-atmosphere,
.preview-stars,
.preview-cloud-video {
  position: absolute;
  inset: 0;
}

.preview-sky-gradient {
  z-index: -5;
  background:
    linear-gradient(180deg, transparent 38%, rgba(7, 28, 54, calc(.15 + var(--preview-darkness) * .66))),
    linear-gradient(155deg, var(--preview-sky-top) 0%, var(--preview-sky-middle) 52%, var(--preview-sky-horizon) 100%);
  filter: brightness(calc(1.06 - var(--preview-darkness) * .48));
  transition: filter .12s linear;
}

.weather-preview--night .preview-sky-gradient {
  background: linear-gradient(160deg, #051426 0%, #102c51 62%, #40556d 100%);
}

.preview-cloud-video {
  z-index: -4;
}

.preview-atmosphere {
  z-index: -1;
  background:
    radial-gradient(circle at var(--preview-sun-x) var(--preview-sun-y), rgba(255, 245, 196, .22), transparent 34%),
    linear-gradient(180deg, transparent 48%, rgba(6, 22, 41, .42));
  pointer-events: none;
}

.preview-stars {
  z-index: -2;
  opacity: calc(var(--preview-darkness) * 1.35);
  background-image:
    radial-gradient(circle at 17% 19%, #fff 0 1px, transparent 1.7px),
    radial-gradient(circle at 71% 14%, #fff 0 1px, transparent 1.7px),
    radial-gradient(circle at 42% 33%, #fff 0 1px, transparent 1.7px),
    radial-gradient(circle at 87% 29%, #fff 0 1px, transparent 1.7px);
}

.preview-horizon {
  position: absolute;
  z-index: 0;
  right: 0;
  bottom: 0;
  left: 0;
  height: 29%;
  opacity: .72;
  background: linear-gradient(180deg, rgba(25, 48, 67, .18), rgba(5, 18, 33, .88));
  clip-path: polygon(0 52%, 8% 48%, 12% 54%, 21% 39%, 26% 49%, 34% 42%, 42% 56%, 50% 45%, 59% 50%, 67% 35%, 72% 45%, 80% 38%, 87% 51%, 94% 43%, 100% 49%, 100% 100%, 0 100%);
}

.preview-topbar {
  position: absolute;
  z-index: 4;
  top: 22px;
  right: 22px;
  left: 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  color: white;
  font-size: 11px;
  font-weight: 850;
  letter-spacing: .08em;
  text-shadow: 0 1px 8px rgba(7, 24, 44, .45);
}

.preview-live {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.preview-live i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #7df4a7;
  box-shadow: 0 0 0 5px rgba(125, 244, 167, .16), 0 0 14px rgba(125, 244, 167, .75);
  animation: live-pulse 1.8s ease-in-out infinite;
}

.preview-info {
  position: absolute;
  z-index: 3;
  right: 26px;
  bottom: 72px;
  left: 26px;
  padding: 26px;
  border: 1px solid rgba(255, 255, 255, 0.32);
  border-radius: 24px;
  background: linear-gradient(135deg, rgba(8, 31, 55, .35), rgba(10, 38, 67, .18));
  color: white;
  backdrop-filter: blur(18px);
  box-shadow: inset 0 1px rgba(255, 255, 255, .13), 0 18px 50px rgba(2, 16, 31, .14);
}

.preview-location {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.preview-location>span {
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.preview-location>small {
  color: rgba(255, 255, 255, .72);
  font-size: 10px;
}

.preview-current {
  display: flex;
  align-items: center;
  gap: 18px;
  margin: 8px 0 14px;
}

.preview-current>strong {
  font-size: 76px;
  line-height: 1;
  letter-spacing: -0.09em;
}

.preview-current>strong small {
  font-size: 32px;
}

.preview-current p {
  margin: 0 0 4px;
  font-size: 17px;
  font-weight: 850;
}

.preview-current div>small {
  color: rgba(255, 255, 255, .76);
  font-size: 11px;
}

.preview-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.preview-metrics i {
  padding: 6px 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.15);
  font-size: 11px;
  font-style: normal;
}

.preview-service-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
  margin-top: 14px;
}

.preview-service-grid article {
  min-width: 0;
  padding: 11px;
  border: 1px solid rgba(255, 255, 255, .16);
  border-radius: 13px;
  background: rgba(4, 25, 46, .2);
}

.preview-service-grid span,
.preview-service-grid strong,
.preview-service-grid small {
  display: block;
}

.preview-service-grid span {
  color: #bfdbfe;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: .07em;
}

.preview-service-grid strong {
  overflow: hidden;
  margin: 5px 0 3px;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-service-grid small {
  min-height: 28px;
  color: rgba(255, 255, 255, .66);
  font-size: 9px;
  line-height: 1.45;
}

.preview-timeline {
  position: absolute;
  z-index: 4;
  right: 30px;
  bottom: 26px;
  left: 30px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  color: rgba(255, 255, 255, .78);
  font-size: 9px;
  font-weight: 800;
}

.preview-timeline>div {
  position: relative;
  height: 2px;
  border-radius: 99px;
  background: linear-gradient(90deg, rgba(255, 208, 123, .72), rgba(255, 255, 255, .8), rgba(255, 165, 115, .72));
}

.preview-timeline>div i {
  position: absolute;
  top: 50%;
  width: 8px;
  height: 8px;
  border: 2px solid white;
  border-radius: 50%;
  background: #ffd27d;
  box-shadow: 0 0 12px rgba(255, 221, 148, .9);
  transform: translate(-50%, -50%);
}

@keyframes live-pulse {
  50% {
    opacity: .45;
    transform: scale(.78);
  }
}

.content-section {
  padding: 100px 0;
}

.section-heading {
  max-width: 820px;
  margin-bottom: 38px;
}

.section-heading>p {
  margin: 0 0 10px;
  color: #2563eb;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.16em;
}

.section-heading h2,
.final-cta h2 {
  margin: 0;
  color: #102a4c;
  font-size: clamp(34px, 5vw, 58px);
  line-height: 1.08;
  letter-spacing: -0.06em;
}

.section-heading>span {
  display: block;
  margin-top: 15px;
  color: #64748b;
  font-size: 17px;
  line-height: 1.7;
}

.feature-grid,
.api-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-auto-rows: 1fr;
  gap: 14px;
}

.feature-grid article,
.api-grid article {
  display: grid;
  align-content: start;
  gap: 12px;
  padding: 28px;
  border: 1px solid #dbe5f0;
  border-radius: 22px;
  background: white;
  box-shadow: 0 14px 38px rgba(15, 23, 42, 0.06);
  height: 100%;
}

.feature-grid span,
.api-grid span {
  color: #60a5fa;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.12em;
}

.feature-grid strong,
.api-grid strong {
  color: #123c83;
  font-size: 20px;
}

.feature-grid p,
.api-grid p {
  margin: 0;
  color: #64748b;
  line-height: 1.7;
}

.commute-value-section {
  padding-top: 24px;
}

.commute-value-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.commute-value-grid article {
  min-height: 220px;
  padding: 28px;
  border: 1px solid #d7e5f2;
  border-radius: 24px;
  background: linear-gradient(145deg, #fff, #eef7ff);
}

.commute-value-grid article.is-planned {
  border-style: dashed;
  background: #f8fafc;
}

.commute-value-grid span,
.commute-value-grid strong {
  display: block;
}

.commute-value-grid span {
  color: #3b82f6;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .11em;
}

.commute-value-grid strong {
  margin: 18px 0 12px;
  color: #123c83;
  font-size: clamp(20px, 2vw, 27px);
  line-height: 1.28;
  letter-spacing: -.035em;
}

.commute-value-grid p {
  margin: 0;
  color: #64748b;
  line-height: 1.7;
}

.engine-section {
  width: 100%;
  max-width: none;
  padding-inline: max(20px, calc((100% - 1240px) / 2));
  background: linear-gradient(130deg, #0d2948, #123c83 56%, #1d4ed8);
}

.section-heading--light h2,
.section-heading--light>p {
  color: white;
}

.section-heading--light>span {
  color: #bfdbfe;
}

.engine-flow {
  display: grid;
  grid-template-columns: 1fr auto 1fr auto 1fr;
  align-items: center;
  gap: 18px;
}

.engine-flow article {
  min-height: 200px;
  padding: 28px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  backdrop-filter: blur(10px);
}

.engine-flow small,
.engine-flow strong {
  display: block;
}

.engine-flow small {
  color: #93c5fd;
  font-weight: 900;
  letter-spacing: 0.14em;
}

.engine-flow strong {
  margin: 11px 0;
  font-size: 23px;
}

.engine-flow p {
  margin: 0;
  color: #dbeafe;
  line-height: 1.7;
}

.engine-flow>i {
  color: #93c5fd;
  font-size: 28px;
  font-style: normal;
}

.api-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.kma-api-summary {
  display: grid;
  grid-template-columns: minmax(280px, .85fr) minmax(420px, 1.15fr);
  gap: 26px;
  margin-bottom: 14px;
  padding: clamp(24px, 4vw, 38px);
  border-radius: 26px;
  background: linear-gradient(130deg, #0d2948, #123c83 58%, #2563eb);
  color: white;
  box-shadow: 0 20px 48px rgba(18, 60, 131, .2);
}

.kma-api-summary>div>span,
.api-usage-board article>span {
  color: #93c5fd;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .14em;
}

.kma-api-summary>div>strong {
  display: block;
  margin: 9px 0;
  font-size: clamp(22px, 2.5vw, 32px);
  letter-spacing: -.035em;
}

.kma-api-summary p {
  margin: 0;
  color: #dbeafe;
  line-height: 1.6;
}

.kma-api-summary code {
  padding: 3px 6px;
  border-radius: 6px;
  background: rgba(255, 255, 255, .11);
  color: white;
}

.kma-api-summary ul {
  display: grid;
  gap: 1px;
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, .15);
  border-radius: 18px;
  background: rgba(255, 255, 255, .08);
  list-style: none;
}

.kma-api-summary li {
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 15px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, .12);
}

.kma-api-summary li:last-child {
  border-bottom: 0;
}

.kma-api-summary li b {
  color: white;
  font-size: 12px;
}

.kma-api-summary li span {
  color: #bfdbfe;
  font-size: 12px;
}

.api-usage-board {
  display: grid;
  grid-template-columns: 1.08fr .96fr .96fr;
  gap: 14px;
  margin-bottom: 14px;
}

.api-usage-board article {
  min-width: 0;
  padding: 26px;
  border: 1px solid #dbe5f0;
  border-radius: 22px;
  background: #f8fbff;
}

.api-usage-board article>strong {
  display: block;
  margin: 10px 0 18px;
  color: #123c83;
  font-size: 20px;
}

.field-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.field-tags i {
  padding: 7px 9px;
  border: 1px solid #dbeafe;
  border-radius: 9px;
  background: white;
  color: #52647a;
  font-size: 11px;
  font-style: normal;
}

.field-tags b {
  margin-right: 3px;
  color: #2563eb;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.api-usage-board ul {
  display: grid;
  gap: 9px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.api-usage-board li {
  display: grid;
  grid-template-columns: 78px 1fr;
  align-items: baseline;
  gap: 10px;
  padding-top: 9px;
  border-top: 1px solid #dbe5f0;
}

.api-usage-board li b {
  color: #26496f;
  font-size: 12px;
}

.api-usage-board li small {
  color: #64748b;
  line-height: 1.5;
}

.structure-board {
  padding: clamp(22px, 4vw, 42px);
  border: 1px solid #dbe5f0;
  border-radius: 32px;
  background:
    radial-gradient(circle at 100% 0%, rgba(191, 219, 254, .42), transparent 34%),
    #f7faff;
  box-shadow: 0 24px 70px rgba(32, 74, 117, .08);
}

.root-node {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 18px 22px;
  border: 1px solid rgba(255, 255, 255, .18);
  border-radius: 20px;
  background: linear-gradient(135deg, #102a4c, #164b88);
  color: #fff;
  box-shadow: 0 16px 34px rgba(16, 42, 76, .18);
}

.root-node>div {
  display: flex;
  align-items: center;
  gap: 10px;
}

.root-node i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #7dd3fc;
  box-shadow: 0 0 0 6px rgba(125, 211, 252, .13);
}

.root-node b {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 17px;
}

.root-node span {
  color: #dbeafe;
  font-size: 12px;
}

.structure-layers {
  display: grid;
  gap: 16px;
  margin-top: 18px;
}

.structure-layer {
  padding: 18px;
  border: 1px solid #dce8f4;
  border-radius: 24px;
  background: rgba(255, 255, 255, .78);
}

.layer-heading {
  display: flex;
  align-items: center;
  gap: 13px;
  margin-bottom: 14px;
  padding: 0 2px;
}

.layer-heading>span {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 11px;
  background: #e0edff;
  color: #2563eb;
  font-size: 10px;
  font-weight: 900;
}

.layer-heading div {
  display: grid;
  gap: 2px;
}

.layer-heading strong {
  color: #163b68;
  font-size: 15px;
}

.layer-heading small {
  color: #7890a8;
  font-size: 11px;
}

.folder-columns {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-auto-rows: 1fr;
  gap: 12px;
}

.composition-usage-board {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: 20px;
  margin-bottom: 0;
}

.composition-usage-board article {
  padding: 20px;
}

.composition-usage-board article>strong {
  margin-bottom: 10px;
}

.composition-usage-board p {
  margin: 0 0 12px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
}

.composition-usage-board code,
.api-grid code {
  color: #2563eb;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  overflow-wrap: anywhere;
}

.folder-card {
  display: grid;
  height: 100%;
  grid-template-rows: auto 1fr;
  overflow: hidden;
  border: 1px solid #dbe6f0;
  border-radius: 16px;
  background: white;
  box-shadow: 0 8px 24px rgba(31, 69, 108, .05);
}

.folder-card header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 62px;
  box-sizing: border-box;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid #e3edf6;
  background: #f4f8fd;
}

.folder-card header span {
  color: #5b8bc5;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.12em;
}

.folder-card header strong {
  color: #183f6d;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.35;
  text-align: right;
  letter-spacing: -.03em;
}

.folder-card ul {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 8px 16px 12px;
  list-style: none;
}

.folder-card li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 0;
  border-bottom: 1px solid #e2e8f0;
}

.folder-card li:last-child {
  border-bottom: 0;
}

.folder-card li b {
  color: #26496f;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.45;
}

.folder-card li small {
  color: #64748b;
  font-size: 11px;
  line-height: 1.45;
  text-align: right;
}

.structure-layer--runtime {
  background: linear-gradient(135deg, rgba(228, 240, 253, .8), rgba(247, 251, 255, .96));
}

.runtime-strip {
  display: grid;
  grid-template-columns: 1fr auto 1fr auto 1fr;
  align-items: center;
  gap: 18px;
  padding: 18px 20px;
  border: 1px solid #d8e6f3;
  border-radius: 16px;
  background: white;
}

.runtime-strip>div {
  display: grid;
  gap: 5px;
}

.runtime-strip b {
  color: #183f6d;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}

.runtime-strip small {
  color: #6d8298;
  font-size: 11px;
  line-height: 1.45;
}

.runtime-strip>i {
  width: 1px;
  height: 34px;
  background: #dce8f4;
}

.architecture-flow {
  display: grid;
  grid-template-columns: 1fr auto 1fr auto 1fr auto 1fr;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
  padding: 20px;
  border: 1px solid #cbdceb;
  border-radius: 20px;
  background: rgba(255, 255, 255, .62);
}

.architecture-flow>div {
  display: grid;
  min-height: 100px;
  align-content: center;
  gap: 5px;
  padding: 15px;
  border-radius: 14px;
  background: white;
  box-shadow: 0 8px 20px rgba(15, 23, 42, .05);
}

.architecture-flow span {
  color: #60a5fa;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: .12em;
}

.architecture-flow b {
  color: #123c83;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
}

.architecture-flow small {
  color: #64748b;
  line-height: 1.45;
}

.architecture-flow>i {
  color: #60a5fa;
  font-size: 20px;
  font-style: normal;
}

.final-cta {
  margin-bottom: 90px;
  padding: clamp(34px, 6vw, 68px);
  border-radius: 30px;
  background: white;
  box-shadow: 0 20px 60px rgba(15, 23, 42, 0.09);
  text-align: center;
}

.final-cta p {
  margin: 0 0 9px;
  color: #64748b;
}

.final-cta a {
  display: inline-block;
  margin-top: 28px;
}

@media (max-width: 960px) {
  .about-hero {
    min-height: auto;
    grid-template-columns: 1fr;
  }

  .weather-preview {
    min-height: 620px;
  }

  .api-grid {
    grid-template-columns: 1fr 1fr;
  }

  .kma-api-summary,
  .api-usage-board {
    grid-template-columns: 1fr;
  }

  .kma-api-summary {
    gap: 20px;
  }

  .folder-columns {
    grid-template-columns: 1fr 1fr;
  }

  .folder-columns .folder-card:last-child {
    grid-column: 1 / -1;
  }

  .commute-value-grid {
    grid-template-columns: 1fr;
  }

  .commute-value-grid article {
    min-height: 0;
  }

  .architecture-flow {
    grid-template-columns: 1fr 1fr;
  }

  .architecture-flow>i {
    display: none;
  }
}

@media (max-width: 720px) {

  .feature-grid,
  .api-grid,
  .folder-columns,
  .engine-flow,
  .commute-value-grid {
    grid-template-columns: 1fr;
  }

  .folder-columns .folder-card:last-child {
    grid-column: auto;
  }

  .root-node {
    align-items: flex-start;
    flex-direction: column;
    gap: 7px;
  }

  .runtime-strip {
    grid-template-columns: 1fr;
  }

  .runtime-strip>i {
    width: 100%;
    height: 1px;
  }

  .architecture-flow {
    grid-template-columns: 1fr;
  }

  .engine-flow>i {
    text-align: center;
    transform: rotate(90deg);
  }

  .weather-preview {
    min-height: 590px;
  }

  .preview-info {
    right: 16px;
    bottom: 64px;
    left: 16px;
    padding: 20px;
  }

  .preview-current>strong {
    font-size: 60px;
  }

  .preview-current {
    align-items: flex-start;
    flex-direction: column;
    gap: 5px;
  }

  .preview-service-grid {
    grid-template-columns: 1fr;
  }

  .preview-service-grid article {
    display: grid;
    grid-template-columns: 70px 1fr;
    align-items: center;
    gap: 3px 8px;
    padding: 8px 10px;
  }

  .preview-service-grid strong {
    margin: 0;
  }

  .preview-service-grid small {
    min-height: 0;
    grid-column: 2;
  }

  .preview-location {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }

  .preview-topbar {
    top: 18px;
    right: 18px;
    left: 18px;
  }

  .preview-timeline {
    right: 20px;
    bottom: 22px;
    left: 20px;
  }

  .kma-api-summary li {
    grid-template-columns: 1fr;
    gap: 5px;
  }

  .folder-card li {
    align-items: flex-start;
    flex-direction: column;
    gap: 4px;
  }

  .folder-card li small {
    text-align: left;
  }
}
</style>
