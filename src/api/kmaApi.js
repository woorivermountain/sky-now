import { apiClient } from './httpClient.js'

function validateKmaResponse(data, endpoint) {
  const resultCode = data.response?.header?.resultCode
  const items = data.response?.body?.items?.item

  if (resultCode !== '00' || !Array.isArray(items) || !items.length) {
    throw new Error(data.response?.header?.resultMsg || `기상청 ${endpoint} 데이터가 없습니다.`)
  }

  return items
}

async function requestKmaItems(endpoint, params) {
  const { data } = await apiClient.get('/api/kma-weather', {
    params: { ...params, endpoint },
  })

  return validateKmaResponse(data, endpoint)
}

// 기온·습도·강수·풍속처럼 현재 관측에 가까운 값을 요청합니다.
export function fetchKmaNowcast(params) {
  return requestKmaItems('nowcast', params)
}

// SKY 하늘 상태와 퇴근 시각 등 가까운 미래 예보를 요청합니다.
export function fetchKmaUltraShortForecast(params) {
  return requestKmaItems('forecast', params)
}
