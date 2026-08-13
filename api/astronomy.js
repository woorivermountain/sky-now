import { handleAstronomyProxy } from '../server/weatherProxy.js'

export default async function handler(request, response) {
  await handleAstronomyProxy(request, response, globalThis.process.env.ASTRONOMY_SERVICE_KEY)
}
