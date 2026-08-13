import { createFallbackWeather } from '../data/weatherMockData.js'
import { fetchKmaNowcast, fetchKmaUltraShortForecast } from '../api/kmaApi.js'
import { fetchAstronomyForLocation } from './astronomyService.js'

const KMA_GRID = {
  earthRadius: 6371.00877,
  gridSpacing: 5,
  standardParallel1: 30,
  standardParallel2: 60,
  originLongitude: 126,
  originLatitude: 38,
  originX: 43,
  originY: 136,
}

function toRadians(value) {
  return value * Math.PI / 180
}

// 기상청 동네예보용 Lambert Conformal Conic 격자 좌표 변환입니다.
export function convertLatLonToKmaGrid(latitude, longitude) {
  const radius = KMA_GRID.earthRadius / KMA_GRID.gridSpacing
  const parallel1 = toRadians(KMA_GRID.standardParallel1)
  const parallel2 = toRadians(KMA_GRID.standardParallel2)
  const originLongitude = toRadians(KMA_GRID.originLongitude)
  const originLatitude = toRadians(KMA_GRID.originLatitude)
  const sn = Math.log(Math.cos(parallel1) / Math.cos(parallel2))
    / Math.log(Math.tan(Math.PI * 0.25 + parallel2 * 0.5) / Math.tan(Math.PI * 0.25 + parallel1 * 0.5))
  const sf = (Math.tan(Math.PI * 0.25 + parallel1 * 0.5) ** sn * Math.cos(parallel1)) / sn
  const ro = radius * sf / (Math.tan(Math.PI * 0.25 + originLatitude * 0.5) ** sn)
  const latitudeRadians = toRadians(latitude)
  const longitudeRadians = toRadians(longitude)
  const ra = radius * sf / (Math.tan(Math.PI * 0.25 + latitudeRadians * 0.5) ** sn)
  let theta = longitudeRadians - originLongitude

  if (theta > Math.PI) theta -= 2 * Math.PI
  if (theta < -Math.PI) theta += 2 * Math.PI
  theta *= sn

  return {
    nx: Math.floor(ra * Math.sin(theta) + KMA_GRID.originX + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + KMA_GRID.originY + 0.5),
  }
}

function getKoreaParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  return Object.fromEntries(parts.map((part) => [part.type, part.value]))
}

// 초단기예보는 매시 30분에 생산되며, 안정적으로 공개된 가장 최근 발표 시각을 선택합니다.
function getLatestUltraShortBaseTime() {
  const koreaNow = getKoreaParts()
  let baseDate = `${koreaNow.year}${koreaNow.month}${koreaNow.day}`
  let baseHour = Number(koreaNow.hour)

  if (Number(koreaNow.minute) < 45) baseHour -= 1

  if (baseHour < 0) {
    const previousDay = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const previousParts = getKoreaParts(previousDay)
    baseDate = `${previousParts.year}${previousParts.month}${previousParts.day}`
    baseHour = 23
  }

  return {
    baseDate,
    baseTime: `${String(baseHour).padStart(2, '0')}30`,
  }
}

// 초단기실황은 매시 정각 자료이며, API 반영 지연을 고려해 15분 이후부터 현재 시 자료를 사용합니다.
function getLatestUltraShortNowcastBaseTime() {
  const koreaNow = getKoreaParts()
  let baseDate = `${koreaNow.year}${koreaNow.month}${koreaNow.day}`
  let baseHour = Number(koreaNow.hour)

  if (Number(koreaNow.minute) < 15) baseHour -= 1

  if (baseHour < 0) {
    const previousDay = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const previousParts = getKoreaParts(previousDay)
    baseDate = `${previousParts.year}${previousParts.month}${previousParts.day}`
    baseHour = 23
  }

  return {
    baseDate,
    baseTime: `${String(baseHour).padStart(2, '0')}00`,
  }
}

function parsePrecipitation(value, precipitationType = 0) {
  const raw = String(value ?? '')
  if (!raw || raw === '강수없음' || precipitationType === 0) {
    return { amount: 0, intensity: 'none', raw }
  }

  if (raw.includes('1.0mm 미만')) {
    return { amount: 0.5, intensity: 'trace', raw }
  }

  const amount = Number.parseFloat(raw) || 0
  let intensity

  if (precipitationType === 5 || amount < 0.2) intensity = 'trace'
  else if (amount < 1) intensity = 'light'
  else if (amount < 5) intensity = 'moderate'
  else if (amount < 15) intensity = 'heavy'
  else intensity = 'extreme'

  if (raw.includes('30.0~50.0') || raw.includes('50.0mm 이상')) intensity = 'extreme'

  return { amount, intensity, raw }
}

