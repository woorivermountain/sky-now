<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue'
import { storeToRefs } from 'pinia'
import BaseDashboardCard from '../common/BaseDashboardCard.vue'
import SearchBar from './SearchBar.vue'
import WeatherCard from './WeatherCard.vue'
import WeatherMap from './WeatherMap.vue'
import WeatherVideoBackground from './WeatherVideoBackground.vue'
import LiveSun from './LiveSun.vue'
import { KOREA_REGIONS } from '../../data/weather/regions'
import { REGION_DISTRICTS } from '../../data/weather/districts'
import { getDaylightPalette, getWeatherSceneProfile, getWeatherVideoGroup, WEATHER_VIDEO_GROUPS } from '../../features/weather-scene/index.js'
import { createFallbackWeather } from '../../data/weatherMockData'
import { fetchKmaWeather, fetchKmaWeatherForLocations } from '../../services/kmaWeather'
import { useTemperature } from '../../composables/useTemperature'

const emit = defineEmits(['click-detail'])
const { configStore, displayTemp, unitSymbol } = useTemperature()
const { viewMode, isLandscapeInfoOpen } = storeToRefs(configStore)

// 1. ref() - 화면에서 직접 바뀌는 상태를 저장합니다.
const searchQuery = ref('')
const selectedCityInfo = ref(null)
const isLoading = ref(true)
const errorMessage = ref('')
const selectedCityLog = ref('아직 상세보기를 누른 지역이 없습니다.')
const searchEffectLog = ref('검색어를 입력하면 watchEffect가 동작합니다.')
const weatherMap = ref(null)
const currentTime = ref(new Date())
const currentLocationWeather = ref(null)
const locationStatus = ref('현재 지역을 확인하는 중입니다...')
const landscapeWeather = ref(null)
const isModeTransitioning = ref(false)
const transitionLabel = ref('')
const selectedRegionId = ref('')
const selectedDistrictId = ref('')
const districtWeatherList = ref([])
const isDistrictLoading = ref(false)
const focusedWeather = ref(null)
const videoErrorMessage = ref('')
const isAmbientUiVisible = ref(true)
const isWindowMomentVisible = ref(false)
const messageVariationIndex = ref(0)
const isWindowBreakActive = ref(false)
const isWindowBreakIntroVisible = ref(false)
const isWindowBreakControlVisible = ref(false)
const windowBreakRemaining = ref(60)
const districtWeatherCache = new Map()
const weatherApiUnavailable = ref(false)
const WEATHER_CACHE_PREFIX = 'sky-now-weather-v5-kma-kasi'
const WEATHER_CACHE_MAX_AGE = 10 * 60 * 1000

// 원본 지역 데이터는 별도 파일에서 가져오고, API로 채울 필드만 여기서 추가합니다.
const weatherList = ref(
  KOREA_REGIONS.map((region) => ({
    ...region,
    temp: null,
    status: '불러오는 중',
  })),
)

const selectedRegion = computed(() => weatherList.value.find((region) => region.id === selectedRegionId.value) ?? null)

// 광역시·도를 선택하면 카드 목록은 해당 지역의 시·군·구로 바뀝니다.
const visibleWeatherList = computed(() => selectedRegionId.value ? districtWeatherList.value : weatherList.value)

// 2. computed() - searchQuery와 현재 표시 목록을 이용해 검색 결과를 계산합니다.
const filteredWeatherList = computed(() => {
  const keyword = searchQuery.value.trim()

  if (!keyword) return visibleWeatherList.value

  return visibleWeatherList.value.filter((weather) => {
    return weather.name.includes(keyword) || weather.city.includes(keyword)
  })
})

// 2. computed() - 각 지역의 기온이 바뀔 때만 전국 평균을 다시 계산합니다.
const averageTemperature = computed(() => {
  const temperatures = weatherList.value
    .map((weather) => weather.temp)
    .filter((temp) => typeof temp === 'number')

  if (!temperatures.length) return null

  const total = temperatures.reduce((sum, temp) => sum + temp, 0)
  return Math.round((total / temperatures.length) * 10) / 10
})

const warmerRegions = computed(() => {
  if (averageTemperature.value === null) return []

  return weatherList.value.filter((weather) => weather.temp > averageTemperature.value)
})

const statusWeather = computed(() => {
  return focusedWeather.value ?? districtWeatherList.value[0] ?? selectedRegion.value ?? currentLocationWeather.value
})

// 대시보드는 현재 위치, 오늘의 창은 사용자가 선택한 지역의 하늘을 사용합니다.
const activeSkyWeather = computed(() => {
  if (viewMode.value === 'landscape') {
    if (landscapeWeather.value?.id === 'my-location') {
      return currentLocationWeather.value
    }

    return landscapeWeather.value ?? currentLocationWeather.value
  }

  return statusWeather.value ?? currentLocationWeather.value
})

const nearestSkyRegion = computed(() => {
  const weather = activeSkyWeather.value
  if (!weather?.latitude || !weather?.longitude) return KOREA_REGIONS[0]

  return KOREA_REGIONS.reduce((nearest, region) => {
    const nearestDistance = (nearest.latitude - weather.latitude) ** 2 + (nearest.longitude - weather.longitude) ** 2
    const regionDistance = (region.latitude - weather.latitude) ** 2 + (region.longitude - weather.longitude) ** 2
    return regionDistance < nearestDistance ? region : nearest
  }, KOREA_REGIONS[0])
})

function getRegionalIdentity(weather) {
  if (!weather) return KOREA_REGIONS[0]
  const regionId = weather.parentRegionId || weather.id
  return KOREA_REGIONS.find((region) => region.id === regionId) ?? nearestSkyRegion.value
}

// 선택 지역의 이름과 풍경 설명은 화면 정보 및 전환 장면에 사용합니다.
const transitionRegionalIdentity = computed(() => getRegionalIdentity(landscapeWeather.value ?? activeSkyWeather.value))

// 선택 지역의 실제 구름량을 영상 농도와 대기 밝기로 바꿉니다.
// 영상은 압축 노이즈가 도드라지지 않도록 항상 원본 속도로 재생합니다.
const cloudScene = computed(() => {
  const weather = activeSkyWeather.value
  const fallbackCloudCover = ['맑음', '대체로 맑음'].includes(weather?.status)
    ? 12
    : weather?.status === '부분적으로 흐림'
      ? 48
      : weather?.status === '흐림'
        ? 86
        : 82
  const rawCloudCover = Number(weather?.cloudCover ?? fallbackCloudCover)
  const cloudCover = Math.min(100, Math.max(0, rawCloudCover))
  const weatherCode = Number(weather?.weatherCode)
  const isHeavyWeather = [55, 57, 63, 65, 67, 73, 75, 82, 86, 95, 96, 99].includes(weatherCode)
  const obscuresSun = [3, 45, 48, 55, 57, 63, 65, 66, 67, 73, 75, 82, 86, 95, 96, 99].includes(weatherCode)
  const calculatedSunOpacity = Math.max(0.015, 1 - (cloudCover / 100) * 0.92)

  const cloudRatio = cloudCover / 100

  return {
    videoOpacity: Math.round((0.035 + (cloudRatio ** 0.88) * 0.9) * 1000) / 1000,
    atmosphereOpacity: Math.min(0.48, Math.max(0, (cloudCover - 28) / 72) * 0.32 + (isHeavyWeather ? 0.1 : 0)),
    sunOpacity: obscuresSun ? Math.min(isHeavyWeather ? 0.025 : 0.08, calculatedSunOpacity) : calculatedSunOpacity,
    brightness: Math.max(0.48, 1.08 - (cloudRatio ** 1.08) * 0.42 - (isHeavyWeather ? 0.08 : 0)),
  }
})

const localLiveScene = computed(() => calculateSunsetScene(activeSkyWeather.value))
const liveSkyStyle = computed(() => {
  const scene = localLiveScene.value
  if (!scene) return {}

  const palette = typeof scene.dayProgress === 'number'
    ? getDaylightPalette(scene.dayProgress)
    : null

  return {
    '--sun-x': `${scene.sunX}%`,
    '--sun-y': `${scene.sunY}%`,
    '--scene-darkness': scene.darkness,
    '--star-opacity': scene.starOpacity,
    '--cloud-video-opacity': cloudScene.value.videoOpacity,
    '--weather-atmosphere-opacity': cloudScene.value.atmosphereOpacity,
    '--sun-weather-opacity': cloudScene.value.sunOpacity,
    '--weather-brightness': cloudScene.value.brightness,
    ...(palette ? {
      '--sky-top': palette.top,
      '--sky-middle': palette.middle,
      '--sky-horizon': palette.horizon,
      '--sky-warmth': palette.warmth,
    } : {}),
  }
})
const activeVideoGroup = computed(() => getWeatherVideoGroup(activeSkyWeather.value, localLiveScene.value?.phase))
const activeVideoSources = computed(() => WEATHER_VIDEO_GROUPS[activeVideoGroup.value] ?? WEATHER_VIDEO_GROUPS['partly-cloudy-day'])
const activeWeatherScene = computed(() => getWeatherSceneProfile(activeSkyWeather.value, localLiveScene.value?.phase))
const sceneSummary = computed(() => activeWeatherScene.value.label)
const activeWeatherBasis = computed(() => {
  const weather = activeSkyWeather.value
  if (!weather) return '데이터 확인 중'
  const time = String(weather.observationTime ?? '').slice(11, 16)
  if (weather.dataSource?.includes('nowcast')) return `기상청 실황 ${time}`
  if (weather.dataSource?.startsWith('kma-')) return `기상청 예보 ${time}`
  return '계절·좌표 기준 기본 데이터'
})
const transitionWeatherScene = computed(() => {
  const weather = landscapeWeather.value ?? activeSkyWeather.value
  const phase = calculateSunsetScene(weather)?.phase
  return getWeatherSceneProfile(weather, phase)
})

const sceneIndicators = computed(() => {
  const weather = activeSkyWeather.value
  const sun = localLiveScene.value
  if (!weather || !sun) return []

  const cloud = Math.round(Number(weather.cloudCover ?? 0))
  const humidity = Math.round(Number(weather.humidity ?? 0))
  const precipitation = Number(weather.precipitation ?? 0)
  const wind = Number(weather.windSpeed ?? 0)
  const brightness = Math.round(cloudScene.value.brightness * (1 - sun.darkness * 0.68) * 100)
  const sunHeight = Math.round(Math.max(0, Math.min(100, 100 - sun.sunY)))

  const cloudMotion = wind >= 28 ? '빠름' : wind >= 14 ? '보통' : '느림'

  return [
    { label: '구름량', value: `${cloud}%`, level: cloud },
    { label: '습도', value: `${humidity}%`, level: humidity },
    { label: '강수', value: `${precipitation} mm`, level: Math.min(100, precipitation * 18) },
    { label: '구름 이동', value: `${cloudMotion} · ${wind} km/h`, level: Math.min(100, wind / 45 * 100) },
    { label: '장면 밝기', value: `${brightness}%`, level: brightness },
    { label: '화면 태양 높이', value: `${sunHeight}%`, level: sunHeight },
  ]
})

const primarySkySignals = computed(() => {
  const weather = activeSkyWeather.value
  const sun = localLiveScene.value
  if (!weather || !sun) return []

  const cloud = Math.round(Number(weather.cloudCover ?? 0))
  const wind = Number(weather.windSpeed ?? 0)
  const brightness = Math.round(cloudScene.value.brightness * (1 - sun.darkness * 0.68) * 100)
  const motion = wind >= 28 ? '빠름' : wind >= 14 ? '보통' : '느림'

  return [
    { label: '구름량', value: `${cloud}%` },
    { label: '구름 이동', value: `${motion} · ${wind} km/h` },
    { label: '장면 밝기', value: `${brightness}%` },
  ]
})

const workdayState = computed(() => {
  const now = currentTime.value
  const start = new Date(now)
  const end = new Date(now)
  start.setHours(9, 0, 0, 0)
  end.setHours(18, 0, 0, 0)

  const progress = Math.max(0, Math.min(100, (now - start) / (end - start) * 100))

  if (now < start) {
    return {
      progress: 0,
      label: '업무 시작까지',
      countdown: formatCountdown(start - now),
      message: '오늘의 하늘이 천천히 열리고 있어요.',
    }
  }

  if (now >= end) {
    return {
      progress: 100,
      label: '오늘도 수고했어요',
      countdown: '퇴근 시간이 지났습니다',
      message: '이제 하루의 속도를 천천히 낮춰도 좋아요.',
    }
  }

  return {
    progress: Math.round(progress * 10) / 10,
    label: '퇴근까지',
    countdown: formatCountdown(end - now),
    message: progress >= 80
      ? '오늘의 끝이 가까워지고 있어요.'
      : progress >= 50
        ? '하루의 절반을 지나 퇴근 쪽으로 가고 있어요.'
        : '오늘의 시간이 차분히 흐르고 있어요.',
  }
})

const commuteGuide = computed(() => {
  const weather = activeSkyWeather.value
  if (!weather) return null

  const forecast = weather.commuteForecast
  const commuteWeather = forecast ?? weather
  const status = commuteWeather.status ?? weather.status
  const precipitation = Number(commuteWeather.precipitation ?? 0)
  const windSpeed = Number(commuteWeather.windSpeed ?? 0)
  const temp = Number(commuteWeather.temp ?? weather.temp)
  const needsUmbrella = precipitation > 0 || /비|눈|소나기/.test(status)
  const end = new Date(currentTime.value)
  end.setHours(18, 0, 0, 0)
  let daylightText = '일몰 정보를 계산하고 있어요.'

  if (weather.sunset) {
    const sunset = new Date(`${weather.sunset}+09:00`)
    const differenceMinutes = Math.round((sunset - end) / 60_000)
    daylightText = differenceMinutes >= 0
      ? `퇴근 후에도 약 ${differenceMinutes}분 동안 해가 떠 있어요.`
      : `퇴근 약 ${Math.abs(differenceMinutes)}분 전에 해가 져요.`
  }

  return {
    source: forecast ? '18시 기상청 초단기예보' : '현재 날씨 기준 안내',
    headline: needsUmbrella
      ? '퇴근길에는 우산을 챙기는 편이 좋아요.'
      : windSpeed >= 25
        ? '퇴근길 바람이 강할 수 있어요.'
        : '현재 기준으로 퇴근길은 무난해 보여요.',
    summary: needsUmbrella ? '우산 챙기기' : windSpeed >= 25 ? '강풍 주의' : '큰 불편 없음',
    weatherLine: `${status} · ${Math.round(temp)}° · 바람 ${windSpeed} km/h`,
    requiresUmbrella: needsUmbrella,
    daylightText,
  }
})

