import assert from 'node:assert/strict'
import test from 'node:test'
import { convertLatLonToKmaGrid } from '../src/services/kmaWeather.js'
import { findWeatherLocation, getWeatherStatus } from '../src/data/weatherMockData.js'
import { getPrecipitationVisualProfile, getWeatherVideoGroup } from '../src/features/weather-scene/index.js'

test('서울 좌표를 기상청 동네예보 격자로 변환한다', () => {
  assert.deepEqual(convertLatLonToKmaGrid(37.5665, 126.978), { nx: 60, ny: 127 })
})

test('날씨 코드를 사용자 문구로 변환한다', () => {
  assert.equal(getWeatherStatus(0), '맑음')
  assert.equal(getWeatherStatus(63), '비')
  assert.equal(getWeatherStatus(95), '뇌우')
})

test('라우트 식별자로 고정 지역 정보를 찾는다', () => {
  const seoul = findWeatherLocation('seoul')
  assert.equal(seoul?.name, '서울특별시')
  assert.equal(findWeatherLocation('unknown-city'), null)
})

test('날씨 수치가 장면과 강수 효과로 분류된다', () => {
  assert.equal(getWeatherVideoGroup({ weatherCode: 0, isDay: 1, cloudCover: 10 }), 'clear-day')
  assert.equal(getWeatherVideoGroup({ weatherCode: 65, isDay: 1, cloudCover: 95 }), 'heavy-rain')

  const profile = getPrecipitationVisualProfile('heavy-rain', {
    weatherCode: 65,
    precipitation: 12,
    precipitationIntensity: 'heavy',
  })
  assert.ok(profile.density > 0)
  assert.ok(profile.maxCount >= 100)
})
