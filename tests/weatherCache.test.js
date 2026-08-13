import assert from 'node:assert/strict'
import test from 'node:test'
import { useWeatherCache } from '../src/composables/useWeatherCache.js'

function createMemoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('날씨 배열을 저장하고 다시 읽는다', () => {
  const cache = useWeatherCache({ prefix: 'test', storage: createMemoryStorage() })
  const weather = [{ id: 'seoul', temp: 24 }]

  cache.write('national', weather)

  assert.deepEqual(cache.read('national'), weather)
})

test('유효하지 않은 캐시는 화면 데이터로 사용하지 않는다', () => {
  const storage = createMemoryStorage()
  storage.setItem('test:national', '{broken-json')
  const cache = useWeatherCache({ prefix: 'test', storage })

  assert.equal(cache.read('national'), null)
})
