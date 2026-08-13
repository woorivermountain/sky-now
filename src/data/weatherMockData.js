import { REGION_DISTRICTS } from './weather/districts'
import { KOREA_REGIONS } from './weather/regions'

// 라우터 상세 페이지가 URL의 cityId로 찾을 수 있는 고정 위치 목록입니다.
// 날씨 수치는 API에서 받고, 이름과 좌표처럼 변하지 않는 기본 정보만 관리합니다.
export const WEATHER_MOCK_DATA = KOREA_REGIONS.flatMap((region) => {
  const districts = (REGION_DISTRICTS[region.id] ?? []).map((district) => ({
    ...district,
    city: region.name,
    parentRegionId: region.id,
    parentRegionName: region.name,
  }))

  return [{ ...region, parentRegionName: region.name }, ...districts]
})

export function findWeatherLocation(cityId) {
  return WEATHER_MOCK_DATA.find((location) => location.id === cityId) ?? null
}

export function getWeatherStatus(code) {
  if (code === 0) return '맑음'
  if (code === 1) return '대체로 맑음'
  if (code === 2) return '부분적으로 흐림'
  if (code === 3) return '흐림'
  if ([45, 48].includes(code)) return '안개'
  if ([51, 53, 55, 56, 57].includes(code)) return '이슬비'
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '비'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '눈'
  if ([95, 96, 99].includes(code)) return '뇌우'
  return '기타'
}

// 외부 API가 일시적으로 응답하지 않아도 화면이 비지 않도록 만드는 계절 기준 기본값입니다.
// 실시간 관측값이 아니므로 사용하는 화면에서 반드시 기본 데이터임을 안내합니다.
export function createFallbackWeather(location, index = 0, parentRegionId = '') {
  const now = new Date()
  const month = now.getMonth()
  const seasonalAverage = [-1, 2, 8, 15, 20, 24, 27, 28, 23, 16, 9, 2][month]
  const latitudeAdjustment = (36 - Number(location.latitude)) * 0.7
  const locationAdjustment = ((index % 5) - 2) * 0.6
  const temp = Math.round((seasonalAverage + latitudeAdjustment + locationAdjustment) * 10) / 10
  const weatherCodes = [1, 2, 2, 3, 1, 3]
  const weatherCode = weatherCodes[index % weatherCodes.length]
  const cloudCover = weatherCode === 1 ? 22 : weatherCode === 2 ? 52 : 82
  const humidity = 58 + (index % 5) * 5
  const koreaDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  const sunriseHours = ['07:45', '07:20', '06:40', '05:55', '05:25', '05:10', '05:25', '05:50', '06:15', '06:40', '07:10', '07:35']
  const sunsetHours = ['17:40', '18:10', '18:40', '19:05', '19:30', '19:50', '19:45', '19:15', '18:30', '17:50', '17:25', '17:25']
  const currentHour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    hour12: false,
  }).format(now))
  const sunriseHour = Number(sunriseHours[month].slice(0, 2))
  const sunsetHour = Number(sunsetHours[month].slice(0, 2))

  return {
    ...location,
    parentRegionId,
    temp,
    feelsLike: Math.round((temp + (humidity >= 70 ? 1.2 : 0.4)) * 10) / 10,
    humidity,
    precipitation: weatherCode === 3 ? 0.2 : 0,
    windSpeed: Math.round((5 + (index % 6) * 1.4) * 10) / 10,
    windDirection: (index * 35 + 180) % 360,
    windGusts: Math.round((10 + (index % 5) * 2.1) * 10) / 10,
    cloudCover,
    pressureMsl: 1012 + (index % 4),
    surfacePressure: 1008 + (index % 4),
    visibility: 20000 - (index % 4) * 1500,
    rain: 0,
    snowfall: 0,
    isDay: currentHour >= sunriseHour && currentHour < sunsetHour ? 1 : 0,
    observationTime: `${koreaDate}T${String(currentHour).padStart(2, '0')}:00`,
    weatherCode,
    status: getWeatherStatus(weatherCode),
    sunrise: `${koreaDate}T${sunriseHours[month]}`,
    sunset: `${koreaDate}T${sunsetHours[month]}`,
    tempMax: Math.round((temp + 3) * 10) / 10,
    tempMin: Math.round((temp - 4) * 10) / 10,
    precipitationProbability: weatherCode === 3 ? 40 : weatherCode === 2 ? 20 : 10,
    precipitationSum: weatherCode === 3 ? 0.4 : 0,
    rainSum: weatherCode === 3 ? 0.4 : 0,
    snowfallSum: 0,
    daylightDuration: (sunsetHour - sunriseHour) * 3600,
    sunshineDuration: Math.round((sunsetHour - sunriseHour) * (1 - cloudCover / 125) * 3600),
    uvIndexMax: Math.max(1, Math.round(8 - cloudCover / 18)),
    dataSource: 'seasonal-fallback',
  }
}