const windowMessageCandidates = computed(() => {
  const weather = activeSkyWeather.value
  const scene = localLiveScene.value
  if (!weather || !scene) return ['창밖의 시간을 불러오고 있어요.']

  const status = String(weather.status ?? '')
  const cloudCover = Number(weather.cloudCover ?? 0)
  const windSpeed = Number(weather.windSpeed ?? 0)
  const precipitation = Number(weather.precipitation ?? 0)
  const place = weather.name || weather.city || '선택한 지역'
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    hour12: false,
  }).format(currentTime.value))

  if (/뇌우/.test(status)) {
    return [
      `${place}의 하늘이 크게 흔들리고 있어요. 실내에서도 천둥과 돌풍에 유의하세요.`,
      '짙은 구름 사이로 번개가 지나는 날씨입니다. 이동 전 예보를 한 번 더 확인하세요.',
      '지금의 어두운 빛은 뇌우 구름을 반영하고 있어요. 잠시 안전한 실내에 머물러 주세요.',
      `구름 ${Math.round(cloudCover)}%. 하늘의 긴장감이 디지털 창문에도 그대로 전해집니다.`,
    ]
  }

  if (/비|소나기|빗방울/.test(status)) {
    const rainTone = precipitation >= 5 ? '굵은 비가' : precipitation >= 1 ? '비가' : '가벼운 빗방울이'
    return [
      `${place}에는 지금 ${rainTone} 이어지고 있어요.`,
      '젖은 하늘 아래 구름이 낮게 지나갑니다. 이동할 때 우산을 챙겨 주세요.',
      '창밖의 빗소리를 상상하며 잠시 호흡을 고르세요.',
      `강수 ${precipitation || '소량'} mm · 구름 ${Math.round(cloudCover)}%. 흐린 빛도 실제 날씨를 따라갑니다.`,
      '비가 만든 차분한 빛이 공간 안으로 천천히 스며듭니다.',
      windSpeed >= 20 ? '비와 함께 바람도 불고 있어요. 우산을 단단히 잡아야 하는 날씨입니다.' : '빗방울의 움직임을 따라 바깥의 시간을 천천히 느껴보세요.',
    ]
  }

  if (/눈|눈날림/.test(status)) {
    return [
      `${place}의 하늘에서 눈이 내려오고 있어요.`,
      '흰 눈 아래에서는 빛과 소리가 조금 더 고요하게 느껴집니다.',
      '눈구름이 지나가는 속도를 바라보며 잠시 시선을 쉬어가세요.',
      '노면이 미끄러울 수 있어요. 이동 전 바깥 상황을 확인해 주세요.',
      `구름 ${Math.round(cloudCover)}%. 차가운 하늘의 질감을 디지털 창문에 담았습니다.`,
    ]
  }

  if (/안개/.test(status)) {
    return [
      `${place}의 시야가 안개 속에서 부드럽게 흐려지고 있어요.`,
      '멀리 있는 풍경보다 가까운 빛에 잠시 집중해 보세요.',
      '공기 중의 수분이 빛의 경계를 희미하게 만들고 있습니다.',
      '외출하거나 운전할 때는 평소보다 천천히 이동해 주세요.',
    ]
  }

  if (['dusk', 'night'].includes(scene.phase)) {
    return cloudCover >= 70
      ? [
          `${place}의 밤하늘은 구름에 가려 깊고 차분합니다.`,
          '낮의 빛이 모두 물러나고 흐린 밤의 색이 자리를 채웠어요.',
          '구름 너머의 밤을 바라보며 오늘의 속도를 조금 낮춰보세요.',
          '오늘도 수고했어요. 디지털 창문의 밤은 조용히 이어집니다.',
        ]
      : [
          `${place}의 하늘이 밤의 색으로 바뀌었습니다.`,
          '하루의 밝기가 사라진 자리에 고요한 밤이 머물고 있어요.',
          '오늘도 수고했어요. 잠시 어두운 하늘을 바라보며 쉬어가세요.',
          '도시의 밤과 하늘의 깊이가 디지털 창문 너머로 이어집니다.',
          '내일의 빛이 오기 전, 오늘의 마지막 풍경을 천천히 바라보세요.',
        ]
  }

  if (cloudCover >= 78) {
    return [
      `${place}의 하늘은 구름이 짙게 덮고 있어요.`,
      '햇빛이 구름 뒤에서 넓고 부드럽게 퍼지고 있습니다.',
      `구름 ${Math.round(cloudCover)}%. 선명한 그림자 없이 차분한 오후가 흐릅니다.`,
      '회색 하늘도 매 순간 농도와 결이 조금씩 달라집니다.',
      '짙은 구름의 느린 움직임을 따라 잠시 눈의 초점을 풀어보세요.',
    ]
  }

  if (scene.phase === 'golden-hour') {
    return [
      `${place}의 빛이 오늘 가장 따뜻한 색으로 바뀌고 있어요.`,
      '낮아진 태양이 구름의 가장자리를 천천히 물들이고 있습니다.',
      '일몰 전의 짧은 빛을 디지털 창문으로 잠시 바라보세요.',
      localLiveScene.value.remainingText,
      '퇴근이 가까워진 시간, 바깥의 빛도 하루를 정리하고 있어요.',
    ]
  }

  if (cloudCover >= 40) {
    return [
      `${place}의 구름 사이로 빛이 들어왔다가 다시 숨고 있어요.`,
      `구름 ${Math.round(cloudCover)}%. 하늘의 밝기가 천천히 호흡하듯 달라집니다.`,
      '구름의 빈틈마다 서로 다른 색의 하늘이 보입니다.',
      '햇빛과 그늘이 번갈아 지나가는 바깥의 흐름을 느껴보세요.',
      windSpeed >= 18 ? '바람이 구름의 모양을 빠르게 바꾸고 있어요.' : '구름이 서두르지 않고 천천히 흘러가고 있어요.',
    ]
  }

  if (windSpeed >= 22) {
    return [
      `${place}의 맑은 하늘 아래 바람이 빠르게 지나가고 있어요.`,
      `풍속 ${windSpeed} km/h. 하늘은 맑지만 바깥 공기는 제법 움직입니다.`,
      '선명한 빛 사이로 바람의 속도가 느껴지는 날입니다.',
      '외출할 때 가벼운 소지품이 날리지 않도록 살펴주세요.',
    ]
  }

  if (hour < 10) {
    return [
      `${place}의 아침빛이 공간 안으로 천천히 들어옵니다.`,
      '오늘의 하늘이 맑고 선명하게 열리고 있어요.',
      '아직 부드러운 아침 햇빛을 보며 하루의 속도를 맞춰보세요.',
      '동쪽에서 올라온 빛이 조금씩 높아지고 있습니다.',
      localLiveScene.value.remainingText,
    ]
  }

  if (hour < 14) {
    return [
      `${place}의 태양이 오늘 가장 높은 곳을 지나고 있어요.`,
      '그림자가 짧아진 한낮, 하늘의 색도 가장 선명합니다.',
      '잠깐 화면에서 시선을 떼고 멀리 있는 하늘을 바라보세요.',
      '맑은 빛이 공간의 분위기를 가볍게 바꾸고 있습니다.',
      `구름 ${Math.round(cloudCover)}%. 밝고 열린 하늘이 이어지고 있어요.`,
    ]
  }

  return [
    `${place}의 오후빛이 조금씩 부드러워지고 있어요.`,
    '태양이 서쪽으로 기울며 그림자의 길이가 천천히 늘어납니다.',
    workdayState.value.progress >= 85 ? '퇴근이 가까워졌어요. 바깥의 밝기를 잠시 확인해 보세요.' : '오후의 하늘을 바라보며 잠시 호흡을 고르세요.',
    localLiveScene.value.remainingText,
    '같은 하늘도 시간이 흐를수록 조금씩 다른 색을 보여줍니다.',
    `${place}의 지금을 디지털 창문으로 조용히 이어드립니다.`,
  ]
})

const windowMomentMessage = computed(() => {
  const candidates = windowMessageCandidates.value
  return candidates[messageVariationIndex.value % candidates.length]
})

const ambientMessage = computed(() => windowMomentMessage.value)

const windowBreakProgressStyle = computed(() => ({
  '--window-break-progress': `${Math.round(windowBreakRemaining.value / 60 * 360)}deg`,
}))

function formatCountdown(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function calculateSunsetScene(weather) {

  if (!weather?.sunrise || !weather?.sunset) return null

  const sunriseTime = new Date(`${weather.sunrise}+09:00`).getTime()
  const sunsetTime = new Date(`${weather.sunset}+09:00`).getTime()
  const now = currentTime.value.getTime()

  const oneHour = 60 * 60 * 1000

  if (now < sunriseTime - oneHour) {
    return { phase: 'night', sunX: 5, sunY: 82, darkness: 0.7, starOpacity: 0.9, remainingText: '해 뜨기 전 깊은 밤입니다.' }
  }

  if (now < sunriseTime) {
    const dawnProgress = (now - (sunriseTime - oneHour)) / oneHour
    return {
      phase: 'dawn',
      sunX: 3 + dawnProgress * 5,
      sunY: 82 - dawnProgress * 4,
      darkness: 0.62 - dawnProgress * 0.32,
      starOpacity: 0.85 - dawnProgress * 0.75,
      remainingText: '동이 트고 있습니다.',
    }
  }

  if (now >= sunsetTime + oneHour) {
    return { phase: 'night', sunX: 95, sunY: 82, darkness: 0.72, starOpacity: 0.92, remainingText: '오늘의 해가 완전히 졌습니다.' }
  }

  if (now >= sunsetTime) {
    const duskProgress = (now - sunsetTime) / oneHour
    return {
      phase: 'dusk',
      sunX: 92 + duskProgress * 3,
      sunY: 78 + duskProgress * 4,
      darkness: 0.28 + duskProgress * 0.44,
      starOpacity: 0.05 + duskProgress * 0.87,
      remainingText: '노을이 천천히 밤으로 바뀌고 있습니다.',
    }
  }

  const progress = (now - sunriseTime) / (sunsetTime - sunriseTime)
  const sunX = 8 + progress * 84
  const sunY = 78 - Math.sin(progress * Math.PI) * 58
  const remainingSeconds = Math.max(0, Math.floor((sunsetTime - now) / 1000))
  const hours = Math.floor(remainingSeconds / 3600)
  const minutes = Math.floor((remainingSeconds % 3600) / 60)
  const seconds = remainingSeconds % 60
  const remainingText = hours
    ? `일몰까지 ${hours}시간 ${minutes}분 ${seconds}초 남았습니다.`
    : `일몰까지 ${minutes}분 ${seconds}초 남았습니다.`

  const phase = progress < 0.1
    ? 'sunrise'
    : progress < 0.3
      ? 'morning'
      : progress < 0.68
        ? 'midday'
        : progress < 0.84
          ? 'afternoon'
          : 'golden-hour'

  // 정오에 가장 밝고, 일출·일몰로 갈수록 어두워집니다.
  const darkness = Math.max(0.05, 0.55 - Math.sin(progress * Math.PI) * 0.48)
  return { phase, sunX, sunY, darkness, starOpacity: 0, remainingText, dayProgress: progress }
}

// 3. watch() - 선택한 지역이 바뀌었을 때만 이전·현재 지역을 비교해 로그를 남깁니다.
watch(selectedCityInfo, (newCity, oldCity) => {
  if (!newCity) return

  const previousCityName = oldCity?.name ?? '선택 전'
  selectedCityLog.value = `[watch] ${previousCityName} → ${newCity.name} 상세 정보를 열었습니다.`
  console.log(`[watch] 선택 지역 변경: ${previousCityName} → ${newCity.name}`)
})

// 3. watchEffect() - 함수 안에서 사용한 searchQuery를 자동으로 감시합니다.
watchEffect(() => {
  const keyword = searchQuery.value.trim()
  searchEffectLog.value = keyword
    ? `[watchEffect] “${keyword}”에 맞는 지역을 카드에서 필터링합니다.`
    : '[watchEffect] 검색어가 없어 모든 지역을 표시합니다.'
  console.log(searchEffectLog.value)
})

let timerId
let modeTransitionTimerId
let ambientIdleTimerId
let windowMomentTimerId
let windowMomentEnterTimerId
let windowMomentCycleTimerId
let windowBreakTimerId
let windowBreakIntroTimerId
let windowBreakControlTimerId

function waitForModeTransition(milliseconds) {
  return new Promise((resolve) => {
    modeTransitionTimerId = window.setTimeout(resolve, milliseconds)
  })
}

function resetAmbientIdleTimer() {
  window.clearTimeout(ambientIdleTimerId)
  if (viewMode.value !== 'landscape' || isWindowBreakActive.value) return

  ambientIdleTimerId = window.setTimeout(() => {
    isAmbientUiVisible.value = false
    isWindowMomentVisible.value = false
  }, 2_200)
}

function handleAmbientActivity() {
  if (viewMode.value !== 'landscape') return

  if (isWindowBreakActive.value) {
    showWindowBreakControl()
    return
  }

  isAmbientUiVisible.value = true
  resetAmbientIdleTimer()
}

function showWindowMoment() {
  window.clearTimeout(windowMomentTimerId)
  window.clearTimeout(windowMomentEnterTimerId)
  if (viewMode.value !== 'landscape' || isWindowBreakActive.value) return

  isWindowMomentVisible.value = false
  windowMomentEnterTimerId = window.setTimeout(() => {
    isWindowMomentVisible.value = true
    windowMomentTimerId = window.setTimeout(() => {
      isWindowMomentVisible.value = false
    }, 5_000)
  }, 60)
}

function startWindowMomentCycle() {
  window.clearInterval(windowMomentCycleTimerId)
  messageVariationIndex.value = 0
  showWindowMoment()
  windowMomentCycleTimerId = window.setInterval(() => {
    messageVariationIndex.value += 1
  }, 14_000)
}

function showWindowBreakControl() {
  window.clearTimeout(windowBreakControlTimerId)
  isWindowBreakControlVisible.value = true
  windowBreakControlTimerId = window.setTimeout(() => {
    isWindowBreakControlVisible.value = false
  }, 1_800)
}

function finishWindowBreak(showMoment = true) {
  window.clearInterval(windowBreakTimerId)
  window.clearTimeout(windowBreakIntroTimerId)
  window.clearTimeout(windowBreakControlTimerId)
  isWindowBreakActive.value = false
  isWindowBreakIntroVisible.value = false
  isWindowBreakControlVisible.value = false
  windowBreakRemaining.value = 60
  isAmbientUiVisible.value = true
  resetAmbientIdleTimer()
  if (showMoment) startWindowMomentCycle()
}

function startWindowBreak() {
  if (viewMode.value !== 'landscape' || isWindowBreakActive.value) return

  window.clearTimeout(ambientIdleTimerId)
  window.clearTimeout(windowMomentTimerId)
  window.clearTimeout(windowMomentEnterTimerId)
  window.clearInterval(windowMomentCycleTimerId)
  configStore.hideLandscapeInfo()
  isWindowMomentVisible.value = false
  isAmbientUiVisible.value = false
  isWindowBreakActive.value = true
  isWindowBreakIntroVisible.value = true
  windowBreakRemaining.value = 60
  showWindowBreakControl()

  windowBreakIntroTimerId = window.setTimeout(() => {
    isWindowBreakIntroVisible.value = false
  }, 3_500)

  windowBreakTimerId = window.setInterval(() => {
    windowBreakRemaining.value -= 1
    if (windowBreakRemaining.value <= 0) finishWindowBreak()
  }, 1_000)
}

function handleWindowKeydown(event) {
  if (event.key === 'Escape' && isWindowBreakActive.value) finishWindowBreak()
}

watch(viewMode, (mode) => {
  window.clearTimeout(ambientIdleTimerId)
  isAmbientUiVisible.value = true
  if (mode === 'landscape') {
    resetAmbientIdleTimer()
    startWindowMomentCycle()
  } else if (isWindowBreakActive.value) {
    finishWindowBreak(false)
    window.clearInterval(windowMomentCycleTimerId)
  } else {
    window.clearInterval(windowMomentCycleTimerId)
  }
})

watch(windowMomentMessage, () => {
  if (isAmbientUiVisible.value) showWindowMoment()
})

function showDetail(weather) {
  selectedCityInfo.value = weather
  emit('click-detail', weather)
}

function closeDetail() {
  selectedCityInfo.value = null
}

function selectWeatherCard(weather) {
  focusedWeather.value = weather
  selectedDistrictId.value = weather.parentRegionId ? weather.id : ''
  selectedCityLog.value = `[emit] ${weather.name} 카드를 선택했습니다.`
}

async function resetRegionSelection() {
  selectedRegionId.value = ''
  selectedDistrictId.value = ''
  districtWeatherList.value = []
  focusedWeather.value = null
  searchQuery.value = ''
  await nextTick()
  weatherMap.value?.resetView()
}

async function selectRegion(regionId) {
  selectedRegionId.value = regionId
  selectedDistrictId.value = ''
  focusedWeather.value = weatherList.value.find((region) => region.id === regionId) ?? null
  searchQuery.value = ''
  await loadDistrictWeather(regionId)
}

async function openLandscape(weather = null) {
  if (isModeTransitioning.value) return

  landscapeWeather.value = weather
    ?? focusedWeather.value
    ?? selectedRegion.value
    ?? currentLocationWeather.value
    ?? weatherList.value[0]
  configStore.hideLandscapeInfo()
  transitionLabel.value = `${landscapeWeather.value?.name ?? '선택 지역'}의 지금 하늘`
  isModeTransitioning.value = true

  // 클릭 즉시 모드를 바꾸고, 전환 효과는 뒤에서 짧게 마무리합니다.
  try {
    configStore.openLandscapeMode()
    await nextTick()
    await waitForModeTransition(420)
  } finally {
    isModeTransitioning.value = false
  }
}

async function openDashboard() {
  if (isModeTransitioning.value) return

  transitionLabel.value = '전국 날씨 대시보드로 돌아가는 중'
  isModeTransitioning.value = true
  if (isWindowBreakActive.value) finishWindowBreak(false)
  try {
    configStore.openDashboardMode()
    await nextTick()
    weatherMap.value?.resize()
    await waitForModeTransition(420)
  } finally {
    isModeTransitioning.value = false
  }
}

function selectLandscapeRegion(regionId) {
  if (regionId === 'my-location') {
    landscapeWeather.value = currentLocationWeather.value
    return
  }

  if (regionId.startsWith('district:')) {
    const districtId = regionId.replace('district:', '')
    const district = districtWeatherList.value.find((item) => item.id === districtId)
    if (district) landscapeWeather.value = district
    return
  }

  const weather = weatherList.value.find((item) => item.id === regionId)
  if (weather) landscapeWeather.value = weather
}

function formatKoreaTime(isoTime) {
  if (!isoTime) return '—'

  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(`${isoTime}+09:00`))
}