function getKmaWeatherProfile(skyCode, precipitationType, precipitationData) {
  const precipitationProfiles = {
    2: { status: '비와 눈', weatherCode: 67, cloudCover: 94 },
    3: { status: '눈', weatherCode: 73, cloudCover: 94 },
    4: { status: '소나기', weatherCode: 80, cloudCover: 94 },
    5: { status: '빗방울', weatherCode: 51, cloudCover: 82 },
    6: { status: '빗방울과 눈날림', weatherCode: 67, cloudCover: 88 },
    7: { status: '눈날림', weatherCode: 71, cloudCover: 88 },
  }

  if (precipitationType === 1) {
    if (['trace', 'light'].includes(precipitationData.intensity)) return { status: '약한 비', weatherCode: 61, cloudCover: 88 }
    if (precipitationData.intensity === 'moderate') return { status: '비', weatherCode: 63, cloudCover: 92 }
    return { status: '강한 비', weatherCode: 65, cloudCover: 96 }
  }

  if (precipitationType === 4 && ['heavy', 'extreme'].includes(precipitationData.intensity)) {
    return { status: '강한 소나기', weatherCode: 82, cloudCover: 97 }
  }

  if (precipitationProfiles[precipitationType]) return precipitationProfiles[precipitationType]
  if (skyCode === 1) return { status: '맑음', weatherCode: 0, cloudCover: 15 }
  if (skyCode === 3) return { status: '구름 많음', weatherCode: 2, cloudCover: 58 }
  return { status: '흐림', weatherCode: 3, cloudCover: 88 }
}

function getForecastValues(items) {
  const groupedByTime = new Map()

  items.forEach((item) => {
    const key = `${item.fcstDate}${item.fcstTime}`
    const values = groupedByTime.get(key) ?? {}
    values[item.category] = item.fcstValue
    groupedByTime.set(key, values)
  })

  const koreaNow = getKoreaParts()
  const currentKey = `${koreaNow.year}${koreaNow.month}${koreaNow.day}${koreaNow.hour}${koreaNow.minute}`
  const forecastKey = [...groupedByTime.keys()].sort().find((key) => key >= currentKey)
    ?? [...groupedByTime.keys()].sort()[0]

  // 초단기예보 범위 안에 오늘 18시가 포함될 때 퇴근 시각 예보도 함께 꺼냅니다.
  const commuteTargetKey = `${koreaNow.year}${koreaNow.month}${koreaNow.day}1800`
  const commuteKey = [...groupedByTime.keys()].sort().find((key) => key >= commuteTargetKey)
  const isSameCommuteWindow = commuteKey?.slice(0, 8) === commuteTargetKey.slice(0, 8)
    && Number(commuteKey.slice(8, 10)) <= 19

  return {
    forecastKey,
    values: groupedByTime.get(forecastKey) ?? {},
    commuteKey: isSameCommuteWindow ? commuteKey : null,
    commuteValues: isSameCommuteWindow ? groupedByTime.get(commuteKey) ?? {} : null,
  }
}

function getObservationValues(items) {
  return items.reduce((values, item) => {
    values[item.category] = item.obsrValue
    return values
  }, {})
}

function calculateFeelsLike(temp, humidity, windSpeedMs) {
  const humidityEffect = Math.max(0, humidity - 60) * 0.035
  const windEffect = Math.min(1.8, windSpeedMs * 0.1)
  return Math.round((temp + humidityEffect - windEffect) * 10) / 10
}

