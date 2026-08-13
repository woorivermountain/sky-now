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
import { useWeatherCache } from '../../composables/useWeatherCache'

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
const { read: readWeatherCache, write: writeWeatherCache } = useWeatherCache()

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

<style scoped src="./WeatherHome.css"></style>