function formatLiveClock() {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(currentTime.value)
}

function formatVisibility(value) {
  if (!Number.isFinite(Number(value))) return '—'
  return `${Math.round(Number(value) / 100) / 10} km`
}

function formatDuration(seconds) {
  if (!Number.isFinite(Number(seconds))) return '—'
  const hours = Math.floor(Number(seconds) / 3600)
  const minutes = Math.round((Number(seconds) % 3600) / 60)
  return `${hours}시간 ${minutes}분`
}

function getBrowserPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('이 브라우저는 위치 정보를 지원하지 않습니다.'))
      return
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10_000,
      maximumAge: 10 * 60_000,
    })
  })
}

function findNearestAddress(latitude, longitude) {
  const candidates = KOREA_REGIONS.flatMap((region) => {
    const districts = REGION_DISTRICTS[region.id] ?? []
    return districts.length
      ? districts.map((district) => ({ ...district, region }))
      : [{ ...region, region }]
  })

  const nearest = candidates.reduce((closest, candidate) => {
    const distance = (candidate.latitude - latitude) ** 2 + (candidate.longitude - longitude) ** 2
    return distance < closest.distance ? { candidate, distance } : closest
  }, { candidate: null, distance: Number.POSITIVE_INFINITY }).candidate

  const region = nearest?.region ?? KOREA_REGIONS[0]
  const districtName = nearest && nearest.id !== region.id ? nearest.name : ''
  return {
    region,
    label: districtName ? `${region.name} ${districtName}` : region.name,
  }
}

function useSeoulFallback() {
  const seoul = weatherList.value.find((weather) => weather.id === 'seoul')

  if (seoul?.sunrise && seoul?.sunset) {
    currentLocationWeather.value = { ...seoul, id: 'my-location', name: '서울특별시' }
    locationStatus.value = '위치를 확인하지 못해 서울특별시 날씨를 표시합니다.'
  } else {
    locationStatus.value = '서울특별시의 날씨 정보를 준비하는 중입니다.'
  }
}

// 브라우저 위치 좌표를 기상청 격자로 변환해 현재 위치의 초단기예보를 요청합니다.
async function loadCurrentLocationWeather() {
  locationStatus.value = '현재 지역을 확인하는 중입니다...'

  if (weatherApiUnavailable.value) {
    useSeoulFallback()
    return
  }

  try {
    const position = await getBrowserPosition()
    const { latitude, longitude } = position.coords
    const { region, label } = findNearestAddress(latitude, longitude)
    const data = await fetchKmaWeather({
      id: 'my-location',
      name: label,
      city: region.name,
      parentRegionId: region.id,
      latitude,
      longitude,
    }, 0, region.id)
    currentLocationWeather.value = {
      ...data,
      id: 'my-location',
      name: label,
      city: region.name,
      parentRegionId: region.id,
    }
    locationStatus.value = `${label}의 최신 날씨와 일출·일몰을 반영합니다.`
  } catch (error) {
    console.warn('현재 위치를 사용할 수 없어 서울 기준으로 표시합니다.', error)
    useSeoulFallback()
  }
}

async function fetchWeatherForLocations(locations, parentRegionId = '') {
  return fetchKmaWeatherForLocations(locations, parentRegionId)
}

function readWeatherCache(key, allowStale = false) {
  try {
    const rawCache = window.localStorage.getItem(`${WEATHER_CACHE_PREFIX}:${key}`)
    if (!rawCache) return null

    const cached = JSON.parse(rawCache)
    const cacheAge = Date.now() - Number(cached.timestamp)
    if (!allowStale && cacheAge > WEATHER_CACHE_MAX_AGE) return null
    if (!Array.isArray(cached.data)) return null
    return cached.data
  } catch {
    return null
  }
}

function writeWeatherCache(key, data) {
  try {
    window.localStorage.setItem(`${WEATHER_CACHE_PREFIX}:${key}`, JSON.stringify({
      timestamp: Date.now(),
      data,
    }))
  } catch {
    // 저장 공간을 사용할 수 없는 브라우저에서는 메모리 상태만 사용합니다.
  }
}

function getFallbackWeatherList(locations, parentRegionId = '') {
  return locations.map((location, index) => createFallbackWeather(location, index, parentRegionId))
}

async function loadDistrictWeather(regionId) {
  const cached = districtWeatherCache.get(regionId)
  if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
    districtWeatherList.value = cached.data
    focusedWeather.value = cached.data[0] ?? focusedWeather.value
    return
  }

  const districts = REGION_DISTRICTS[regionId] ?? []
  const persistentCacheKey = `district:${regionId}`
  const persistentCache = readWeatherCache(persistentCacheKey)

  if (persistentCache) {
    districtWeatherList.value = persistentCache
    focusedWeather.value = persistentCache[0] ?? focusedWeather.value
    districtWeatherCache.set(regionId, { data: persistentCache, timestamp: Date.now() })
    if (persistentCache.some((weather) => weather.dataSource === 'seasonal-fallback')) {
      errorMessage.value = '저장된 계절·좌표 기준 기본 데이터를 표시합니다.'
    }
    return
  }

  isDistrictLoading.value = true
  const region = weatherList.value.find((item) => item.id === regionId)
  const locations = districts.map((district) => ({ ...district, city: region?.name ?? '', regionName: region?.name }))

  if (weatherApiUnavailable.value) {
    const fallbackData = getFallbackWeatherList(locations, regionId)
    districtWeatherList.value = fallbackData
    focusedWeather.value = fallbackData[0] ?? region ?? null
    districtWeatherCache.set(regionId, { data: fallbackData, timestamp: Date.now() })
    writeWeatherCache(persistentCacheKey, fallbackData)
    errorMessage.value = '기상청 응답을 받을 수 없어 계절·좌표 기준 기본 데이터를 표시합니다.'
    isDistrictLoading.value = false
    return
  }

  try {
    const result = await fetchWeatherForLocations(locations, regionId)
    districtWeatherList.value = result
    focusedWeather.value = result[0] ?? region ?? null
    districtWeatherCache.set(regionId, { data: result, timestamp: Date.now() })
    writeWeatherCache(persistentCacheKey, result)
    if (result.some((weather) => weather.dataSource === 'seasonal-fallback')) {
      errorMessage.value = '일부 지역은 기상청 응답 지연으로 기본 데이터를 표시합니다.'
    } else {
      errorMessage.value = ''
    }
  } catch (error) {
    weatherApiUnavailable.value = true
    const staleCache = readWeatherCache(persistentCacheKey, true)
    const fallbackData = staleCache ?? getFallbackWeatherList(locations, regionId)
    districtWeatherList.value = fallbackData
    focusedWeather.value = fallbackData[0] ?? region ?? null
    districtWeatherCache.set(regionId, { data: fallbackData, timestamp: Date.now() })
    writeWeatherCache(persistentCacheKey, fallbackData)
    errorMessage.value = staleCache
      ? '기상청 응답을 받을 수 없어 최근 저장된 지역 데이터를 표시합니다.'
      : '기상청 응답을 받을 수 없어 계절·좌표 기준 기본 데이터를 표시합니다.'
    console.warn(error.message)
  } finally {
    isDistrictLoading.value = false
  }
}

async function loadWeather() {
  const freshCache = readWeatherCache('national')

  if (freshCache) {
    weatherList.value = freshCache
    if (freshCache.some((weather) => weather.dataSource === 'seasonal-fallback')) {
      errorMessage.value = '저장된 계절·좌표 기준 기본 데이터를 표시합니다.'
    }
    isLoading.value = false
    return
  }

  if (weatherApiUnavailable.value) {
    const staleCache = readWeatherCache('national', true)
    weatherList.value = staleCache ?? getFallbackWeatherList(KOREA_REGIONS)
    writeWeatherCache('national', weatherList.value)
    errorMessage.value = staleCache
      ? '기상청 응답을 받을 수 없어 최근 저장된 날씨를 표시합니다.'
      : '기상청 응답을 받을 수 없어 계절·좌표 기준 기본 데이터를 표시합니다.'
    isLoading.value = false
    return
  }

  try {
    weatherList.value = await fetchWeatherForLocations(weatherList.value)
    writeWeatherCache('national', weatherList.value)
    if (weatherList.value.some((weather) => weather.dataSource === 'seasonal-fallback')) {
      errorMessage.value = '일부 지역은 기상청 응답 지연으로 기본 데이터를 표시합니다.'
    } else {
      errorMessage.value = ''
    }
  } catch (error) {
    weatherApiUnavailable.value = true
    const staleCache = readWeatherCache('national', true)
    weatherList.value = staleCache ?? getFallbackWeatherList(KOREA_REGIONS)
    writeWeatherCache('national', weatherList.value)
    errorMessage.value = staleCache
      ? '기상청 응답을 받을 수 없어 최근 저장된 날씨를 표시합니다.'
      : '기상청 응답을 받을 수 없어 계절·좌표 기준 기본 데이터를 표시합니다.'
    console.warn(error.message)
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  await loadWeather()
  await loadCurrentLocationWeather()
  timerId = window.setInterval(() => {
    currentTime.value = new Date()
  }, 1_000)
  window.addEventListener('keydown', handleWindowKeydown)
})

onBeforeUnmount(() => {
  window.clearInterval(timerId)
  window.clearTimeout(modeTransitionTimerId)
  window.clearTimeout(ambientIdleTimerId)
  window.clearTimeout(windowMomentTimerId)
  window.clearTimeout(windowMomentEnterTimerId)
  window.clearInterval(windowMomentCycleTimerId)
  window.clearInterval(windowBreakTimerId)
  window.clearTimeout(windowBreakIntroTimerId)
  window.clearTimeout(windowBreakControlTimerId)
  window.removeEventListener('keydown', handleWindowKeydown)
})
</script>