export async function fetchKmaWeather(location, index = 0, parentRegionId = '') {
  const fallback = createFallbackWeather(location, index, parentRegionId)
  const astronomyPromise = fetchAstronomyForLocation(location, parentRegionId).catch((error) => {
    console.warn(`${location.name} 출몰시각 요청 실패, 계절 기준값을 사용합니다.`, error.message)
    return null
  })
  const { nx, ny } = convertLatLonToKmaGrid(location.latitude, location.longitude)
  const { baseDate, baseTime } = getLatestUltraShortBaseTime()
  const nowcastBase = getLatestUltraShortNowcastBaseTime()
  const commonParams = {
    pageNo: '1',
    numOfRows: '1000',
    dataType: 'JSON',
    nx: String(nx),
    ny: String(ny),
  }

  const [items, observationItems] = await Promise.all([
    fetchKmaUltraShortForecast({ ...commonParams, base_date: baseDate, base_time: baseTime }),
    fetchKmaNowcast({
      ...commonParams,
      base_date: nowcastBase.baseDate,
      base_time: nowcastBase.baseTime,
    }).catch((error) => {
      console.warn(`${location.name} 초단기실황 요청 실패, 예보값을 사용합니다.`, error.message)
      return null
    }),
  ])
  const astronomy = await astronomyPromise

  const { forecastKey, values, commuteKey, commuteValues } = getForecastValues(items)
  const observedValues = observationItems ? getObservationValues(observationItems) : null
  const currentValues = observedValues ?? values
  const temp = Number(currentValues.T1H ?? values.T1H ?? fallback.temp)
  const humidity = Number(currentValues.REH ?? values.REH ?? fallback.humidity)
  const windSpeedMs = Number(currentValues.WSD ?? values.WSD ?? 0)
  const skyCode = Number(values.SKY ?? 4)
  const precipitationType = Number(currentValues.PTY ?? values.PTY ?? 0)
  const precipitationData = parsePrecipitation(currentValues.RN1 ?? values.RN1, precipitationType)
  const precipitation = precipitationData.amount
  const weatherProfile = getKmaWeatherProfile(skyCode, precipitationType, precipitationData)
  const commutePrecipitationType = Number(commuteValues?.PTY ?? 0)
  const commutePrecipitationData = commuteValues
    ? parsePrecipitation(commuteValues.RN1, commutePrecipitationType)
    : null
  const commuteProfile = commuteValues
    ? getKmaWeatherProfile(
      Number(commuteValues.SKY ?? 4),
      commutePrecipitationType,
      commutePrecipitationData,
    )
    : null

  return {
    ...fallback,
    ...location,
    ...astronomy,
    parentRegionId,
    temp,
    feelsLike: calculateFeelsLike(temp, humidity, windSpeedMs),
    humidity,
    precipitation,
    precipitationIntensity: precipitationData.intensity,
    precipitationRaw: precipitationData.raw,
    precipitationProbability: Number(values.POP ?? 0),
    windSpeed: Math.round(windSpeedMs * 3.6 * 10) / 10,
    windDirection: Number(currentValues.VEC ?? values.VEC ?? fallback.windDirection),
    windGusts: Math.round(windSpeedMs * 4.5 * 10) / 10,
    cloudCover: weatherProfile.cloudCover,
    weatherCode: weatherProfile.weatherCode,
    status: weatherProfile.status,
    observationTime: observedValues
      ? `${nowcastBase.baseDate.slice(0, 4)}-${nowcastBase.baseDate.slice(4, 6)}-${nowcastBase.baseDate.slice(6, 8)}T${nowcastBase.baseTime.slice(0, 2)}:${nowcastBase.baseTime.slice(2, 4)}`
      : forecastKey
        ? `${forecastKey.slice(0, 4)}-${forecastKey.slice(4, 6)}-${forecastKey.slice(6, 8)}T${forecastKey.slice(8, 10)}:${forecastKey.slice(10, 12)}`
      : fallback.observationTime,
    tempMax: Math.max(temp, fallback.tempMax),
    tempMin: Math.min(temp, fallback.tempMin),
    uvIndexMax: Math.max(1, Math.round(8 - weatherProfile.cloudCover / 18)),
    commuteForecast: commuteValues ? {
      forecastTime: commuteKey,
      temp: Number(commuteValues.T1H ?? temp),
      humidity: Number(commuteValues.REH ?? humidity),
      precipitation: commutePrecipitationData.amount,
      precipitationIntensity: commutePrecipitationData.intensity,
      windSpeed: Math.round(Number(commuteValues.WSD ?? windSpeedMs) * 3.6 * 10) / 10,
      status: commuteProfile.status,
      weatherCode: commuteProfile.weatherCode,
      cloudCover: commuteProfile.cloudCover,
    } : null,
    kmaCodes: {
      sky: skyCode,
      precipitationType,
      forecastTime: forecastKey,
      observationTime: observedValues ? `${nowcastBase.baseDate}${nowcastBase.baseTime}` : null,
    },
    dataSource: observedValues ? 'kma-nowcast+ultra-short-forecast' : 'kma-ultra-short-forecast',
  }
}

export async function fetchKmaWeatherForLocations(locations, parentRegionId = '') {
  const results = []
  const concurrency = 5

  for (let start = 0; start < locations.length; start += concurrency) {
    const batch = locations.slice(start, start + concurrency)
    const batchResults = await Promise.all(batch.map(async (location, batchIndex) => {
      const index = start + batchIndex
      try {
        return await fetchKmaWeather(location, index, parentRegionId)
      } catch (error) {
        console.warn(`${location.name} 기상청 데이터 요청 실패:`, error.message)
        return createFallbackWeather(location, index, parentRegionId)
      }
    }))
    results.push(...batchResults)
  }

  if (results.every((weather) => weather.dataSource === 'seasonal-fallback')) {
    throw new Error('기상청 데이터를 불러오지 못했습니다.')
  }

  return results
}
