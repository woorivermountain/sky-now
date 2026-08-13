import { fetchAreaRiseSet } from '../api/astronomyApi.js'

const riseSetCache = new Map()

const ASTRONOMY_AREA_BY_REGION_ID = {
  seoul: '서울', busan: '부산', daegu: '대구', incheon: '인천', gwangju: '광주',
  daejeon: '대전', ulsan: '울산', sejong: '세종', gyeonggi: '수원', gangwon: '춘천',
  chungbuk: '청주', chungnam: '홍성', jeonbuk: '전주', jeonnam: '무안',
  gyeongbuk: '안동', gyeongnam: '창원', jeju: '제주',
}

const ASTRONOMY_AREA_COORDINATES = [
  ['서울', 37.5665, 126.978], ['부산', 35.1796, 129.0756], ['대구', 35.8714, 128.6014],
  ['인천', 37.4563, 126.7052], ['광주', 35.1595, 126.8526], ['대전', 36.3504, 127.3845],
  ['울산', 35.5384, 129.3114], ['세종', 36.4801, 127.289], ['수원', 37.2636, 127.0286],
  ['춘천', 37.8813, 127.73], ['청주', 36.6424, 127.489], ['홍성', 36.6012, 126.6608],
  ['전주', 35.8242, 127.148], ['무안', 34.9904, 126.4817], ['안동', 36.576, 128.5056],
  ['창원', 35.228, 128.6811], ['제주', 33.4996, 126.5312],
]

function getKoreaDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date)
}

function normalizeTime(value) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 4)
  return digits.length === 4 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : null
}

function resolveAstronomyArea(location, parentRegionId = '') {
  const regionId = parentRegionId || location.parentRegionId || location.id
  if (ASTRONOMY_AREA_BY_REGION_ID[regionId]) return ASTRONOMY_AREA_BY_REGION_ID[regionId]

  const latitude = Number(location.latitude)
  const longitude = Number(location.longitude)
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return ASTRONOMY_AREA_COORDINATES.reduce((nearest, candidate) => {
      const distance = (latitude - candidate[1]) ** 2 + (longitude - candidate[2]) ** 2
      return distance < nearest.distance ? { area: candidate[0], distance } : nearest
    }, { area: '서울', distance: Number.POSITIVE_INFINITY }).area
  }

  return location.city || location.name
}

export async function fetchAstronomyForLocation(location, parentRegionId = '') {
  const koreaDate = getKoreaDate()
  const area = resolveAstronomyArea(location, parentRegionId)
  const cacheKey = `${koreaDate}:${area}`

  if (!riseSetCache.has(cacheKey)) {
    riseSetCache.set(cacheKey, fetchAreaRiseSet({
      locdate: koreaDate.replaceAll('-', ''), location: area,
    }).catch((error) => {
      riseSetCache.delete(cacheKey)
      throw error
    }))
  }

  const data = await riseSetCache.get(cacheKey)
  const sunrise = normalizeTime(data.sunrise)
  const sunset = normalizeTime(data.sunset)
  const civilMorning = normalizeTime(data.civilMorning)
  const civilEvening = normalizeTime(data.civilEvening)

  if (!sunrise || !sunset) throw new Error(`${area}의 일출·일몰 시간이 없습니다.`)

  const sunriseMinutes = Number(sunrise.slice(0, 2)) * 60 + Number(sunrise.slice(3))
  const sunsetMinutes = Number(sunset.slice(0, 2)) * 60 + Number(sunset.slice(3))

  return {
    sunrise: `${koreaDate}T${sunrise}`,
    sunset: `${koreaDate}T${sunset}`,
    civilTwilightMorning: civilMorning ? `${koreaDate}T${civilMorning}` : null,
    civilTwilightEvening: civilEvening ? `${koreaDate}T${civilEvening}` : null,
    daylightDuration: Math.max(0, sunsetMinutes - sunriseMinutes) * 60,
    astronomyLocation: data.location || area,
    astronomyDataSource: 'kasi-rise-set',
  }
}