<template>
  <main class="weather-page" :class="[localLiveScene?.phase, `condition-${activeVideoGroup}`, {
    'is-landscape': viewMode === 'landscape',
    'is-ambient-idle': viewMode === 'landscape' && !isAmbientUiVisible,
    'is-landscape-detail-open': viewMode === 'landscape' && isLandscapeInfoOpen,
    'is-window-break': viewMode === 'landscape' && isWindowBreakActive,
  }]" @pointermove="handleAmbientActivity" @pointerdown="handleAmbientActivity"
    @touchstart.passive="handleAmbientActivity" :style="liveSkyStyle">
    <div v-if="localLiveScene" class="site-sky" aria-hidden="true">
      <WeatherVideoBackground :group="activeVideoGroup" :sources="activeVideoSources" :opacity="cloudScene.videoOpacity"
        :weather="activeSkyWeather" @video-error="videoErrorMessage = '배경 영상을 불러오지 못해 기본 하늘을 표시합니다.'" />
      <div class="weather-atmosphere"></div>
      <div class="phase-light"></div>
      <div class="site-stars"></div>
      <LiveSun :x="localLiveScene.sunX" :y="localLiveScene.sunY" :opacity="cloudScene.sunOpacity"
        :phase="localLiveScene.phase" />
      <div class="horizon-haze"></div>
    </div>

    <div v-show="viewMode === 'dashboard'" class="dashboard-shell">
      <nav class="mode-switcher" aria-label="화면 모드 선택">
        <span>VIEW MODE</span>
        <button class="active" aria-current="page">날씨 홈</button>
        <button @click="openLandscape()">디지털 창문</button>
      </nav>

      <header class="hero">
        <div class="brand-block">
          <p class="eyebrow">KOREA WEATHER DASHBOARD</p>
          <h1>대한민국 지역별 날씨</h1>
          <p class="hero-copy">현재 위치의 해와 전국 17개 시·도 날씨를 한 화면에서 확인하세요.</p>
        </div>

        <div class="live-sky-status">
          <div class="live-status-topline">
            <span class="live-indicator"><i></i> NOW SKY</span>
            <strong>{{ formatLiveClock() }}</strong>
          </div>
          <p v-if="currentLocationWeather">
            {{ currentLocationWeather.name }} · {{ currentLocationWeather.status }} ·
            {{ displayTemp(currentLocationWeather.temp) }}{{ unitSymbol }}
          </p>
          <p v-if="localLiveScene" class="sun-timeline">{{ localLiveScene.remainingText }}</p>
          <small>{{ locationStatus }}</small>
          <button class="location-refresh" @click="loadCurrentLocationWeather">현재 위치 갱신</button>
        </div>

        <BaseDashboardCard variant="glass" class="search-panel">
          <SearchBar :search-query="searchQuery" @update:search-query="searchQuery = $event" />
        </BaseDashboardCard>
      </header>

      <section class="content-grid">
        <article class="map-panel">
          <div class="panel-heading">
            <div>
              <p class="panel-label">WEATHER MAP</p>
              <h2>광역시·도 대표 날씨 지도</h2>
            </div>
            <div class="map-heading-actions">
              <button v-if="selectedRegion" class="map-reset-button" @click="resetRegionSelection">
                ← 전국 보기
              </button>
              <span v-else class="map-guide">핀을 선택하면 시·군·구를 불러옵니다</span>
            </div>
          </div>

          <WeatherMap ref="weatherMap" :regions="weatherList" :selected-region-id="selectedRegionId"
            @select-region="selectRegion" />

          <Transition name="map-live-entry">
            <button v-if="selectedRegion" class="map-live-entry" type="button" @click="openLandscape(selectedRegion)">
              <span><i></i> TODAY'S SKY WINDOW</span>
              <strong>{{ selectedRegion.name }}의 지금으로 들어가기</strong>
              <small>{{ selectedRegion.sceneLabel }} · {{ selectedRegion.status }} · {{ displayTemp(selectedRegion.temp)
              }}{{ unitSymbol }}</small>
              <b>디지털 창문 열기 →</b>
            </button>
          </Transition>
        </article>

        <aside class="region-sidebar" aria-label="지역별 날씨 목록">
          <section class="summary-panel">
            <div class="compact-status-heading">
              <div>
                <p class="panel-label">CURRENT WEATHER</p>
                <h2>{{ statusWeather?.name ?? '현재 현황' }}</h2>
                <p>{{ statusWeather?.status ?? '불러오는 중' }}</p>
              </div>
              <p class="summary-number">{{ displayTemp(statusWeather?.temp) }}<span>{{ unitSymbol }}</span></p>
            </div>
            <div class="status-primary-row">
              <span>최고 {{ displayTemp(statusWeather?.tempMax) }}{{ unitSymbol }}</span>
              <span>최저 {{ displayTemp(statusWeather?.tempMin) }}{{ unitSymbol }}</span>
              <span>강수 {{ statusWeather?.precipitationProbability ?? '—' }}%</span>
            </div>
            <div class="status-tags">
              <span>습도 {{ statusWeather?.humidity ?? '—' }}%</span>
              <span>구름 {{ statusWeather?.cloudCover ?? '—' }}%</span>
              <span>풍속 {{ statusWeather?.windSpeed ?? '—' }} km/h</span>
              <span>체감 {{ displayTemp(statusWeather?.feelsLike) }}{{ unitSymbol }}</span>
            </div>
            <p class="national-average">전국 평균 {{ displayTemp(averageTemperature, 1) }}{{ unitSymbol }} · 평균보다 높은 지역 {{
              warmerRegions.length }}곳
            </p>
          </section>

          <BaseDashboardCard class="sidebar-list-panel">
            <template #header>
              <div class="sidebar-list-heading">
                <div>
                  <p class="panel-label">REGION WEATHER</p>
                  <div class="breadcrumb" aria-label="현재 지역 단계">
                    <button v-if="selectedRegion" @click="resetRegionSelection">전국</button>
                    <span v-else>전국</span>
                    <template v-if="selectedRegion">
                      <i>›</i><strong>{{ selectedRegion.name }}</strong>
                    </template>
                  </div>
                  <h2>{{ selectedRegion ? `${selectedRegion.name} 시·군·구` : '광역시·도 날씨' }}</h2>
                </div>
                <span>{{ filteredWeatherList.length }}곳</span>
              </div>
            </template>

            <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>

            <p v-if="isDistrictLoading" class="district-loading">시·군·구 날씨를 불러오는 중입니다…</p>

            <ul v-else-if="filteredWeatherList.length" class="sidebar-weather-list">
              <WeatherCard v-for="weather in filteredWeatherList" :key="weather.id" :weather="weather"
                :average-temperature="averageTemperature" @select-card="selectWeatherCard" @click-detail="showDetail"
                @open-landscape="openLandscape" />
            </ul>

            <template #footer>
              <p v-if="!isDistrictLoading && !filteredWeatherList.length" class="empty-message">
                검색 결과가 없습니다. 다른 지역 이름을 입력해 보세요.
              </p>
            </template>
          </BaseDashboardCard>
        </aside>
      </section>

    </div>

    <section v-show="viewMode === 'landscape'" class="landscape-view" aria-label="선택 지역의 디지털 창문">
      <div v-show="!isWindowMomentVisible" class="ambient-glance" aria-live="polite">
        <time>{{ formatLiveClock() }}</time>
        <p>{{ ambientMessage }}</p>
        <small>{{ workdayState.label }} · {{ workdayState.countdown }}</small>
      </div>

      <nav class="landscape-toolbar">
        <button class="back-dashboard" @click="openDashboard">← 날씨 홈</button>

        <label>
          <span>하늘 지역</span>
          <select :value="activeSkyWeather?.parentRegionId ? `district:${activeSkyWeather.id}` : activeSkyWeather?.id"
            @change="selectLandscapeRegion($event.target.value)">
            <option value="my-location">{{ currentLocationWeather?.name ?? '현재 지역' }}</option>
            <option v-for="weather in weatherList" :key="weather.id" :value="weather.id">
              {{ weather.name }} · {{ weather.city }}
            </option>
            <optgroup v-if="selectedRegion && districtWeatherList.length" :label="`${selectedRegion.name} 시·군·구`">
              <option v-for="district in districtWeatherList" :key="district.id" :value="`district:${district.id}`">
                {{ selectedRegion.name }} · {{ district.name }}
              </option>
            </optgroup>
          </select>
        </label>

        <div class="landscape-clock">
          <span><i></i> NOW</span>
          <strong>{{ formatLiveClock() }}</strong>
        </div>

        <button class="landscape-info-toggle" :aria-expanded="isLandscapeInfoOpen"
          aria-controls="landscape-weather-info" @click="configStore.toggleLandscapeInfo()">
          {{ isLandscapeInfoOpen ? '상세 정보 닫기' : '상세 정보 보기' }}
        </button>

        <button class="window-break-button" @click="startWindowBreak">1분 창밖 보기</button>
      </nav>

      <article v-if="activeSkyWeather" class="landscape-primary-summary"
        :class="{ 'is-detail-open': isLandscapeInfoOpen }" aria-label="현재 날씨 핵심 요약">
        <p class="landscape-primary-location">⌖ {{ activeSkyWeather.name }}</p>
        <div class="landscape-primary-weather">
          <strong>{{ displayTemp(activeSkyWeather.temp) }}<small>{{ unitSymbol }}</small></strong>
          <p>{{ activeSkyWeather.status }}</p>
          <small>{{ sceneSummary }} · {{ activeWeatherBasis }}</small>
        </div>
        <p v-if="localLiveScene" class="landscape-primary-sun">{{ localLiveScene.remainingText }}</p>

        <div class="landscape-quick-strip" aria-label="현재 하늘을 결정하는 핵심 지수">
          <div v-for="signal in primarySkySignals" :key="signal.label">
            <span>{{ signal.label }}</span>
            <strong>{{ signal.value }}</strong>
          </div>
        </div>

        <p v-if="commuteGuide" class="primary-commute-summary">
          <span>18시 퇴근길</span>
          <strong>{{ commuteGuide.summary }}</strong>
        </p>

        <button class="primary-detail-button" @click="configStore.toggleLandscapeInfo()">
          {{ isLandscapeInfoOpen ? '상세 정보 닫기' : '상세 정보 펼치기' }}
        </button>
      </article>

      <article v-if="activeSkyWeather" id="landscape-weather-info" class="landscape-info"
        :class="{ 'landscape-info--hidden': !isLandscapeInfoOpen }" :aria-hidden="!isLandscapeInfoOpen">
        <header class="landscape-detail-heading">
          <div>
            <span>TODAY'S DETAIL</span>
            <strong>{{ activeSkyWeather.name }} 상세 날씨</strong>
          </div>
          <button aria-label="상세 정보 닫기" @click="configStore.toggleLandscapeInfo()">×</button>
        </header>

        <div class="weather-at-a-glance" :class="`weather-at-a-glance--${activeWeatherScene.group}`">
          <span aria-hidden="true">{{ activeWeatherScene.icon }}</span>
          <div>
            <strong>{{ activeWeatherScene.label }}</strong>
            <small>{{ activeWeatherScene.detail }}</small>
          </div>
          <i>{{ Math.round(activeSkyWeather.cloudCover ?? 0) }}% cloud</i>
        </div>

        <section class="day-rhythm-panel" aria-label="오늘 하루 진행도">
          <div class="day-rhythm-heading">
            <div>
              <span>DAY RHYTHM</span>
              <strong>{{ workdayState.label }}</strong>
            </div>
            <time>{{ workdayState.countdown }}</time>
          </div>
          <div class="day-rhythm-track">
            <i :style="{ width: `${workdayState.progress}%` }"></i>
            <b :style="{ left: `${workdayState.progress}%` }"></b>
          </div>
          <div class="day-rhythm-labels">
            <span>09:00 업무 시작</span>
            <small>{{ Math.round(workdayState.progress) }}% 지남</small>
            <span>18:00 퇴근</span>
          </div>
        </section>

        <section v-if="commuteGuide" class="commute-guide" aria-label="퇴근길 날씨 안내">
          <div class="commute-guide-heading">
            <div>
              <span>WAY HOME</span>
              <strong>{{ commuteGuide.headline }}</strong>
            </div>
            <small>{{ commuteGuide.source }}</small>
          </div>
          <p class="commute-weather-line">{{ commuteGuide.weatherLine }}</p>
          <p>{{ commuteGuide.daylightText }}</p>
        </section>

        <div class="landscape-detail-grid">
          <div><span>체감</span><strong>{{ displayTemp(activeSkyWeather.feelsLike) }}{{ unitSymbol }}</strong></div>
          <div><span>습도</span><strong>{{ activeSkyWeather.humidity ?? '—' }}%</strong></div>
          <div><span>풍속</span><strong>{{ activeSkyWeather.windSpeed ?? '—' }} km/h</strong></div>
          <div><span>구름</span><strong>{{ activeSkyWeather.cloudCover ?? '—' }}%</strong></div>
          <div><span>일출</span><strong>{{ formatKoreaTime(activeSkyWeather.sunrise) }}</strong></div>
          <div><span>일몰</span><strong>{{ formatKoreaTime(activeSkyWeather.sunset) }}</strong></div>
        </div>

        <details class="scene-index-disclosure">
          <summary>하늘 장면이 계산된 방식 보기</summary>
          <section class="scene-index-panel" aria-label="하늘 장면 계산 지수">
            <div class="scene-index-heading">
              <span>SKY INTERPRETATION ENGINE</span>
              <strong>{{ sceneSummary }}</strong>
            </div>
            <div class="scene-index-grid">
              <div v-for="indicator in sceneIndicators" :key="indicator.label" class="scene-index-item">
                <span>{{ indicator.label }}</span>
                <strong>{{ indicator.value }}</strong>
                <i><b :style="{ width: `${indicator.level}%` }"></b></i>
              </div>
            </div>
            <p>실시간 기상 수치를 장면의 밝기, 구름 움직임, 태양 위치와 날씨 효과로 변환합니다.</p>
          </section>
        </details>

        <small v-if="videoErrorMessage" class="video-error">{{ videoErrorMessage }}</small>
      </article>
    </section>

    <Transition name="window-moment">
      <p v-if="isWindowMomentVisible && viewMode === 'landscape' && !isWindowBreakActive" class="window-moment-message"
        aria-live="polite">
        {{ windowMomentMessage }}
      </p>
    </Transition>

    <div v-if="isWindowBreakActive" class="window-break-layer" aria-live="polite">
      <Transition name="window-break-copy">
        <div v-if="isWindowBreakIntroVisible" class="window-break-intro">
          <span>ONE MINUTE WINDOW</span>
          <p>잠시 화면 너머의 하늘을 바라보세요.</p>
        </div>
      </Transition>

      <div v-if="windowBreakRemaining <= 5" class="window-break-ending" :style="windowBreakProgressStyle">
        <strong>{{ windowBreakRemaining }}</strong>
      </div>

      <button class="window-break-exit" :class="{ 'is-visible': isWindowBreakControlVisible }"
        @click="finishWindowBreak()">
        1분 보기 종료
      </button>
    </div>

    <Transition name="sky-shift">
      <div v-if="isModeTransitioning" class="mode-transition-curtain"
        :class="`mode-transition-curtain--${transitionRegionalIdentity.sceneType}`" role="status" aria-live="polite">
        <div class="transition-map-rings" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="transition-content">
          <span>OPENING WINDOW MODE</span>
          <div class="transition-weather-symbol" aria-hidden="true">{{ transitionWeatherScene.icon }}</div>
          <h2>{{ transitionRegionalIdentity.name }}</h2>
          <p>{{ transitionLabel }}</p>
          <small>{{ transitionRegionalIdentity.sceneLabel }} · {{ transitionWeatherScene.label }}</small>
        </div>
        <span class="transition-progress"></span>
      </div>
    </Transition>

  </main>

  <Teleport to="body">
    <div v-if="selectedCityInfo" class="modal-backdrop" @click.self="closeDetail">
      <section class="weather-modal" role="dialog" aria-modal="true" :aria-label="`${selectedCityInfo.name} 날씨 상세 정보`">
        <button class="modal-close" aria-label="상세 정보 닫기" @click="closeDetail">×</button>

        <p class="panel-label">WEATHER DETAILS</p>
        <div class="modal-title-row">
          <div>
            <h2>{{ selectedCityInfo.name }}</h2>
            <p>{{ selectedCityInfo.city }} · {{ selectedCityInfo.status }}</p>
          </div>
          <p class="modal-temperature">{{ displayTemp(selectedCityInfo.temp) }}<span>{{ unitSymbol }}</span></p>
        </div>

        <div class="detail-grid">
          <div class="detail-item">
            <span>🌡️ 체감 온도</span>
            <strong>{{ displayTemp(selectedCityInfo.feelsLike) }}{{ unitSymbol }}</strong>
          </div>
          <div class="detail-item">
            <span>💧 습도</span>
            <strong>{{ selectedCityInfo.humidity ?? '—' }}%</strong>
          </div>
          <div class="detail-item">
            <span>💨 풍속</span>
            <strong>{{ selectedCityInfo.windSpeed ?? '—' }} km/h</strong>
          </div>
          <div class="detail-item">
            <span>🌧️ 강수량</span>
            <strong>{{ selectedCityInfo.precipitation ?? '—' }} mm</strong>
          </div>
          <div class="detail-item">
            <span>☁️ 구름량</span>
            <strong>{{ selectedCityInfo.cloudCover ?? '—' }}%</strong>
          </div>
          <div class="detail-item">
            <span>🌗 시간대</span>
            <strong>{{ selectedCityInfo.isDay === 1 ? '낮' : '밤' }}</strong>
          </div>
          <div class="detail-item">
            <span>🌡️ 오늘 최고 / 최저</span>
            <strong>{{ displayTemp(selectedCityInfo.tempMax) }}{{ unitSymbol }} / {{
              displayTemp(selectedCityInfo.tempMin)
            }}{{ unitSymbol }}</strong>
          </div>
          <div class="detail-item">
            <span>☔ 강수 확률 / 합계</span>
            <strong>{{ selectedCityInfo.precipitationProbability ?? '—' }}% / {{ selectedCityInfo.precipitationSum ??
              '—'
            }} mm</strong>
          </div>
          <div class="detail-item">
            <span>🧭 풍향 / 돌풍</span>
            <strong>{{ selectedCityInfo.windDirection ?? '—' }}° / {{ selectedCityInfo.windGusts ?? '—' }} km/h</strong>
          </div>
          <div class="detail-item">
            <span>🔭 가시거리</span>
            <strong>{{ formatVisibility(selectedCityInfo.visibility) }}</strong>
          </div>
          <div class="detail-item">
            <span>🧭 해면 기압</span>
            <strong>{{ selectedCityInfo.pressureMsl ?? '—' }} hPa</strong>
          </div>
          <div class="detail-item">
            <span>☀️ 자외선 지수</span>
            <strong>{{ selectedCityInfo.uvIndexMax ?? '—' }}</strong>
          </div>
          <div class="detail-item">
            <span>🌅 일출 / 일몰</span>
            <strong>{{ formatKoreaTime(selectedCityInfo.sunrise) }} / {{ formatKoreaTime(selectedCityInfo.sunset)
            }}</strong>
          </div>
          <div class="detail-item">
            <span>🌞 예상 일조 시간</span>
            <strong>{{ formatDuration(selectedCityInfo.sunshineDuration) }}</strong>
          </div>
        </div>

        <p class="detail-summary">
          {{ selectedCityInfo.name }}의 현재 날씨는 <strong>{{ selectedCityInfo.status }}</strong>이며,
          기온은 <strong>{{ displayTemp(selectedCityInfo.temp) }}{{ unitSymbol }}</strong>입니다.
        </p>
      </section>
    </div>
  </Teleport>

