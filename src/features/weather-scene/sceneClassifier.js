import { WEATHER_SCENE_PROFILES } from './sceneProfiles.js'

const RAIN_CODE_FALLBACKS = new Map([
  [51, 'drizzle'],
  [61, 'light-rain'],
  [63, 'moderate-rain'],
  [65, 'heavy-rain'],
  [67, 'sleet'],
  [71, 'light-snow'],
  [73, 'snow'],
  [75, 'heavy-snow'],
  [80, 'shower'],
  [82, 'violent-shower'],
  [95, 'storm'],
])

function getRainGroup(intensity) {
  if (intensity === 'trace') return 'drizzle'
  if (intensity === 'light') return 'light-rain'
  if (intensity === 'heavy' || intensity === 'extreme') return 'heavy-rain'
  return 'moderate-rain'
}

function getPrecipitationGroup(weather) {
  const precipitationType = Number(weather.kmaCodes?.precipitationType ?? 0)
  const intensity = weather.precipitationIntensity ?? 'none'

  if (precipitationType === 1) return getRainGroup(intensity)
  if ([2, 6].includes(precipitationType)) return 'sleet'
  if (precipitationType === 3) return ['heavy', 'extreme'].includes(intensity) ? 'heavy-snow' : 'snow'
  if (precipitationType === 4) return ['heavy', 'extreme'].includes(intensity) ? 'violent-shower' : 'shower'
  if (precipitationType === 5) return 'drizzle'
  if (precipitationType === 7) return 'light-snow'

  return RAIN_CODE_FALLBACKS.get(Number(weather.weatherCode)) ?? null
}

export function getWeatherVideoGroup(weather, phase = 'midday') {
  if (!weather) return 'partly-cloudy-day'

  const precipitationGroup = getPrecipitationGroup(weather)
  if (precipitationGroup) return precipitationGroup

  const skyCode = Number(weather.kmaCodes?.sky ?? 0)
  const cloudCover = Number(weather.cloudCover ?? 30)
  const humidity = Number(weather.humidity ?? 0)
  const windSpeed = Number(weather.windSpeed ?? 0)
  const isNight = weather.isDay === 0 || ['night', 'dusk'].includes(phase)

  if (skyCode === 4 || cloudCover >= 76) {
    if (humidity >= 88) return 'humid'
    return 'overcast'
  }
  if (windSpeed >= 28 && cloudCover >= 35) return 'windy'
  if (skyCode === 3 || cloudCover >= 45) return isNight ? 'mostly-cloudy-night' : 'mostly-cloudy-day'
  if (cloudCover >= 20) return isNight ? 'partly-cloudy-night' : 'partly-cloudy-day'
  if (['golden-hour', 'sunrise'].includes(phase)) return 'sunset'
  return isNight ? 'clear-night' : 'clear-day'
}

export function getWeatherSceneProfile(weather, phase = 'midday') {
  const group = getWeatherVideoGroup(weather, phase)
  return { group, ...WEATHER_SCENE_PROFILES[group] }
}
