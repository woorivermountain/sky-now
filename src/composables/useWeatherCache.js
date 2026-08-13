const DEFAULT_PREFIX = 'sky-now-weather-v5-kma-kasi'
const DEFAULT_MAX_AGE = 10 * 60 * 1000

export function useWeatherCache({
  prefix = DEFAULT_PREFIX,
  maxAge = DEFAULT_MAX_AGE,
  storage = typeof window === 'undefined' ? null : window.localStorage,
} = {}) {
  function read(key, allowStale = false) {
    if (!storage) return null

    try {
      const rawCache = storage.getItem(`${prefix}:${key}`)
      if (!rawCache) return null

      const cached = JSON.parse(rawCache)
      const cacheAge = Date.now() - Number(cached.timestamp)
      if (!allowStale && cacheAge > maxAge) return null
      if (!Array.isArray(cached.data)) return null
      return cached.data
    } catch {
      return null
    }
  }

  function write(key, data) {
    if (!storage) return

    try {
      storage.setItem(`${prefix}:${key}`, JSON.stringify({
        timestamp: Date.now(),
        data,
      }))
    } catch {
      // 저장 공간을 사용할 수 없는 브라우저에서는 메모리 상태만 사용합니다.
    }
  }

  return { read, write }
}
