// motionIndex는 640px 표본 프레임을 1초 간격으로 비교한 화면 변화율입니다.
// 브라우저에서 playbackRate를 바꾸지 않고, 풍속과 가까운 움직임의 원본을 고르는 데 사용합니다.
const mediaBaseUrl = String(import.meta.env?.VITE_MEDIA_BASE_URL ?? '').replace(/\/$/, '')
const mediaUrl = (path) => `${mediaBaseUrl}${path}`

const MEDIA = Object.freeze({
  mediumClouds: Object.freeze({
    id: 'medium-clouds',
    src: mediaUrl('/weather-mockup/videos/pexels-clouds-medium-11868811.mp4'),
    motionIndex: 7.17,
    blurPx: 0.45,
    opacityScale: 0.78,
    containsSun: false,
    loopFadeSeconds: 4.2,
  }),
  fastClouds: Object.freeze({
    id: 'fast-clouds',
    src: mediaUrl('/weather-mockup/videos/pexels-clouds-fast-11595827.mp4'),
    motionIndex: 14.25,
    blurPx: 0.6,
    opacityScale: 0.72,
    containsSun: false,
    loopFadeSeconds: 4.2,
  }),
  softClouds: Object.freeze({
    id: 'soft-clouds',
    src: mediaUrl('/weather-mockup/videos/clouds-only.mp4'),
    motionIndex: 12.77,
    blurPx: 1.15,
    opacityScale: 0.68,
    containsSun: false,
    loopFadeSeconds: 2.2,
  }),
  distantClouds: Object.freeze({
    id: 'distant-clouds',
    src: mediaUrl('/weather-mockup/videos/clouds-drift.mp4'),
    motionIndex: 12.41,
    blurPx: 0.5,
    opacityScale: 0.76,
    containsSun: false,
    loopFadeSeconds: 3.8,
  }),
  overcastSky: Object.freeze({
    id: 'overcast-sky',
    src: mediaUrl('/weather-mockup/videos/pexels-overcast-5656141.mp4'),
    motionIndex: 3.27,
    blurPx: 0.65,
    opacityScale: 0.86,
    containsSun: false,
    loopFadeSeconds: 2.4,
  }),
  nightSky: Object.freeze({
    id: 'night-sky',
    src: mediaUrl('/weather-mockup/videos/pexels-night-7725992.mp4'),
    motionIndex: 1.93,
    blurPx: 0.45,
    opacityScale: 0.88,
    containsSun: false,
    loopFadeSeconds: 2.4,
  }),
})

// 절차형 태양과 겹치지 않는 구름·밤하늘 영상만 장면에 조합합니다.
const SOURCE_SETS = Object.freeze({
  clear: [MEDIA.mediumClouds],
  lightClouds: [MEDIA.mediumClouds, MEDIA.distantClouds],
  denseClouds: [MEDIA.overcastSky, MEDIA.mediumClouds, MEDIA.distantClouds],
  overcastClouds: [MEDIA.overcastSky, MEDIA.mediumClouds],
  rainClouds: [MEDIA.overcastSky, MEDIA.mediumClouds, MEDIA.distantClouds],
  warmClouds: [MEDIA.mediumClouds, MEDIA.distantClouds],
  windClouds: [MEDIA.mediumClouds, MEDIA.fastClouds],
  nightClouds: [MEDIA.nightSky],
})

const SOURCE_SET_BY_SCENE = Object.freeze({
  'clear-day': 'clear',
  'clear-night': 'nightClouds',
  'partly-cloudy-day': 'lightClouds',
  'partly-cloudy-night': 'nightClouds',
  'mostly-cloudy-day': 'denseClouds',
  'mostly-cloudy-night': 'nightClouds',
  overcast: 'overcastClouds',
  humid: 'overcastClouds',
  windy: 'windClouds',
  drizzle: 'rainClouds',
  'light-rain': 'rainClouds',
  'moderate-rain': 'rainClouds',
  'heavy-rain': 'rainClouds',
  shower: 'rainClouds',
  'violent-shower': 'rainClouds',
  sleet: 'rainClouds',
  'light-snow': 'denseClouds',
  snow: 'denseClouds',
  'heavy-snow': 'denseClouds',
  storm: 'rainClouds',
  sunset: 'warmClouds',
})

function normalizeSource(source, index) {
  if (typeof source === 'string') {
    return {
      id: `legacy-source-${index}`,
      src: source,
      motionIndex: 3.27,
      blurPx: 0.5,
      opacityScale: 1,
      containsSun: false,
      loopFadeSeconds: 3,
    }
  }

  return source
}

function stableHash(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function targetMotionIndex(weather) {
  const windSpeed = Number(weather?.windSpeed)
  if (!Number.isFinite(windSpeed)) return 4.2

  // 현재 서비스의 km/h 풍속을 원본 영상의 상대 움직임 지수로 변환합니다.
  const normalizedWind = Math.min(45, Math.max(0, windSpeed)) / 45
  return 3.1 + normalizedWind * 9.5
}

export function selectWeatherVideoSource(sources, weather = {}) {
  const normalizedSources = sources.map(normalizeSource).filter((source) => source?.src)
  if (!normalizedSources.length) return null

  const target = targetMotionIndex(weather)
  const weatherIdentity = String(weather?.id ?? weather?.name ?? 'default-weather')

  return normalizedSources
    .map((source) => ({
      source,
      score: Math.abs(Number(source.motionIndex ?? 3.27) - target)
        + (stableHash(`${weatherIdentity}:${source.id}`) / 0xffffffff) * 0.04,
    }))
    .sort((first, second) => first.score - second.score)[0].source
}

export function getWeatherVideoSources(group) {
  const sourceSet = SOURCE_SET_BY_SCENE[group] ?? 'lightClouds'
  return SOURCE_SETS[sourceSet]
}