</template>

<style scoped>
:global(*) {
  box-sizing: border-box;
}

:global(body) {
  margin: 0;
  min-width: 320px;
  background: #eef4fb;
  color: #152238;
  font-family: Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

:global(#app) {
  width: 100%;
  max-width: none;
  padding: 0;
}

.weather-page {
  word-break: keep-all;
  width: 100%;
  margin: 0 auto;
  padding: 30px clamp(20px, 3vw, 68px) 64px;
}

.hero {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 32px;
  padding: 42px;
  border-radius: 28px;
  background: linear-gradient(125deg, #123c83, #2563eb 56%, #4f46e5);
  color: white;
  box-shadow: 0 18px 42px rgba(30, 64, 175, 0.22);
}

.eyebrow,
.panel-label {
  margin: 0 0 9px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.15em;
}

.eyebrow {
  color: #bfdbfe;
}

h1,
h2,
h3,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 10px;
  font-size: clamp(32px, 4.1vw, 52px);
  letter-spacing: -0.06em;
}

.hero-copy {
  margin: 0;
  color: #dbeafe;
  font-size: 16px;
}

.search-panel {
  width: min(100%, 360px);
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.32);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(8px);
}

.search-panel label {
  display: block;
  margin-bottom: 9px;
  color: #dbeafe;
  font-size: 13px;
  font-weight: 700;
}

.search-panel input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.48);
  border-radius: 10px;
  outline: none;
  background: rgba(15, 23, 42, 0.14);
  color: white;
  font-size: 15px;
}

.search-panel input::placeholder {
  color: #dbeafe;
}

.search-panel p {
  margin: 9px 0 0;
  color: #dbeafe;
  font-size: 12px;
}

.location-live-panel {
  margin-top: 24px;
  overflow: hidden;
  border-radius: 24px;
  box-shadow: 0 16px 38px rgba(15, 23, 42, 0.18);
}

.dashboard-live-scene {
  min-height: 340px;
}

.live-scene-copy {
  position: absolute;
  bottom: 28px;
  left: 32px;
  z-index: 2;
  color: white;
  text-shadow: 0 2px 14px rgba(15, 23, 42, 0.58);
}

.live-scene-copy p {
  margin-bottom: 8px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
}

.live-scene-copy h2 {
  margin-bottom: 9px;
  font-size: clamp(27px, 3.5vw, 42px);
}

.live-scene-copy strong,
.live-scene-copy span,
.live-scene-copy small {
  display: block;
}

.live-scene-copy strong {
  margin-bottom: 5px;
  font-size: 16px;
}

.live-scene-copy span,
.live-scene-copy small {
  color: rgba(255, 255, 255, 0.84);
  font-size: 13px;
}

.live-scene-copy small {
  margin-top: 8px;
  font-size: 11px;
}

.location-refresh {
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 2;
  width: auto;
  padding: 9px 12px;
  border: 1px solid rgba(255, 255, 255, 0.48);
  background: rgba(15, 23, 42, 0.32);
  backdrop-filter: blur(6px);
}

.location-refresh:hover {
  background: rgba(15, 23, 42, 0.56);
}

.location-loading {
  display: grid;
  min-height: 220px;
  place-content: center;
  gap: 8px;
  padding: 24px;
  background: linear-gradient(125deg, #172554, #1d4ed8);
  color: white;
  text-align: center;
}

.location-loading span {
  color: #dbeafe;
  font-size: 13px;
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(390px, 1fr);
  gap: clamp(18px, 2vw, 34px);
  margin-top: 24px;
  align-items: stretch;
}

.map-panel,
.summary-panel,
.weather-section {
  border: 1px solid #dbe5f0;
  border-radius: 22px;
  background: white;
  box-shadow: 0 8px 28px rgba(15, 23, 42, 0.06);
}

.map-panel {
  position: relative;
  display: flex;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.map-live-entry {
  position: absolute;
  z-index: 700;
  right: 22px;
  bottom: 22px;
  display: grid;
  width: min(390px, calc(100% - 44px));
  gap: 5px;
  padding: 18px 20px;
  border: 1px solid rgba(255, 255, 255, .55);
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(8, 30, 54, .92), rgba(19, 68, 112, .88));
  box-shadow: 0 22px 52px rgba(3, 15, 30, .3);
  color: white;
  cursor: pointer;
  text-align: left;
  backdrop-filter: blur(14px);
}

.map-live-entry>span {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #a7f3d0;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: .14em;
}

.map-live-entry>span i,
.local-scene-label i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #4ade80;
  box-shadow: 0 0 0 5px rgba(74, 222, 128, .13), 0 0 14px rgba(74, 222, 128, .58);
}

.map-live-entry strong {
  margin-top: 3px;
  font-size: 17px;
  letter-spacing: -.035em;
}

.map-live-entry small {
  color: rgba(255, 255, 255, .7);
  line-height: 1.45;
}

.map-live-entry b {
  margin-top: 5px;
  color: white;
  font-size: 11px;
}

.map-live-entry:hover {
  background: linear-gradient(135deg, rgba(8, 30, 54, .97), rgba(29, 93, 148, .94));
  transform: translateY(-2px);
}

.map-live-entry-enter-active,
.map-live-entry-leave-active {
  transition: opacity .28s ease, transform .35s cubic-bezier(.2, .8, .2, 1);
}

.map-live-entry-enter-from,
.map-live-entry-leave-to {
  opacity: 0;
  transform: translateY(18px) scale(.96);
}

.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 24px 26px 18px;
}

.panel-label {
  color: #64748b;
}

h2 {
  margin-bottom: 0;
  font-size: 23px;
  letter-spacing: -0.04em;
}

.map-guide {
  padding: 8px 10px;
  border-radius: 999px;
  background: #eff6ff;
  color: #2563eb;
  font-size: 12px;
  font-weight: 700;
}

.map-heading-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.map-reset-button {
  width: auto;
  padding: 9px 12px;
  border: 1px solid #bfdbfe;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 800;
}

.map-reset-button:hover {
  background: #dbeafe;
}

.weather-map {
  height: 700px;
  border-top: 1px solid #e2e8f0;
}

.region-sidebar {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.summary-panel {
  padding: 25px;
  background: linear-gradient(155deg, #ffffff, #eef6ff);
}

.summary-number {
  margin: 22px 0 8px;
  color: #1d4ed8;
  font-size: 64px;
  font-weight: 800;
  letter-spacing: -0.08em;
}

.summary-number span {
  margin-left: 8px;
  color: #64748b;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.summary-copy {
  color: #64748b;
  font-size: 14px;
  line-height: 1.65;
}

.loading-text,
.loaded-text {
  margin: 16px 0 0;
  padding: 10px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
}

.above-average-title {
  margin: 18px 0 7px;
  color: #1e293b;
  font-size: 13px;
  font-weight: 800;
}

.above-average-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.above-average-tags span {
  padding: 6px 9px;
  border: 1px solid #fed7aa;
  border-radius: 999px;
  background: #fff7ed;
  color: #c2410c;
  font-size: 12px;
  font-weight: 800;
}

.above-average-empty {
  margin: 0;
  color: #64748b;
  font-size: 12px;
}

.loading-text {
  background: #fef3c7;
  color: #a16207;
}

.loaded-text {
  background: #dcfce7;
  color: #15803d;
}

.sidebar-list-panel {
  overflow: hidden;
  border: 1px solid #dbe5f0;
  border-radius: 22px;
  background: white;
  box-shadow: 0 8px 28px rgba(15, 23, 42, 0.06);
}

.sidebar-list-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 20px 15px;
  border-bottom: 1px solid #e2e8f0;
}

.sidebar-list-heading h2 {
  font-size: 19px;
}

.sidebar-list-heading>span {
  padding: 6px 8px;
  border-radius: 999px;
  background: #eff6ff;
  color: #2563eb;
  font-size: 12px;
  font-weight: 800;
}

.sidebar-weather-list {
  display: grid;
  gap: 10px;
  max-height: 465px;
  margin: 0;
  padding: 12px;
  overflow-y: auto;
  list-style: none;
}

.sidebar-weather-card {
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: linear-gradient(145deg, #f8fbff, #ffffff);
}

.sidebar-card-main {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
}

.sidebar-city {
  margin-bottom: 3px;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.sidebar-weather-card h3 {
  margin-bottom: 0;
  color: #1e293b;
  font-size: 16px;
  letter-spacing: -0.04em;
}

.sidebar-temperature {
  margin-bottom: 0;
  color: #1d4ed8;
  font-size: 28px;
  font-weight: 800;
  letter-spacing: -0.07em;
}

.sidebar-temperature span {
  margin-left: 2px;
  color: #64748b;
  font-size: 12px;
  letter-spacing: 0;
}

.sidebar-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 12px 0;
}

.warmer-pill {
  padding: 5px 8px;
  border-radius: 999px;
  background: #fff7ed;
  color: #c2410c;
  font-size: 11px;
  font-weight: 800;
}

.sidebar-card-actions {
  display: grid;
  grid-template-columns: 1fr 1.1fr;
  gap: 7px;
}

.sidebar-card-actions button {
  padding: 9px 8px;
  font-size: 12px;
}

.detail-button {
  background: #eaf2ff;
  color: #1d4ed8;
}

.detail-button:hover {
  background: #dbeafe;
}

.sunset-button {
  background: linear-gradient(115deg, #f97316, #ea580c);
}

.sunset-button:hover {
  background: linear-gradient(115deg, #ea580c, #c2410c);
}

.weather-section {
  margin-top: 24px;
  padding: 28px;
}

.section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.section-heading>span {
  color: #64748b;
  font-size: 14px;
}

.weather-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.weather-card {
  padding: 19px;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  background: linear-gradient(145deg, #f8fbff, #ffffff);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.weather-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 14px 28px rgba(30, 64, 175, 0.12);
}

.card-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 20px;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 700;
}

.status-pill {
  padding: 5px 8px;
  border-radius: 999px;
  background: #e0ecff;
  color: #2563eb;
}

.weather-card h3 {
  margin-bottom: 4px;
  font-size: 21px;
  letter-spacing: -0.05em;
}

.temperature {
  margin-bottom: 15px;
  color: #0f172a;
  font-size: 40px;
  font-weight: 800;
  letter-spacing: -0.07em;
}

.temperature span {
  margin-left: 3px;
  color: #64748b;
  font-size: 17px;
  font-weight: 700;
}

.temperature-message {
  display: inline-block;
  margin-bottom: 17px;
  padding: 6px 9px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
}

.temperature-message span {
  margin-left: 4px;
  font-weight: 500;
}

.hot {
  background: #fff7ed;
  color: #c2410c;
}

.very-hot {
  background: #fef2f2;
  color: #b91c1c;
}

.mild {
  background: #ecfdf5;
  color: #15803d;
}

.cool {
  background: #e0f2fe;
  color: #0369a1;
}

.cold {
  background: #eff6ff;
  color: #1d4ed8;
}

.loading {
  background: #f1f5f9;
  color: #64748b;
}

button {
  display: block;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 10px;
  background: #2563eb;
  color: white;
  cursor: pointer;
  font-size: 13px;
  font-weight: 800;
  transition: background 0.2s ease, transform 0.2s ease;
}

button:hover {
  transform: translateY(-1px);
  background: #1d4ed8;
}

button span {
  margin-left: 5px;
}

.error-message,
.empty-message {
  padding: 16px;
  border-radius: 12px;
  text-align: center;
}

.modal-backdrop {
  position: fixed;
  z-index: 2000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.56);
}

.weather-modal {
  position: relative;
  width: min(100%, 560px);
  padding: 30px;
  border-radius: 24px;
  background: white;
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.3);
}

.modal-close {
  position: absolute;
  top: 16px;
  right: 16px;
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  padding: 0;
  border-radius: 50%;
  background: #f1f5f9;
  color: #475569;
  font-size: 24px;
  line-height: 1;
}

.modal-close:hover {
  background: #e2e8f0;
}

.modal-title-row {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 22px;
  border-bottom: 1px solid #e2e8f0;
}

.modal-title-row h2 {
  margin-bottom: 5px;
  font-size: 30px;
}

.modal-title-row p:not(.modal-temperature) {
  margin-bottom: 0;
  color: #64748b;
  font-size: 14px;
}

.modal-temperature {
  margin-bottom: 0;
  color: #1d4ed8;
  font-size: 46px;
  font-weight: 800;
  letter-spacing: -0.07em;
}

.modal-temperature span {
  margin-left: 3px;
  color: #64748b;
  font-size: 18px;
  letter-spacing: 0;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 22px 0;
}

.detail-item {
  padding: 13px 10px;
  border-radius: 12px;
  background: #f8fafc;
}

.detail-item span,
.detail-item strong {
  display: block;
}

.detail-item span {
  margin-bottom: 7px;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.detail-item strong {
  color: #1e293b;
  font-size: 15px;
}

.detail-summary {
  margin: 0;
  padding: 13px 14px;
  border-radius: 12px;
  background: #eff6ff;
  color: #1e3a8a;
  font-size: 14px;
  line-height: 1.6;
}

.sunset-backdrop {
  background: rgba(2, 6, 23, 0.72);
  backdrop-filter: blur(7px);
}

.sunset-modal {
  position: relative;
  width: min(100%, 900px);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 26px;
  box-shadow: 0 28px 90px rgba(2, 6, 23, 0.56);
}

.sunset-close {
  z-index: 3;
  background: rgba(255, 255, 255, 0.88);
}

.sunset-scene {
  position: relative;
  min-height: 480px;
  overflow: hidden;
  isolation: isolate;
  background-image:
    linear-gradient(to bottom, rgba(14, 116, 144, 0.2), rgba(15, 23, 42, 0.34)),
    var(--sunset-photo);
  background-position: center;
  background-size: cover;
  transition: background-image 1.2s ease;
}

.sunset-scene::before,
.sunset-scene::after {
  position: absolute;
  content: '';
  pointer-events: none;
}

.sunset-scene::before {
  inset: 0;
  z-index: 0;
  background: #020617;
  opacity: var(--scene-darkness, 0.2);
  transition: opacity 0.9s linear;
}

.sunset-scene::after {
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 0;
  height: 34%;
  background: linear-gradient(to bottom, rgba(14, 116, 144, 0.25), rgba(8, 47, 73, 0.72));
}

.sunset-scene.dawn {
  background-image:
    linear-gradient(to bottom, rgba(48, 35, 95, 0.22), rgba(251, 146, 60, 0.35)),
    var(--sunset-photo);
}

.sunset-scene.sunset {
  background-image:
    linear-gradient(to bottom, rgba(36, 36, 90, 0.34), rgba(239, 108, 61, 0.45)),
    var(--sunset-photo);
}

.sunset-scene.pre-dawn,
.sunset-scene.night {
  background:
    radial-gradient(circle at 15% 22%, rgba(255, 255, 255, 0.85) 0 1px, transparent 2px),
    radial-gradient(circle at 73% 17%, rgba(255, 255, 255, 0.72) 0 1px, transparent 2px),
    radial-gradient(circle at 43% 35%, rgba(255, 255, 255, 0.55) 0 1px, transparent 2px),
    linear-gradient(to bottom, rgba(2, 6, 23, 0.72), rgba(23, 37, 84, 0.68)),
    var(--sunset-photo);
  background-position: center;
  background-size: auto, auto, auto, auto, cover;
}

.scene-glow {
  position: absolute;
  z-index: 1;
  top: var(--sun-y);
  left: var(--sun-x);
  width: 230px;
  height: 230px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 241, 168, 0.42), rgba(255, 195, 113, 0.16) 42%, transparent 70%);
  filter: blur(4px);
  opacity: 0.92;
  transform: translate(-50%, -50%);
  transition: top 0.8s ease, left 0.8s ease;
}

.scene-sun {
  position: absolute;
  z-index: 1;
  top: var(--sun-y);
  left: var(--sun-x);
  width: 76px;
  height: 76px;
  border-radius: 50%;
  background: #fff7be;
  box-shadow: 0 0 30px rgba(255, 224, 125, 0.95), 0 0 70px rgba(255, 179, 91, 0.55);
  transform: translate(-50%, -50%);
  transition: top 0.8s ease, left 0.8s ease, background 1.2s ease;
}

.sunset-scene.sunset .scene-sun,
.sunset-scene.dawn .scene-sun {
  background: #ffe08a;
}

.sunset-scene.night .scene-sun,
.sunset-scene.pre-dawn .scene-sun {
  width: 58px;
  height: 58px;
  background: #e2e8f0;
  box-shadow: 0 0 24px rgba(226, 232, 240, 0.62);
}

.scene-cloud {
  position: absolute;
  z-index: 1;
  width: 180px;
  height: 42px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.52);
  filter: blur(1px);
  opacity: 0.75;
  animation: cloud-drift 24s linear infinite alternate;
}

