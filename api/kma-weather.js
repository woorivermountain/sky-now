import { handleKmaProxy } from '../server/weatherProxy.js'

export default async function handler(request, response) {
  await handleKmaProxy(request, response, globalThis.process.env.KMA_SERVICE_KEY)
}
