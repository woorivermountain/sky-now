import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

function kmaApiProxy(serviceKey) {
  return {
    name: 'sky-now-kma-api-proxy',
    configureServer(server) {
      server.middlewares.use('/api/kma-weather', async (request, response) => {
        response.setHeader('Content-Type', 'application/json; charset=utf-8')

        if (!serviceKey) {
          response.statusCode = 500
          response.end(JSON.stringify({ message: 'KMA_SERVICE_KEY가 설정되지 않았습니다.' }))
          return
        }

        try {
          const requestUrl = new URL(request.url ?? '', 'http://localhost')
          const endpoint = requestUrl.searchParams.get('endpoint') === 'nowcast'
            ? 'getUltraSrtNcst'
            : 'getUltraSrtFcst'
          const upstreamUrl = new URL(
            `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/${endpoint}`,
          )

          requestUrl.searchParams.forEach((value, key) => {
            if (key === 'endpoint') return
            upstreamUrl.searchParams.set(key, value)
          })
          upstreamUrl.searchParams.set('serviceKey', decodeURIComponent(serviceKey))

          const upstreamResponse = await fetch(upstreamUrl)
          const body = await upstreamResponse.text()
          response.statusCode = upstreamResponse.status
          response.end(body)
        } catch (error) {
          response.statusCode = 502
          response.end(JSON.stringify({ message: error.message }))
        }
      })
    },
  }
}

function astronomyApiProxy(serviceKey) {
  return {
    name: 'sky-now-astronomy-api-proxy',
    configureServer(server) {
      server.middlewares.use('/api/astronomy', async (request, response) => {
        response.setHeader('Content-Type', 'application/xml; charset=utf-8')

        if (!serviceKey) {
          response.statusCode = 500
          response.end('<error><message>ASTRONOMY_SERVICE_KEY가 설정되지 않았습니다.</message></error>')
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

          const upstreamResponse = await fetch(upstreamUrl)
          const body = await upstreamResponse.text()
          response.statusCode = upstreamResponse.status
          response.end(body)
        } catch (error) {
          response.statusCode = 502
          response.end(`<error><message>${error.message}</message></error>`)
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      vue(),
      vueDevTools(),
      kmaApiProxy(env.KMA_SERVICE_KEY),
      astronomyApiProxy(env.ASTRONOMY_SERVICE_KEY),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