.scene-cloud::before,
.scene-cloud::after {
  position: absolute;
  bottom: 9px;
  border-radius: 50%;
  background: inherit;
  content: '';
}

.scene-cloud::before {
  left: 28px;
  width: 62px;
  height: 62px;
}

.scene-cloud::after {
  right: 25px;
  width: 76px;
  height: 76px;
}

.cloud-one {
  top: 22%;
  left: -38px;
}

.cloud-two {
  top: 35%;
  right: -65px;
  opacity: 0.46;
  animation-duration: 31s;
  animation-direction: alternate-reverse;
}

.cloud-three {
  top: 15%;
  left: 49%;
  width: 130px;
  opacity: 0.32;
  transform: scale(0.7);
  animation-duration: 38s;
}

.sunset-scene.pre-dawn .scene-cloud,
.sunset-scene.night .scene-cloud {
  background: rgba(148, 163, 184, 0.16);
}

.scene-mountain {
  position: absolute;
  right: -4%;
  bottom: 0;
  left: -4%;
  z-index: 1;
  clip-path: polygon(0 70%, 10% 50%, 21% 70%, 35% 26%, 48% 65%, 60% 38%, 72% 64%, 86% 20%, 100% 62%, 100% 100%, 0 100%);
}

.mountain-back {
  height: 47%;
  background: linear-gradient(120deg, #335574, #1e3a4f);
  opacity: 0.78;
}

.mountain-front {
  height: 34%;
  background: linear-gradient(120deg, #172b35, #0f2e2b);
  clip-path: polygon(0 72%, 14% 42%, 29% 77%, 43% 29%, 55% 74%, 71% 44%, 83% 70%, 94% 35%, 100% 69%, 100% 100%, 0 100%);
}

.sunset-copy {
  position: absolute;
  bottom: 30px;
  left: 34px;
  z-index: 2;
  color: white;
  text-shadow: 0 2px 12px rgba(15, 23, 42, 0.45);
}

.sunset-copy p {
  margin-bottom: 8px;
  color: rgba(255, 255, 255, 0.76);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.15em;
}

.sunset-copy h2 {
  margin-bottom: 10px;
  font-size: clamp(30px, 5vw, 50px);
}

.sunset-copy strong,
.sunset-copy span {
  display: block;
}

.sunset-copy strong {
  margin-bottom: 6px;
  font-size: 16px;
}

.sunset-copy span {
  color: rgba(255, 255, 255, 0.82);
  font-size: 13px;
}

.sunset-copy a {
  display: inline-block;
  margin-top: 12px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 11px;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.sunset-copy a:hover {
  color: white;
}

@keyframes cloud-drift {
  from {
    transform: translateX(-12px);
  }

  to {
    transform: translateX(38px);
  }
}

.error-message {
  background: #fef2f2;
  color: #b91c1c;
}

.empty-message {
  margin: 0;
  background: #f8fafc;
  color: #64748b;
}

/* Desktop live-sky redesign: the whole site follows the local sun. */
.weather-page {
  --sky-top: #2763a8;
  --sky-middle: #63a9d8;
  --sky-horizon: #d9edf5;
  position: relative;
  min-height: 100vh;
  isolation: isolate;
  overflow: hidden;
  background: var(--sky-top);
  padding: 24px clamp(28px, 3vw, 72px) 56px;
}

.weather-page.dawn {
  --sky-top: #15264d;
  --sky-middle: #745879;
  --sky-horizon: #f1a37d;
}

.weather-page.sunrise {
  --sky-top: #315d91;
  --sky-middle: #ef9674;
  --sky-horizon: #ffd39b;
}

.weather-page.morning {
  --sky-top: #297ac0;
  --sky-middle: #72bae3;
  --sky-horizon: #d8eff8;
}

.weather-page.midday {
  --sky-top: #146db6;
  --sky-middle: #5fb6e5;
  --sky-horizon: #dff3f8;
}

.weather-page.afternoon {
  --sky-top: #2875b1;
  --sky-middle: #80b5d0;
  --sky-horizon: #f1d6ad;
}

.weather-page.golden-hour {
  --sky-top: #304e7c;
  --sky-middle: #d27a70;
  --sky-horizon: #ffc77d;
}

.weather-page.dusk {
  --sky-top: #151b3f;
  --sky-middle: #624b76;
  --sky-horizon: #cf7a78;
}

.weather-page.night {
  --sky-top: #030817;
  --sky-middle: #0b1c3b;
  --sky-horizon: #263b5d;
}

.weather-page> :not(.site-sky) {
  position: relative;
  z-index: 1;
}

.site-sky {
  position: fixed;
  z-index: 0;
  inset: 0;
  overflow: hidden;
  background: linear-gradient(180deg, var(--sky-top) 0%, var(--sky-middle) 56%, var(--sky-horizon) 100%);
  transition: background 1.4s ease;
}

.site-sky::before {
  position: absolute;
  z-index: 3;
  inset: -8%;
  background:
    radial-gradient(circle at var(--sun-x, 50%) var(--sun-y, 30%), rgba(255, 255, 255, .22), rgba(218, 239, 252, .08) 13%, transparent 32%),
    linear-gradient(115deg, rgba(255, 255, 255, .04), transparent 38%, rgba(178, 220, 247, .055));
  content: '';
  filter: blur(10px);
  mix-blend-mode: screen;
  opacity: calc(.42 * var(--sun-weather-opacity, 1));
  pointer-events: none;
  transition: opacity 1.4s ease;
}

.live-sky-video {
  position: absolute;
  width: 100%;
  height: 100%;
  inset: 0;
  object-fit: cover;
  object-position: center 44%;
  opacity: 0;
  filter: brightness(1.02) saturate(1.04) contrast(1.02);
  transform: scale(1.08);
  transition:
    opacity 1.25s ease,
    filter 1.5s ease,
    transform 8s cubic-bezier(0.2, 0.7, 0.2, 1);
}

/* 오늘의 창에서 하늘 영상을 보여주고, 계산된 시간대에 따라 영상의 빛을 조절합니다. */
.weather-page.is-landscape .live-sky-video {
  opacity: var(--cloud-video-opacity, 0.2);
  transform: scale(1.025);
}

.weather-page.is-landscape.dawn .live-sky-video {
  filter: brightness(0.5) saturate(0.82) sepia(0.18) hue-rotate(-8deg);
}

.weather-page.is-landscape.sunrise .live-sky-video {
  filter: brightness(0.72) saturate(1.18) sepia(0.22) hue-rotate(-9deg);
}

.weather-page.is-landscape.afternoon .live-sky-video {
  filter: brightness(0.9) saturate(1.08) sepia(0.08);
}

.weather-page.is-landscape.golden-hour .live-sky-video {
  filter: brightness(0.72) saturate(1.28) sepia(0.3) hue-rotate(-10deg);
}

.weather-page.is-landscape.dusk .live-sky-video {
  filter: brightness(0.44) saturate(1.06) sepia(0.18) hue-rotate(7deg);
}

.weather-page.is-landscape.night .live-sky-video {
  filter: brightness(0.22) saturate(0.55) contrast(1.16) hue-rotate(12deg);
}

.weather-atmosphere {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(41, 53, 68, 0.72), rgba(82, 92, 103, 0.48));
  opacity: var(--weather-atmosphere-opacity, 0);
  transition: opacity 1.6s ease;
}

.weather-page.condition-overcast .weather-atmosphere {
  background: linear-gradient(180deg, rgba(48, 59, 72, .66), rgba(111, 121, 130, .44));
}

.weather-page.condition-fog .weather-atmosphere,
.weather-page.condition-humid .weather-atmosphere {
  background: linear-gradient(180deg, rgba(201, 213, 220, .62), rgba(230, 235, 235, .72));
}

.weather-page.condition-moderate-rain .weather-atmosphere,
.weather-page.condition-heavy-rain .weather-atmosphere,
.weather-page.condition-violent-shower .weather-atmosphere,
.weather-page.condition-storm .weather-atmosphere,
.weather-page.condition-hail .weather-atmosphere {
  background: linear-gradient(180deg, rgba(28, 40, 54, .74), rgba(72, 85, 97, .56));
}

/* 태양 원반과 별개로 수평선의 일출·일몰 잔광을 표현합니다. */
.phase-light {
  position: absolute;
  inset: 0;
  background: transparent;
  opacity: 0;
  pointer-events: none;
  transition: opacity 1.8s ease, background 1.8s ease;
}

.weather-page.dawn .phase-light {
  background: radial-gradient(ellipse at 4% 86%, rgba(255, 166, 119, 0.58), rgba(226, 145, 139, 0.2) 24%, transparent 58%);
  opacity: 0.72;
}

.weather-page.sunrise .phase-light {
  background:
    radial-gradient(circle at var(--sun-x) var(--sun-y), rgba(255, 246, 205, 0.5), transparent 14%),
    linear-gradient(0deg, rgba(255, 178, 116, 0.34), transparent 42%);
  opacity: 0.72;
}

.weather-page.afternoon .phase-light {
  background: linear-gradient(0deg, rgba(255, 226, 178, 0.12), transparent 34%);
  opacity: 0.5;
}

.weather-page.golden-hour .phase-light {
  background:
    radial-gradient(circle at var(--sun-x) var(--sun-y), rgba(255, 229, 174, 0.5), transparent 18%),
    linear-gradient(0deg, rgba(255, 157, 94, 0.38), rgba(214, 122, 119, 0.08) 38%, transparent 66%);
  opacity: 0.82;
}

.weather-page.dusk .phase-light {
  background: radial-gradient(ellipse at 96% 88%, rgba(255, 137, 100, 0.58), rgba(160, 99, 139, 0.24) 32%, transparent 68%);
  opacity: 0.74;
}

.site-sky::after {
  position: absolute;
  z-index: 4;
  inset: 0;
  background: #020617;
  content: '';
  opacity: calc(var(--scene-darkness, 0.05) * 0.27);
  pointer-events: none;
  transition: opacity 1s linear;
}

.site-stars {
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle at 8% 14%, white 0 1px, transparent 1.6px),
    radial-gradient(circle at 21% 7%, white 0 1px, transparent 1.4px),
    radial-gradient(circle at 37% 19%, white 0 1.2px, transparent 1.8px),
    radial-gradient(circle at 54% 9%, white 0 1px, transparent 1.5px),
    radial-gradient(circle at 69% 23%, white 0 1px, transparent 1.6px),
    radial-gradient(circle at 84% 11%, white 0 1.2px, transparent 1.8px),
    radial-gradient(circle at 94% 29%, white 0 1px, transparent 1.5px),
    radial-gradient(circle at 45% 37%, rgba(255, 255, 255, 0.85) 0 1px, transparent 1.5px);
  opacity: var(--star-opacity, 0);
  transition: opacity 1.2s ease;
}

.horizon-haze {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 34vh;
  background: linear-gradient(to bottom, transparent, rgba(27, 56, 75, 0.23));
  transition: background 1.8s ease;
}

.weather-page.dawn .horizon-haze,
.weather-page.sunrise .horizon-haze {
  background: linear-gradient(to bottom, transparent, rgba(91, 77, 89, 0.14) 38%, rgba(255, 188, 137, 0.28));
}

.weather-page.golden-hour .horizon-haze {
  background: linear-gradient(to bottom, transparent, rgba(116, 73, 74, 0.16) 38%, rgba(239, 144, 89, 0.3));
}

.weather-page.dusk .horizon-haze {
  background: linear-gradient(to bottom, transparent, rgba(52, 49, 75, 0.22) 34%, rgba(128, 72, 92, 0.32));
}

.weather-page.night .horizon-haze {
  background: linear-gradient(to bottom, transparent, rgba(4, 12, 29, 0.48));
}

.hero {
  display: grid;
  grid-template-columns: minmax(330px, 1.15fr) minmax(300px, 0.8fr) minmax(300px, 0.8fr);
  align-items: center;
  gap: 24px;
  padding: 22px 26px;
  border: 1px solid rgba(255, 255, 255, 0.34);
  border-radius: 18px;
  background: rgba(13, 32, 56, 0.36);
  color: white;
  box-shadow: 0 20px 60px rgba(2, 10, 24, 0.15);
  backdrop-filter: blur(20px) saturate(125%);
}

.hero h1 {
  margin-bottom: 7px;
  font-size: clamp(28px, 2.6vw, 43px);
}

.hero-copy {
  font-size: 14px;
}

.live-sky-status {
  min-width: 0;
  padding: 15px 17px;
  border-left: 1px solid rgba(255, 255, 255, 0.25);
}

.live-status-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 9px;
}

.live-status-topline strong {
  font-size: 20px;
  font-variant-numeric: tabular-nums;
}

.live-indicator {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.12em;
}

.live-indicator i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #86efac;
  box-shadow: 0 0 0 5px rgba(134, 239, 172, 0.13);
  animation: live-pulse 1.8s ease-in-out infinite;
}

@keyframes live-pulse {
  50% {
    opacity: 0.45;
    transform: scale(0.82);
  }
}

.live-sky-status p {
  margin-bottom: 5px;
  color: rgba(255, 255, 255, 0.92);
  font-size: 13px;
}

.live-sky-status .sun-timeline {
  color: #fde68a;
  font-weight: 800;
}

.live-sky-status small {
  display: block;
  overflow: hidden;
  margin-top: 7px;
  color: rgba(255, 255, 255, 0.65);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.location-refresh {
  position: static;
  display: inline-block;
  width: auto;
  margin-top: 10px;
  padding: 7px 10px;
  border: 1px solid rgba(255, 255, 255, 0.32);
  background: rgba(255, 255, 255, 0.11);
  font-size: 11px;
  backdrop-filter: none;
}

.search-panel {
  width: 100%;
  padding: 15px;
  border-color: rgba(255, 255, 255, 0.22);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.09);
}

.content-grid {
  grid-template-columns: minmax(680px, 1.55fr) minmax(410px, 0.75fr);
  gap: clamp(18px, 2vw, 30px);
  margin-top: 22px;
}

.map-panel,
.summary-panel,
.sidebar-list-panel {
  border-color: rgba(255, 255, 255, 0.46);
  background: rgba(250, 253, 255, 0.82);
  box-shadow: 0 22px 60px rgba(8, 25, 45, 0.16);
  backdrop-filter: blur(22px) saturate(120%);
}

