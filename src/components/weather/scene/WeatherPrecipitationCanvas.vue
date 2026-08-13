<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getPrecipitationVisualProfile } from '../../../features/weather-scene/index.js'

const props = defineProps({
  group: { type: String, required: true },
  weather: { type: Object, default: () => ({}) },
  active: { type: Boolean, default: true },
})

const canvas = ref(null)
const visualProfile = computed(() => getPrecipitationVisualProfile(props.group, props.weather))

let context
let width = 0
let height = 0
let deviceScale = 1
let animationFrameId = 0
let lastTimestamp = 0
let lastRenderTimestamp = 0
let particles = []
let lensDrops = []
let resizeObserver
let reducedMotionQuery
let isReducedMotion = false

function createRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

function getSeed() {
  return [...props.group].reduce((total, character) => total + character.charCodeAt(0), 17)
    + Math.round(width) * 3
    + Math.round(height) * 7
}

function createParticle(random, profile, randomizeY = true) {
  const depth = 0.18 + random() * 0.82
  const minSpeed = profile.speed[0]
  const maxSpeed = profile.speed[1]

  return {
    x: random() * width,
    y: randomizeY ? random() * height : -30 - random() * height * 0.15,
    depth,
    speed: minSpeed + (maxSpeed - minSpeed) * depth,
    length: profile.length[0] + (profile.length[1] - profile.length[0]) * depth,
    width: 0.35 + depth * 0.75,
    alpha: profile.alpha * (0.28 + depth * 0.72),
  }
}

function rebuildParticles() {
  const profile = visualProfile.value
  particles = []
  lensDrops = []
  if (!profile || !width || !height) return

  const random = createRandom(getSeed())
  const areaCount = Math.round((width * height / 100000) * profile.density)
  const particleCount = Math.min(profile.maxCount, Math.max(profile.minCount, areaCount))
  particles = Array.from({ length: particleCount }, () => createParticle(random, profile))
  lensDrops = Array.from({ length: profile.lensDrops }, () => ({
    x: width * (0.08 + random() * 0.84),
    y: height * (0.08 + random() * 0.76),
    radiusX: 2.2 + random() * 4.5,
    radiusY: 4 + random() * 8,
    alpha: 0.035 + random() * 0.055,
    speed: 2 + random() * 5,
  }))
}

function resizeCanvas() {
  const element = canvas.value
  const bounds = element?.parentElement?.getBoundingClientRect()
  if (!element || !bounds?.width || !bounds?.height) return

  width = bounds.width
  height = bounds.height
  deviceScale = Math.min(window.devicePixelRatio || 1, 1.5)
  element.width = Math.round(width * deviceScale)
  element.height = Math.round(height * deviceScale)
  element.style.width = `${width}px`
  element.style.height = `${height}px`
  context = element.getContext('2d')
  context.setTransform(deviceScale, 0, 0, deviceScale, 0, 0)
  rebuildParticles()
}

function resetParticle(particle, profile, random) {
  Object.assign(particle, createParticle(random, profile, false))
}

function drawRain(deltaSeconds) {
  const profile = visualProfile.value
  if (!context || !profile) return

  const random = createRandom(Math.round(lastTimestamp) + getSeed())
  const directionRadians = profile.windDirection * Math.PI / 180
  const horizontalSpeed = -Math.sin(directionRadians) * profile.windSpeed * 3.2

  context.clearRect(0, 0, width, height)
  context.lineCap = 'round'
  context.globalCompositeOperation = 'screen'

  particles.forEach((particle) => {
    const drift = horizontalSpeed * (0.42 + particle.depth * 0.58)
    particle.x += drift * deltaSeconds
    particle.y += particle.speed * deltaSeconds

    if (particle.y - particle.length > height || particle.x < -80 || particle.x > width + 80) {
      resetParticle(particle, profile, random)
      if (drift > 0) particle.x = -20 - random() * 30
      if (drift < 0) particle.x = width + 20 + random() * 30
    }

    const tailX = particle.x - drift * 0.035
    const tailY = particle.y - particle.length
    context.beginPath()
    context.moveTo(tailX, tailY)
    context.lineTo(particle.x, particle.y)
    context.lineWidth = particle.width
    context.strokeStyle = `rgba(218, 236, 247, ${particle.alpha})`
    context.stroke()
  })

  lensDrops.forEach((drop) => {
    drop.y += drop.speed * deltaSeconds
    if (drop.y - drop.radiusY > height) drop.y = -drop.radiusY * 2

    context.beginPath()
    context.ellipse(drop.x, drop.y, drop.radiusX, drop.radiusY, -0.12, 0, Math.PI * 2)
    context.fillStyle = `rgba(194, 220, 235, ${drop.alpha * 0.34})`
    context.strokeStyle = `rgba(239, 248, 252, ${drop.alpha})`
    context.lineWidth = 0.65
    context.fill()
    context.stroke()

    context.beginPath()
    context.arc(drop.x - drop.radiusX * 0.22, drop.y - drop.radiusY * 0.24, 0.65, 0, Math.PI * 2)
    context.fillStyle = `rgba(255, 255, 255, ${drop.alpha * 1.45})`
    context.fill()
  })

  context.globalCompositeOperation = 'source-over'
}

function animate(timestamp) {
  if (!visualProfile.value || !props.active || isReducedMotion || document.hidden) {
    animationFrameId = 0
    return
  }

  // 빗방울은 30FPS로도 충분히 자연스럽고, 60FPS 대비 Canvas 부하를 크게 줄일 수 있습니다.
  if (lastRenderTimestamp && timestamp - lastRenderTimestamp < 32) {
    animationFrameId = window.requestAnimationFrame(animate)
    return
  }

  const deltaSeconds = lastTimestamp ? Math.min(0.04, (timestamp - lastTimestamp) / 1000) : 0
  lastTimestamp = timestamp
  lastRenderTimestamp = timestamp
  drawRain(deltaSeconds)
  animationFrameId = window.requestAnimationFrame(animate)
}

function restartAnimation() {
  window.cancelAnimationFrame(animationFrameId)
  animationFrameId = 0
  lastTimestamp = 0
  lastRenderTimestamp = 0
  context?.clearRect(0, 0, width, height)
  rebuildParticles()

  if (visualProfile.value && props.active && !isReducedMotion && !document.hidden) {
    animationFrameId = window.requestAnimationFrame(animate)
  }
}

function handleReducedMotion(event) {
  isReducedMotion = event.matches
  restartAnimation()
}

function handleVisibilityChange() {
  restartAnimation()
}

watch(
  () => [props.group, props.weather.precipitationIntensity, props.weather.windSpeed, props.weather.windDirection],
  restartAnimation,
)

watch(() => props.active, restartAnimation)

onMounted(async () => {
  await nextTick()
  resizeObserver = new ResizeObserver(resizeCanvas)
  if (canvas.value?.parentElement) resizeObserver.observe(canvas.value.parentElement)
  reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  isReducedMotion = reducedMotionQuery.matches
  reducedMotionQuery.addEventListener('change', handleReducedMotion)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  resizeCanvas()
  restartAnimation()
})

onBeforeUnmount(() => {
  window.cancelAnimationFrame(animationFrameId)
  resizeObserver?.disconnect()
  reducedMotionQuery?.removeEventListener('change', handleReducedMotion)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <canvas v-show="visualProfile" ref="canvas" class="precipitation-canvas" aria-hidden="true"></canvas>
</template>

<style scoped>
.precipitation-canvas {
  position: absolute;
  z-index: 4;
  inset: 0;
  display: block;
  pointer-events: none;
}
</style>
