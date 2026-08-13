import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleAstronomyProxy, handleKmaProxy } from './weatherProxy.js'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const distDirectory = resolve(projectRoot, 'dist')
const port = Number(process.env.PORT || 4173)

function loadLocalEnvironment() {
  const envPath = resolve(projectRoot, '.env.local')
  if (!existsSync(envPath)) return

  readFileSync(envPath, 'utf8').split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match || process.env[match[1]] !== undefined) return

    const value = match[2].replace(/^(['"])(.*)\1$/, '$2')
    process.env[match[1]] = value
  })
}

loadLocalEnvironment()

const contentTypes = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
})

function serveFile(request, response, filePath) {
  const extension = extname(filePath).toLowerCase()
  response.statusCode = 200
  response.setHeader('Content-Type', contentTypes[extension] || 'application/octet-stream')
  const isHashedAsset = filePath.startsWith(resolve(distDirectory, 'assets') + sep)
  response.setHeader('Cache-Control', extension === '.html'
    ? 'no-cache'
    : isHashedAsset
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=86400')

  if (request.method === 'HEAD') {
    response.end()
    return
  }

  createReadStream(filePath).pipe(response)
}

async function requestHandler(request, response) {
  const requestUrl = new URL(request.url ?? '/', 'http://localhost')

  if (requestUrl.pathname === '/api/kma-weather') {
    await handleKmaProxy(request, response, process.env.KMA_SERVICE_KEY)
    return
  }

  if (requestUrl.pathname === '/api/astronomy') {
    await handleAstronomyProxy(request, response, process.env.ASTRONOMY_SERVICE_KEY)
    return
  }

  if (!['GET', 'HEAD'].includes(request.method ?? 'GET')) {
    response.statusCode = 405
    response.setHeader('Allow', 'GET, HEAD')
    response.end('Method Not Allowed')
    return
  }

  let pathname
  try {
    pathname = decodeURIComponent(requestUrl.pathname)
  } catch {
    response.statusCode = 400
    response.end('Bad Request')
    return
  }

  const requestedFile = resolve(distDirectory, pathname.replace(/^\/+/, ''))
  const isInsideDist = requestedFile === distDirectory || requestedFile.startsWith(`${distDirectory}${sep}`)
  const staticFile = isInsideDist && existsSync(requestedFile) && statSync(requestedFile).isFile()
    ? requestedFile
    : resolve(distDirectory, 'index.html')

  if (!existsSync(staticFile)) {
    response.statusCode = 503
    response.end('먼저 npm run build를 실행해 주세요.')
    return
  }

  serveFile(request, response, staticFile)
}

createServer((request, response) => {
  requestHandler(request, response).catch((error) => {
    console.error(error)
    if (!response.headersSent) response.statusCode = 500
    response.end('Internal Server Error')
  })
}).listen(port, '0.0.0.0', () => {
  console.log(`SKY NOW production server: http://localhost:${port}`)
})
