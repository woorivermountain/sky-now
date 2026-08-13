import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import { handleAstronomyProxy, handleKmaProxy } from './server/weatherProxy.js'

function kmaApiProxy(serviceKey) {
  return {
    name: 'sky-now-kma-api-proxy',
    configureServer(server) {
      server.middlewares.use('/api/kma-weather', async (request, response) => {
        await handleKmaProxy(request, response, serviceKey)
      })
    },
  }
}

function astronomyApiProxy(serviceKey) {
  return {
    name: 'sky-now-astronomy-api-proxy',
    configureServer(server) {
      server.middlewares.use('/api/astronomy', async (request, response) => {
        await handleAstronomyProxy(request, response, serviceKey)
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