.map-panel,
.summary-panel,
.sidebar-list-panel {
  border-radius: 18px;
}

.weather-map {
  height: clamp(650px, 73vh, 820px);
}

.summary-panel {
  padding: 22px;
  background: rgba(250, 253, 255, 0.84);
}

.summary-number {
  margin-top: 14px;
  font-size: 54px;
}

.sidebar-weather-list {
  max-height: 440px;
}

.sidebar-weather-card {
  background: rgba(255, 255, 255, 0.72);
}

.sidebar-card-actions {
  grid-template-columns: 1fr;
}

.detail-button {
  background: #1f5f9f;
  color: white;
}

.detail-button:hover {
  background: #174d83;
}

.dashboard-shell {
  width: 100%;
  max-width: 1800px;
  margin: 0 auto;
  animation: dashboard-arrive 0.72s cubic-bezier(0.2, 0.75, 0.2, 1) both;
}

.mode-switcher {
  display: flex;
  width: fit-content;
  align-items: center;
  gap: 6px;
  margin: 0 auto 14px;
  padding: 6px;
  border: 1px solid rgba(255, 255, 255, 0.34);
  border-radius: 999px;
  background: rgba(10, 27, 48, 0.34);
  box-shadow: 0 12px 30px rgba(2, 10, 24, 0.12);
  backdrop-filter: blur(18px);
}

.mode-switcher>span {
  margin: 0 8px 0 10px;
  color: rgba(255, 255, 255, 0.65);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.14em;
}

.mode-switcher button {
  width: auto;
  padding: 8px 13px;
  border-radius: 999px;
  background: transparent;
  color: rgba(255, 255, 255, 0.78);
  font-size: 12px;
}

.mode-switcher button:hover,
.mode-switcher button.active {
  background: rgba(255, 255, 255, 0.92);
  color: #17375e;
}

.content-grid {
  grid-template-columns: minmax(0, 1.18fr) minmax(500px, 0.82fr);
}

.sidebar-weather-list {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  max-height: 560px;
}

.sidebar-card-actions {
  grid-template-columns: 1fr 1fr;
}

.landscape-button {
  background: rgba(20, 63, 101, 0.09);
  color: #174d83;
}

.landscape-button:hover {
  background: rgba(20, 63, 101, 0.17);
}

.weather-page.is-landscape {
  height: 100vh;
  min-height: 680px;
  padding: 0;
  overflow: hidden;
}

.landscape-view {
  position: relative;
  display: flex;
  width: 100%;
  height: 100vh;
  min-height: 680px;
  flex-direction: column;
  justify-content: space-between;
  padding: 24px clamp(28px, 4vw, 76px) 38px;
  animation: landscape-arrive 0.95s cubic-bezier(0.16, 0.8, 0.2, 1) both;
}

.ambient-glance {
  position: absolute;
  z-index: 4;
  bottom: clamp(42px, 8vh, 92px);
  left: clamp(28px, 6vw, 100px);
  max-width: min(720px, calc(100vw - 56px));
  color: white;
  opacity: 0;
  pointer-events: none;
  text-shadow: 0 3px 22px rgba(2, 8, 18, .48);
  transform: translateY(18px);
  transition: opacity .8s ease, transform .8s cubic-bezier(.2, .8, .2, 1);
}

.ambient-glance time {
  display: block;
  margin-bottom: 8px;
  font-size: clamp(44px, 7vw, 92px);
  font-weight: 250;
  font-variant-numeric: tabular-nums;
  letter-spacing: -.06em;
}

.ambient-glance p {
  margin: 0 0 9px;
  font-size: clamp(17px, 2vw, 27px);
  font-weight: 650;
  letter-spacing: -.035em;
}

.ambient-glance small {
  color: rgba(255, 255, 255, .74);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.weather-page.is-ambient-idle .ambient-glance {
  opacity: 1;
  transform: translateY(0);
}

.landscape-toolbar {
  display: grid;
  width: 100%;
  max-width: 1800px;
  align-items: center;
  grid-template-columns: auto minmax(250px, 1fr) auto auto auto;
  gap: 22px;
  margin: 0 auto;
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.32);
  border-radius: 16px;
  background: rgba(7, 24, 43, 0.29);
  box-shadow: 0 16px 44px rgba(2, 8, 18, 0.13);
  backdrop-filter: blur(18px) saturate(120%);
  animation: toolbar-arrive 0.8s 0.12s cubic-bezier(0.2, 0.75, 0.2, 1) both;
  transition: opacity .55s ease, transform .55s cubic-bezier(.2, .8, .2, 1);
}

.landscape-primary-summary {
  position: absolute;
  z-index: 4;
  top: 50%;
  left: 50%;
  width: min(560px, calc(100vw - 56px));
  color: white;
  text-align: center;
  text-shadow: 0 3px 26px rgba(2, 10, 24, .38);
  transform: translate(-50%, -47%);
  transition:
    left .7s cubic-bezier(.2, .8, .2, 1),
    width .7s cubic-bezier(.2, .8, .2, 1),
    opacity .5s ease,
    transform .7s cubic-bezier(.2, .8, .2, 1);
}

.landscape-primary-summary.is-detail-open {
  left: clamp(250px, 25vw, 430px);
  width: min(430px, 38vw);
  transform: translate(-50%, -44%);
}

.landscape-primary-location {
  margin: 0 0 5px;
  font-size: clamp(20px, 2.4vw, 35px);
  font-weight: 500;
  letter-spacing: -.035em;
}

.landscape-primary-weather>strong,
.landscape-primary-weather>p,
.landscape-primary-weather>small {
  display: block;
}

.landscape-primary-weather>strong {
  margin: -5px 0 -8px;
  font-size: clamp(94px, 13vw, 176px);
  font-weight: 220;
  line-height: 1;
  letter-spacing: -.085em;
}

.landscape-primary-weather>strong small {
  margin-left: 2px;
  font-size: .34em;
  font-weight: 350;
  letter-spacing: -.03em;
  vertical-align: top;
}

.landscape-primary-weather>p {
  margin: 0;
  font-size: clamp(19px, 2.2vw, 30px);
  font-weight: 650;
}

.landscape-primary-weather>small {
  margin-top: 5px;
  color: rgba(255, 255, 255, .78);
  font-size: 12px;
}

.landscape-primary-sun {
  margin: 14px 0 0;
  color: rgba(255, 255, 255, .86);
  font-size: 12px;
}

.landscape-quick-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  margin-top: 22px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, .24);
  border-radius: 20px;
  background: rgba(255, 255, 255, .13);
  box-shadow: 0 18px 50px rgba(2, 10, 24, .13);
  text-align: left;
  text-shadow: none;
  backdrop-filter: blur(24px) saturate(135%);
}

.landscape-quick-strip>div {
  min-width: 0;
  padding: 14px;
  background: rgba(4, 24, 43, .14);
}

.landscape-quick-strip span,
.landscape-quick-strip strong {
  display: block;
}

.landscape-quick-strip span {
  margin-bottom: 5px;
  color: rgba(255, 255, 255, .62);
  font-size: 9px;
  font-weight: 850;
}

.landscape-quick-strip strong {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.primary-commute-summary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 10px 0 0;
  color: rgba(255, 255, 255, .76);
  font-size: 11px;
}

.primary-commute-summary span::after {
  margin-left: 8px;
  content: '·';
  opacity: .55;
}

.primary-commute-summary strong {
  color: white;
  font-size: 12px;
}

.primary-detail-button {
  width: auto;
  margin-top: 12px;
  padding: 9px 14px;
  border: 1px solid rgba(255, 255, 255, .24);
  border-radius: 999px;
  background: rgba(5, 23, 42, .22);
  font-size: 11px;
  backdrop-filter: blur(14px);
}

.weather-page.is-ambient-idle .landscape-primary-summary {
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, calc(-47% + 18px));
}

.weather-page.is-ambient-idle .landscape-toolbar {
  opacity: 0;
  pointer-events: none;
  transform: translateY(-20px);
}

.back-dashboard {
  width: fit-content;
  padding: 9px 13px;
  background: rgba(255, 255, 255, 0.12);
}

.landscape-info-toggle {
  width: fit-content;
  padding: 9px 13px;
  border: 1px solid rgba(255, 255, 255, 0.24);
  background: rgba(255, 255, 255, 0.12);
  white-space: nowrap;
}

.landscape-info-toggle:hover {
  background: rgba(255, 255, 255, 0.2);
}

.window-break-button {
  width: fit-content;
  padding: 9px 13px;
  border: 1px solid rgba(255, 255, 255, .3);
  border-radius: 11px;
  background: rgba(255, 255, 255, .16);
  white-space: nowrap;
}

.window-break-button:hover {
  background: rgba(255, 255, 255, .24);
}

.window-moment-message {
  position: fixed;
  z-index: 18;
  bottom: clamp(45px, 8vh, 100px);
  left: 50%;
  width: min(760px, calc(100vw - 48px));
  margin: 0;
  color: rgba(255, 255, 255, .94);
  font-size: clamp(17px, 2vw, 27px);
  font-weight: 570;
  letter-spacing: -.035em;
  line-height: 1.45;
  text-align: center;
  text-shadow: 0 4px 28px rgba(2, 8, 18, .72);
  transform: translateX(-50%);
  pointer-events: none;
}

.window-moment-enter-active,
.window-moment-leave-active {
  transition: opacity 1.1s ease, transform 1.1s cubic-bezier(.2, .8, .2, 1);
}

.window-moment-enter-from,
.window-moment-leave-to {
  opacity: 0;
  transform: translate(-50%, 14px);
}

.window-break-layer {
  position: fixed;
  z-index: 40;
  inset: 0;
  pointer-events: none;
}

.window-break-intro {
  position: absolute;
  top: 50%;
  left: 50%;
  width: min(680px, calc(100vw - 48px));
  color: white;
  text-align: center;
  text-shadow: 0 4px 30px rgba(2, 8, 18, .7);
  transform: translate(-50%, -50%);
}

.window-break-intro span {
  color: rgba(255, 255, 255, .62);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: .22em;
}

.window-break-intro p {
  margin: 12px 0 0;
  font-size: clamp(20px, 3vw, 38px);
  font-weight: 420;
  letter-spacing: -.045em;
}

.window-break-copy-enter-active,
.window-break-copy-leave-active {
  transition: opacity 1.1s ease, transform 1.1s ease;
}

.window-break-copy-enter-from,
.window-break-copy-leave-to {
  opacity: 0;
  transform: translate(-50%, calc(-50% + 12px));
}

.window-break-ending {
  position: absolute;
  right: 28px;
  bottom: 28px;
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border-radius: 50%;
  background:
    radial-gradient(circle, rgba(5, 20, 38, .5) 0 57%, transparent 59%),
    conic-gradient(rgba(255, 255, 255, .9) var(--window-break-progress), rgba(255, 255, 255, .16) 0);
  color: white;
  box-shadow: 0 8px 26px rgba(2, 8, 18, .2);
  font-size: 13px;
  backdrop-filter: blur(10px);
}

.window-break-exit {
  position: absolute;
  top: 24px;
  right: 24px;
  width: auto;
  padding: 9px 13px;
  border: 1px solid rgba(255, 255, 255, .22);
  border-radius: 999px;
  background: rgba(3, 17, 34, .22);
  color: white;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-8px);
  transition: opacity .35s ease, transform .35s ease;
  backdrop-filter: blur(14px);
}

.window-break-exit.is-visible {
  opacity: .72;
  pointer-events: auto;
  transform: translateY(0);
}

.weather-page.is-window-break .landscape-toolbar,
.weather-page.is-window-break .landscape-primary-summary,
.weather-page.is-window-break .landscape-info,
.weather-page.is-window-break .ambient-glance {
  opacity: 0 !important;
  pointer-events: none !important;
  transition: opacity .75s ease, transform .75s ease;
}

.landscape-toolbar label {
  display: flex;
  align-items: center;
  gap: 10px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 11px;
  font-weight: 800;
  justify-self: center;
}

.landscape-toolbar select {
  min-width: 250px;
  padding: 9px 34px 9px 12px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 10px;
  outline: none;
  background: rgba(8, 25, 46, 0.52);
  color: white;
  font: inherit;
  cursor: pointer;
}

.landscape-clock {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 13px;
  color: white;
}

.landscape-clock span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.14em;
}

.landscape-clock i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #86efac;
  box-shadow: 0 0 0 5px rgba(134, 239, 172, 0.12);
}

.landscape-clock strong {
  font-size: 19px;
  font-variant-numeric: tabular-nums;
}

.landscape-info {
  position: absolute;
  z-index: 6;
  top: 100px;
  right: clamp(28px, 4vw, 76px);
  bottom: 38px;
  width: min(100%, 760px);
  max-width: 540px;
  max-height: none;
  margin: 0;
  padding: 26px;
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.34);
  border-radius: 20px;
  background: rgba(6, 22, 42, 0.34);
  color: white;
  box-shadow: 0 24px 70px rgba(2, 8, 18, 0.18);
  backdrop-filter: blur(22px) saturate(120%);
  animation: landscape-card-arrive 0.92s 0.14s cubic-bezier(0.16, 0.8, 0.2, 1) both;
  transition:
    transform 0.55s cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 0.38s ease,
    visibility 0.38s ease;
}

.landscape-detail-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 14px;
}

.landscape-detail-heading span,
.landscape-detail-heading strong {
  display: block;
}

.landscape-detail-heading span {
  margin-bottom: 4px;
  color: rgba(255, 255, 255, .52);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: .14em;
}

.landscape-detail-heading strong {
  font-size: 17px;
}

.landscape-detail-heading button {
  display: grid;
  width: 34px;
  height: 34px;
  padding: 0;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, .18);
  border-radius: 50%;
  background: rgba(255, 255, 255, .08);
  font-size: 20px;
  font-weight: 350;
}

.landscape-info--hidden {
  animation: none;
  visibility: hidden;
  pointer-events: none;
  opacity: 0;
  transform: translateY(calc(100% + 60px));
}

.weather-page.is-ambient-idle .landscape-info {
  opacity: 0;
  pointer-events: none;
  transform: translateY(28px);
}

.landscape-eyebrow {
  margin-bottom: 9px;
  color: rgba(255, 255, 255, 0.62);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.16em;
}

.local-scene-label {
  display: flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  margin: 0 0 13px;
  padding: 7px 10px;
  border: 1px solid rgba(167, 243, 208, .22);
  border-radius: 999px;
  background: rgba(6, 78, 59, .18);
  color: #d1fae5;
  font-size: 11px;
  font-weight: 800;
}

.weather-at-a-glance {
  display: grid;
  align-items: center;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 11px;
  margin-bottom: 14px;
  padding: 11px 13px;
  border: 1px solid rgba(255, 255, 255, .16);
  border-radius: 13px;
  background: rgba(5, 18, 34, .24);
}

.weather-at-a-glance>span {
  display: grid;
  width: 35px;
  height: 35px;
  place-items: center;
  border-radius: 11px;
  background: rgba(255, 255, 255, .12);
  font-size: 21px;
}

.weather-at-a-glance strong,
.weather-at-a-glance small {
  display: block;
}

.weather-at-a-glance strong {
  font-size: 13px;
}

.weather-at-a-glance small {
  margin-top: 2px;
  color: rgba(255, 255, 255, .64);
  font-size: 10px;
}

.weather-at-a-glance>i {
  color: rgba(255, 255, 255, .5);
  font-size: 9px;
  font-style: normal;
  font-weight: 800;
  letter-spacing: .06em;
  text-transform: uppercase;
}

.weather-at-a-glance--heavy-rain,
.weather-at-a-glance--violent-shower,
.weather-at-a-glance--storm,
.weather-at-a-glance--hail {
  border-color: rgba(147, 197, 253, .3);
  background: rgba(9, 20, 35, .46);
}

