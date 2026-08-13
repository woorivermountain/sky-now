const KMA_ENDPOINTS = Object.freeze({
  nowcast: 'getUltraSrtNcst',
  forecast: 'getUltraSrtFcst',
})

function sendError(response, statusCode, message, contentType = 'application/json; charset=utf-8') {
  response.statusCode = statusCode
  response.setHeader('Content-Type', contentType)
  response.end(JSON.stringify({ message }))
}

async function pipeUpstream(response, upstreamUrl, contentType) {
  const upstreamResponse = await fetch(upstreamUrl, {
    headers: { Accept: contentType },
    signal: AbortSignal.timeout(12_000),
  })
  const body = await upstreamResponse.text()

  response.statusCode = upstreamResponse.status
  response.setHeader('Content-Type', upstreamResponse.headers.get('content-type') || contentType)
  response.setHeader('Cache-Control', 'no-store')
  response.end(body)
}

export async function handleKmaProxy(request, response, serviceKey) {
  if (!serviceKey) {
    sendError(response, 500, 'KMA_SERVICE_KEY가 설정되지 않았습니다.')
    return
  }

  try {
    const requestUrl = new URL(request.url ?? '', 'http://localhost')
    const endpoint = KMA_ENDPOINTS[requestUrl.searchParams.get('endpoint')] ?? KMA_ENDPOINTS.forecast
    const upstreamUrl = new URL(
      `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/${endpoint}`,
    )

    requestUrl.searchParams.forEach((value, key) => {
      if (key !== 'endpoint') upstreamUrl.searchParams.set(key, value)
    })
    upstreamUrl.searchParams.set('serviceKey', decodeURIComponent(serviceKey))

    await pipeUpstream(response, upstreamUrl, 'application/json; charset=utf-8')
  } catch (error) {
    sendError(response, 502, error instanceof Error ? error.message : '기상청 요청에 실패했습니다.')
  }
}

export async function handleAstronomyProxy(request, response, serviceKey) {
  if (!serviceKey) {
    sendError(response, 500, 'ASTRONOMY_SERVICE_KEY가 설정되지 않았습니다.')
    return
  }

  try {
    const requestUrl = new URL(request.url ?? '', 'http://localhost')
    const upstreamUrl = new URL(
      'https://apis.data.go.kr/B090041/openapi/service/RiseSetInfoService/getAreaRiseSetInfo',
    )

    requestUrl.searchParams.forEach((value, key) => {
      upstreamUrl.searchParams.set(key, value)
    })
    upstreamUrl.searchParams.set('serviceKey', decodeURIComponent(serviceKey))

    await pipeUpstream(response, upstreamUrl, 'application/xml; charset=utf-8')
  } catch (error) {
    sendError(response, 502, error instanceof Error ? error.message : '출몰시각 요청에 실패했습니다.')
  }
}