.landscape-title-row {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 20px;
}

.landscape-title-row h1 {
  margin-bottom: 5px;
  font-size: clamp(34px, 4vw, 56px);
}

.landscape-title-row>div>p {
  margin-bottom: 0;
  color: rgba(255, 255, 255, 0.76);
}

.landscape-temperature {
  margin-bottom: 0;
  font-size: clamp(48px, 6vw, 76px);
  font-weight: 800;
  letter-spacing: -0.08em;
}

.landscape-temperature span {
  margin-left: 4px;
  font-size: 20px;
  letter-spacing: 0;
}

.landscape-sun-copy {
  margin: 19px 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  color: #fde68a;
  font-size: 13px;
  font-weight: 800;
}

.day-rhythm-panel,
.commute-guide {
  margin: 12px 0;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, .15);
  border-radius: 14px;
  background: rgba(3, 14, 28, .22);
}

.day-rhythm-heading,
.commute-guide-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.day-rhythm-heading span,
.commute-guide-heading span {
  display: block;
  margin-bottom: 4px;
  color: rgba(255, 255, 255, .5);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: .14em;
}

.day-rhythm-heading strong,
.commute-guide-heading strong {
  font-size: 13px;
}

.day-rhythm-heading time {
  color: #fef3c7;
  font-size: 18px;
  font-weight: 850;
  font-variant-numeric: tabular-nums;
}

.day-rhythm-track {
  position: relative;
  height: 5px;
  margin: 14px 4px 9px;
  border-radius: 999px;
  background: rgba(255, 255, 255, .14);
}

.day-rhythm-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #7dd3fc, #fde68a);
  transition: width 1s linear;
}

.day-rhythm-track b {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, .8);
  border-radius: 50%;
  background: #fef3c7;
  box-shadow: 0 0 0 5px rgba(254, 243, 199, .12);
  transform: translate(-50%, -50%);
  transition: left 1s linear;
}

.day-rhythm-labels {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: rgba(255, 255, 255, .5);
  font-size: 9px;
}

.day-rhythm-labels small {
  color: rgba(255, 255, 255, .7);
}

.commute-guide-heading small {
  color: rgba(255, 255, 255, .48);
  font-size: 9px;
  white-space: nowrap;
}

.commute-guide-items {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 12px 0 10px;
}

.commute-guide-items>div {
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, .1);
  border-radius: 10px;
  background: rgba(255, 255, 255, .06);
}

.commute-guide-items span,
.commute-guide-items strong {
  display: block;
}

.commute-guide-items span {
  margin-bottom: 5px;
  color: rgba(255, 255, 255, .52);
  font-size: 9px;
}

.commute-guide-items strong {
  font-size: 11px;
}

.commute-guide-items .tone-warning {
  border-color: rgba(253, 186, 116, .28);
  background: rgba(124, 45, 18, .18);
}

.commute-guide-items .tone-good {
  border-color: rgba(110, 231, 183, .24);
  background: rgba(6, 78, 59, .16);
}

.commute-guide>p {
  margin: 0;
  color: rgba(255, 255, 255, .66);
  font-size: 10px;
}

.commute-guide .commute-weather-line {
  margin: 13px 0 0;
  color: white;
  font-size: 12px;
  font-weight: 750;
}

.landscape-detail-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
}

.landscape-detail-grid>div {
  padding: 11px 9px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.07);
}

.landscape-detail-grid span,
.landscape-detail-grid strong {
  display: block;
}

.landscape-detail-grid span {
  margin-bottom: 6px;
  color: rgba(255, 255, 255, 0.58);
  font-size: 10px;
}

.landscape-detail-grid strong {
  font-size: 12px;
  white-space: nowrap;
}

.scene-index-panel {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, .13);
  border-radius: 12px;
  background: rgba(3, 14, 28, .2);
}

.scene-index-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.scene-index-heading span {
  color: rgba(255, 255, 255, .54);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: .14em;
}

.scene-index-heading strong {
  color: #fef3c7;
  font-size: 11px;
}

.scene-index-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 7px;
}

.scene-index-item {
  min-width: 0;
}

.scene-index-item span,
.scene-index-item strong {
  display: block;
}

.scene-index-item span {
  color: rgba(255, 255, 255, .52);
  font-size: 9px;
}

.scene-index-item strong {
  margin: 3px 0 6px;
  overflow: hidden;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scene-index-item i {
  display: block;
  height: 2px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, .14);
}

.scene-index-item b {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #7dd3fc, #fef08a);
}

.scene-index-panel>p {
  margin: 9px 0 0;
  color: rgba(255, 255, 255, .52);
  font-size: 9px;
}

.scene-index-disclosure {
  margin-top: 12px;
}

.scene-index-disclosure>summary {
  padding: 11px 13px;
  border: 1px solid rgba(255, 255, 255, .13);
  border-radius: 12px;
  background: rgba(3, 14, 28, .2);
  color: rgba(255, 255, 255, .74);
  font-size: 11px;
  font-weight: 750;
  cursor: pointer;
}

.scene-index-disclosure[open]>summary {
  border-radius: 12px 12px 0 0;
}

.scene-index-disclosure .scene-index-panel {
  margin-top: 0;
  border-top: 0;
  border-radius: 0 0 12px 12px;
}

.mode-transition-curtain {
  position: fixed !important;
  z-index: 2000 !important;
  display: grid;
  inset: 0;
  place-content: center;
  overflow: hidden;
  background:
    radial-gradient(circle at var(--sun-x, 50%) var(--sun-y, 50%), rgba(255, 246, 199, .42), transparent 18%),
    linear-gradient(155deg, var(--sky-top), var(--sky-middle) 58%, var(--sky-horizon));
  color: white;
  text-align: center;
  transform: translateZ(0);
  will-change: opacity, transform;
}

.transition-map-rings {
  position: absolute;
  z-index: 1;
  top: 50%;
  left: 50%;
  width: min(64vw, 680px);
  aspect-ratio: 1;
  border-radius: 50%;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.transition-map-rings i {
  position: absolute;
  inset: 0;
  border: 1px solid rgba(255, 255, 255, .25);
  border-radius: 50%;
  animation: transition-map-ring .74s ease-out both;
}

.transition-map-rings i:nth-child(2) {
  inset: 16%;
  animation-delay: .08s;
}

.transition-map-rings i:nth-child(3) {
  inset: 32%;
  animation-delay: .16s;
}

.transition-content {
  position: relative;
  z-index: 3;
}

.transition-content>span {
  display: block;
  margin-bottom: 13px;
  color: #a7f3d0;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: .18em;
}

.transition-content h2 {
  margin: 0 0 5px;
  color: white;
  font-size: clamp(30px, 5vw, 58px);
  letter-spacing: -.055em;
  text-shadow: 0 4px 24px rgba(3, 12, 26, .5);
}

.mode-transition-curtain::before {
  position: absolute;
  content: '';
  inset: -25%;
  background: linear-gradient(115deg, transparent 35%, rgba(255, 255, 255, .16) 49%, transparent 63%);
  transform: translate3d(-50%, 0, 0);
  animation: sky-light-sweep .64s cubic-bezier(.2, .7, .2, 1) both;
  will-change: transform;
}

.transition-weather-symbol {
  position: relative;
  z-index: 1;
  display: grid;
  width: 64px;
  height: 64px;
  margin: 0 auto 15px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, .22);
  border-radius: 20px;
  background: rgba(9, 28, 51, .16);
  font-size: 35px;
  box-shadow: 0 18px 50px rgba(3, 12, 26, .18);
}

.transition-content p {
  position: relative;
  z-index: 1;
  margin: 0;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-shadow: 0 2px 14px rgba(3, 12, 26, 0.4);
}

.transition-content>small {
  position: relative;
  z-index: 1;
  display: block;
  margin-top: 5px;
  color: rgba(255, 255, 255, .66);
  font-size: 10px;
}

.transition-progress {
  position: relative;
  z-index: 1;
  display: block;
  width: 118px;
  height: 2px;
  margin: 17px auto 0;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, .18);
}

.transition-progress::after {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: rgba(255, 255, 255, .84);
  content: '';
  transform: translate3d(-100%, 0, 0);
  animation: transition-progress .72s ease-out forwards;
}

.sky-shift-enter-active,
.sky-shift-leave-active {
  transition: opacity .2s ease, transform .24s cubic-bezier(.2, .75, .2, 1);
}

.sky-shift-enter-from,
.sky-shift-leave-to {
  opacity: 0;
  transform: translate3d(0, 10px, 0) scale(1.008);
}

.sky-shift-enter-to,
.sky-shift-leave-from {
  opacity: 1;
  transform: translate3d(0, 0, 0) scale(1);
}

@keyframes dashboard-arrive {
  from {
    opacity: 0;
    transform: translateY(18px) scale(0.992);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes landscape-arrive {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes toolbar-arrive {
  from {
    opacity: 0;
    transform: translateY(-22px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes landscape-card-arrive {
  from {
    opacity: 0;
    transform: translate(32px, 24px) scale(0.97);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes sky-light-sweep {
  to {
    transform: translate3d(50%, 0, 0);
  }
}

@keyframes transition-progress {
  to {
    transform: translate3d(0, 0, 0);
  }
}

@keyframes transition-map-ring {
  from {
    opacity: .8;
    transform: scale(.34);
  }

  to {
    opacity: 0;
    transform: scale(1.08);
  }
}

@media (prefers-reduced-motion: reduce) {

  .dashboard-shell,
  .landscape-view,
  .landscape-toolbar,
  .landscape-info,
  .mode-transition-curtain::before,
  .transition-map-rings i,
  .transition-progress::after {
    animation: none;
  }

  .live-sky-video,
  .sky-shift-enter-active,
  .sky-shift-leave-active {
    transition-duration: 0.01ms;
  }
}

/* iPhone Weather 벤치마킹: 배경 위 핵심 정보, 작은 유리 패널, 단계별 탐색 */
.map-panel {
  height: auto;
  align-self: stretch;
}

.map-panel :deep(.weather-map) {
  height: auto;
  min-height: clamp(560px, 68vh, 760px);
  flex: 1 1 auto;
  border-top: 1px solid #e2e8f0;
}

.summary-panel {
  padding: 17px 19px;
}

.compact-status-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.compact-status-heading h2 {
  font-size: 20px;
}

.compact-status-heading>div>p:last-child {
  margin: 4px 0 0;
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

.compact-status-heading .summary-number {
  margin: 0;
  color: #0f3767;
  font-size: clamp(42px, 5vw, 60px);
  line-height: 1;
}

.compact-status-heading .summary-number span {
  margin-left: 2px;
  color: inherit;
  font-size: .52em;
}

.status-primary-row,
.status-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.status-primary-row {
  margin-top: 13px;
  color: #334155;
  font-size: 12px;
  font-weight: 800;
}

.status-primary-row span+span::before {
  margin-right: 7px;
  color: #94a3b8;
  content: '·';
}

.status-tags {
  margin-top: 11px;
}

.status-tags span {
  padding: 5px 8px;
  border: 1px solid rgba(148, 163, 184, .18);
  border-radius: 999px;
  background: rgba(226, 232, 240, .52);
  color: #475569;
  font-size: 10px;
  font-weight: 800;
}

.national-average {
  margin: 10px 0 0;
  color: #64748b;
  font-size: 10px;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 5px;
  color: #64748b;
  font-size: 11px;
}

.breadcrumb button {
  display: inline;
  width: auto;
  padding: 0;
  background: transparent;
  color: #2563eb;
  font: inherit;
  font-weight: 800;
}

.breadcrumb i {
  color: #94a3b8;
  font-style: normal;
}

.breadcrumb strong {
  color: #334155;
}

.district-loading {
  display: grid;
  min-height: 160px;
  margin: 0;
  place-items: center;
  color: #64748b;
  font-size: 13px;
}

.video-error {
  display: block;
  margin-top: 8px;
  color: rgba(255, 255, 255, .62);
  font-size: 10px;
}

@media (max-width: 1180px) {
  .hero {
    grid-template-columns: 1fr 1fr;
  }

  .brand-block {
    grid-column: 1 / -1;
  }

  .content-grid {
    grid-template-columns: minmax(0, 1.35fr) minmax(350px, 0.8fr);
  }

  .sidebar-weather-list {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1000px) {
  .content-grid {
    grid-template-columns: 1fr;
  }

  .weather-map {
    height: 520px;
  }

  .map-panel :deep(.weather-map) {
    height: 520px;
    min-height: 520px;
    flex: none;
  }

  .sidebar-weather-list {
    max-height: 380px;
  }

  .landscape-primary-summary.is-detail-open {
    opacity: 0;
    pointer-events: none;
  }

  .landscape-info {
    right: 28px;
    left: 28px;
    width: auto;
    max-width: none;
  }

  .weather-page.is-landscape-detail-open .landscape-toolbar {
    opacity: 0;
    pointer-events: none;
  }
}

@media (max-width: 720px) {
  .weather-page {
    padding: 18px 14px 36px;
  }

  .hero {
    align-items: stretch;
    grid-template-columns: 1fr;
    padding: 28px 22px;
  }

  .brand-block {
    grid-column: auto;
  }

  .live-sky-status {
    border-top: 1px solid rgba(255, 255, 255, 0.22);
    border-left: 0;
  }

  .mode-switcher>span {
    display: none;
  }

  .landscape-view {
    min-height: 100svh;
    padding: 14px 14px 22px;
  }

  .landscape-toolbar {
    grid-template-columns: auto minmax(0, 1fr);
    gap: 8px;
    padding: 8px;
  }

  .window-break-button {
    grid-column: 1 / -1;
    width: 100%;
  }

  .landscape-toolbar label {
    justify-content: stretch;
    justify-self: stretch;
  }

  .landscape-toolbar label>span {
    display: none;
  }

  .landscape-toolbar select {
    min-width: 0;
    width: 100%;
  }

  .landscape-clock,
  .landscape-info-toggle {
    display: none;
  }

  .landscape-info {
    z-index: 10;
    top: 14px;
    right: 14px;
    bottom: 14px;
    left: 14px;
    padding: 20px;
    background: rgba(8, 40, 68, .86);
    backdrop-filter: blur(30px) saturate(125%);
  }

  .landscape-primary-summary {
    top: 48%;
    width: calc(100vw - 36px);
  }

  .landscape-primary-weather>strong {
    font-size: clamp(88px, 29vw, 128px);
  }

  .landscape-quick-strip>div {
    padding: 11px 9px;
  }

  .landscape-quick-strip strong {
    font-size: 10px;
  }

  .ambient-glance {
    right: 22px;
    bottom: 36px;
    left: 22px;
  }

  .commute-guide-heading {
    flex-direction: column;
    gap: 6px;
  }

  .commute-guide-items {
    grid-template-columns: 1fr;
  }

  .landscape-detail-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .scene-index-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .search-panel {
    width: 100%;
  }

  .weather-map {
    height: 400px;
  }

  .map-panel :deep(.weather-map) {
    height: 400px;
    min-height: 400px;
  }

  .dashboard-live-scene {
    min-height: 390px;
  }

  .live-scene-copy {
    right: 22px;
    bottom: 22px;
    left: 22px;
  }

  .sunset-scene {
    min-height: 420px;
  }

  .sunset-copy {
    right: 24px;
    bottom: 24px;
    left: 24px;
  }
}

@media (max-width: 440px) {
  .panel-heading {
    align-items: start;
    flex-direction: column;
  }

  .weather-modal {
    padding: 24px 18px;
  }

  .detail-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .summary-number {
    font-size: 52px;
  }

  .sidebar-card-actions {
    grid-template-columns: 1fr;
  }
}
</style>
