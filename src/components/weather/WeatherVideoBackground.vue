<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { selectWeatherVideoSource } from '../../features/weather-scene/mediaManifest.js'
import WeatherPrecipitationCanvas from './scene/WeatherPrecipitationCanvas.vue'

const props = defineProps({
  group: { type: String, required: true },
  sources: { type: Array, default: () => [] },
  opacity: { type: Number, default: 0.3 },
  weather: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['video-error'])
const layerElement = ref(null)
const videoA = ref(null)
const videoB = ref(null)
const activeSlot = ref('a')
const isLoopTransitioning = ref(false)
const loopTransitionSeconds = ref(3)
const isPageVisible = ref(!document.hidden)
const isLayerVisible = ref(true)
let loopTransitionTimer = null
let sourceVersion = 0
let visibilityObserver = null

const safeSources = computed(() => props.sources.filter(Boolean))
const activeSource = computed(() => selectWeatherVideoSource(safeSources.value, props.weather))
const isPlaybackActive = computed(() => isPageVisible.value && isLayerVisible.value)
const activeSourceStyle = computed(() => {
  const cloudCover = Math.min(100, Math.max(0, Number(props.weather?.cloudCover ?? 30)))
  const weatherCode = Number(props.weather?.weatherCode ?? 0)
  const isHeavyWeather = [55, 57, 63, 65, 67, 73, 75, 82, 86, 95, 96, 99].includes(weatherCode)

  return {
    '--source-blur': `${Number(activeSource.value?.blurPx ?? 0.5)}px`,
    '--source-opacity-scale': Number(activeSource.value?.opacityScale ?? 1),
    '--loop-fade-duration': `${loopTransitionSeconds.value}s`,
    '--weather-video-brightness': Math.max(0.84, 1.12 - cloudCover * 0.0015 - (isHeavyWeather ? 0.04 : 0)),
    '--weather-video-saturation': Math.max(0.68, 1.04 - cloudCover * 0.0026),
    '--weather-video-contrast': Math.min(1.08, 0.96 + cloudCover * 0.0011),
  }
})

function getVideo(slot) {
  return slot === 'a' ? videoA.value : videoB.value
}

function clearLoopTransition() {
  if (!loopTransitionTimer) return

  window.clearTimeout(loopTransitionTimer)
  loopTransitionTimer = null
}

function configurePlayback(video) {
  video.defaultPlaybackRate = 1
  video.playbackRate = 1
}

function handleLoaded(event, slot) {
  const video = event.currentTarget
  configurePlayback(video)

  if (slot === activeSlot.value && isPlaybackActive.value) {
    const requestedFade = Number(activeSource.value?.loopFadeSeconds ?? 3)
    loopTransitionSeconds.value = Math.min(requestedFade, Math.max(1.4, video.duration * 0.28))
    video.play().catch(() => {})
    return
  }

  video.pause()
  video.currentTime = 0
}

function finishLoopTransition(previousVideo) {
  previousVideo.pause()
  previousVideo.currentTime = 0
  isLoopTransitioning.value = false
  loopTransitionTimer = null
}

function startLoopCrossfade() {
  if (isLoopTransitioning.value || !isPlaybackActive.value) return

  const transitionVersion = sourceVersion
  const previousSlot = activeSlot.value
  const nextSlot = previousSlot === 'a' ? 'b' : 'a'
  const previousVideo = getVideo(previousSlot)
  const nextVideo = getVideo(nextSlot)

  if (!previousVideo || !nextVideo) return

  isLoopTransitioning.value = true
  configurePlayback(nextVideo)
  nextVideo.currentTime = 0

  nextVideo.play().then(() => {
    if (transitionVersion !== sourceVersion) {
      nextVideo.pause()
      return
    }

    activeSlot.value = nextSlot
    clearLoopTransition()
    loopTransitionTimer = window.setTimeout(
      () => finishLoopTransition(previousVideo),
      loopTransitionSeconds.value * 1000 + 80,
    )
  }).catch(() => {
    // Fall back to restarting the active video when autoplay is blocked.
    previousVideo.currentTime = 0
    previousVideo.play().catch(() => {})
    isLoopTransitioning.value = false
  })
}

function handleTimeUpdate(event, slot) {
  if (slot !== activeSlot.value || isLoopTransitioning.value) return

  const video = event.currentTarget
  if (!Number.isFinite(video.duration) || video.duration <= 0) return

  if (video.duration - video.currentTime <= loopTransitionSeconds.value) {
    startLoopCrossfade()
  }
}

function handleEnded(_event, slot) {
  if (slot === activeSlot.value) startLoopCrossfade()
}

function handleError() {
  emit('video-error', props.group)
}

function pausePlayback() {
  sourceVersion += 1
  clearLoopTransition()
  isLoopTransitioning.value = false
  videoA.value?.pause()
  videoB.value?.pause()
}

function resumePlayback() {
  const activeVideo = getVideo(activeSlot.value)
  const standbyVideo = getVideo(activeSlot.value === 'a' ? 'b' : 'a')

  standbyVideo?.pause()
  if (standbyVideo?.readyState >= 1) standbyVideo.currentTime = 0
  if (activeVideo?.readyState >= 2) {
    configurePlayback(activeVideo)
    activeVideo.play().catch(() => {})
  }
}

function handleVisibilityChange() {
  isPageVisible.value = !document.hidden
}

watch(() => activeSource.value?.src, () => {
  sourceVersion += 1
  clearLoopTransition()
  isLoopTransitioning.value = false
  loopTransitionSeconds.value = Number(activeSource.value?.loopFadeSeconds ?? 3)
})

watch(isPlaybackActive, (isActive) => {
  if (isActive) resumePlayback()
  else pausePlayback()
})

onMounted(() => {
  document.addEventListener('visibilitychange', handleVisibilityChange)

  visibilityObserver = new IntersectionObserver(([entry]) => {
    isLayerVisible.value = Boolean(entry?.isIntersecting)
  }, {
    rootMargin: '160px 0px',
    threshold: 0.01,
  })

  if (layerElement.value) visibilityObserver.observe(layerElement.value)
})

onBeforeUnmount(() => {
  sourceVersion += 1
  clearLoopTransition()
  visibilityObserver?.disconnect()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})
</script>

<template>
  <div
    ref="layerElement"
    class="weather-video-layer"
    :class="[`weather-video-layer--${group}`, { 'weather-video-layer--paused': !isPlaybackActive }]"
    :style="{ '--video-opacity': opacity }"
  >
    <Transition name="cloud-source">
      <div
        v-if="activeSource"
        :key="activeSource.id"
        class="cloud-buffer"
        :style="activeSourceStyle"
      >
        <video
          ref="videoA"
          class="weather-video"
          :class="{ 'weather-video--active': activeSlot === 'a' }"
          :src="activeSource.src"
          autoplay muted playsinline preload="auto"
          aria-hidden="true"
          @loadedmetadata="handleLoaded($event, 'a')"
          @timeupdate="handleTimeUpdate($event, 'a')"
          @ended="handleEnded($event, 'a')"
          @error="handleError"
        />
        <video
          ref="videoB"
          class="weather-video"
          :class="{ 'weather-video--active': activeSlot === 'b' }"
          :src="activeSource.src"
          muted playsinline preload="auto"
          aria-hidden="true"
          @loadedmetadata="handleLoaded($event, 'b')"
          @timeupdate="handleTimeUpdate($event, 'b')"
          @ended="handleEnded($event, 'b')"
          @error="handleError"
        />
      </div>
    </Transition>
    <div class="condition-haze" aria-hidden="true"></div>
    <div class="condition-effect" aria-hidden="true"></div>
    <WeatherPrecipitationCanvas :group="group" :weather="weather" :active="isPlaybackActive" />
    <div class="condition-lightning" aria-hidden="true"></div>
    <div class="condition-vignette" aria-hidden="true"></div>
  </div>
</template>

<style scoped>
.weather-video-layer,
.cloud-buffer,
.weather-video,
.condition-haze,
.condition-effect,
.condition-lightning,
.condition-vignette {
  position: absolute;
  inset: 0;
}

.weather-video-layer {
  overflow: hidden;
  isolation: isolate;
}

.cloud-buffer {
  overflow: hidden;
}

.weather-video {
  --scene-filter: saturate(0.94) contrast(0.98);
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 44%;
  opacity: 0;
  filter:
    var(--scene-filter)
    brightness(var(--weather-video-brightness, 1))
    saturate(var(--weather-video-saturation, 1))
    contrast(var(--weather-video-contrast, 1))
    blur(var(--source-blur, 0px));
  transform: scale(1.035);
  transition:
    opacity var(--loop-fade-duration, 3s) ease-in-out,
    filter 5s ease-in-out;
  will-change: opacity;
  -webkit-mask-image: linear-gradient(180deg, rgba(0, 0, 0, .92), #000 52%, rgba(0, 0, 0, .72));
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, .92), #000 52%, rgba(0, 0, 0, .72));
}

.weather-video--active {
  opacity: calc(var(--video-opacity) * var(--source-opacity-scale, 1));
}

.cloud-source-enter-active,
.cloud-source-leave-active {
  transition: opacity 2.8s ease-in-out;
}

.cloud-source-leave-active { position: absolute; }

.cloud-source-enter-from,
.cloud-source-leave-to {
  opacity: 0;
}

.weather-video-layer--clear-day .weather-video { --scene-filter: brightness(1.1) saturate(0.9) contrast(0.94); }
.weather-video-layer--partly-cloudy-day .weather-video { --scene-filter: brightness(1.07) saturate(0.88) contrast(0.96); }
.weather-video-layer--mostly-cloudy-day .weather-video,
.weather-video-layer--windy .weather-video { --scene-filter: brightness(0.92) saturate(0.69) contrast(0.96); }
.weather-video-layer--clear-night .weather-video,
.weather-video-layer--partly-cloudy-night .weather-video { --scene-filter: brightness(0.28) saturate(0.48) hue-rotate(12deg); }
.weather-video-layer--mostly-cloudy-night .weather-video { --scene-filter: brightness(0.21) saturate(0.36) hue-rotate(10deg); }
.weather-video-layer--overcast .weather-video { --scene-filter: brightness(0.72) saturate(0.42) contrast(0.93); }
.weather-video-layer--humid .weather-video { --scene-filter: brightness(0.82) saturate(0.38) contrast(0.86); }
.weather-video-layer--sunset .weather-video { --scene-filter: brightness(0.84) saturate(1.04) sepia(0.2) hue-rotate(-7deg); }

.weather-video-layer--drizzle .weather-video,
.weather-video-layer--light-rain .weather-video { --scene-filter: brightness(0.68) saturate(0.46) contrast(1.02); }
.weather-video-layer--moderate-rain .weather-video,
.weather-video-layer--shower .weather-video,
.weather-video-layer--sleet .weather-video { --scene-filter: brightness(0.57) saturate(0.38) contrast(1.06); }
.weather-video-layer--heavy-rain .weather-video,
.weather-video-layer--violent-shower .weather-video,
.weather-video-layer--storm .weather-video { --scene-filter: brightness(0.44) saturate(0.3) contrast(1.1); }
.weather-video-layer--light-snow .weather-video,
.weather-video-layer--snow .weather-video,
.weather-video-layer--heavy-snow .weather-video { --scene-filter: brightness(0.86) saturate(0.23) contrast(0.9); }

.condition-haze,
.condition-effect,
.condition-lightning,
.condition-vignette {
  pointer-events: none;
}

.condition-haze {
  z-index: 2;
  opacity: 0;
  background:
    linear-gradient(180deg, rgba(117, 132, 143, 0.04), rgba(195, 207, 213, 0.28)),
    radial-gradient(ellipse at 50% 84%, rgba(225, 233, 236, 0.32), transparent 58%);
  transition: opacity 1.4s ease;
}

.weather-video-layer--mostly-cloudy-day .condition-haze { opacity: 0.15; }
.weather-video-layer--mostly-cloudy-night .condition-haze { opacity: 0.11; }
.weather-video-layer--overcast .condition-haze { opacity: 0.31; }
.weather-video-layer--humid .condition-haze { opacity: 0.58; }
.weather-video-layer--drizzle .condition-haze { opacity: 0.28; }
.weather-video-layer--light-rain .condition-haze { opacity: 0.34; }
.weather-video-layer--moderate-rain .condition-haze,
.weather-video-layer--shower .condition-haze,
.weather-video-layer--sleet .condition-haze { opacity: 0.45; }
.weather-video-layer--heavy-rain .condition-haze,
.weather-video-layer--violent-shower .condition-haze,
.weather-video-layer--storm .condition-haze { opacity: 0.62; }

.weather-video-layer--humid .condition-effect {
  z-index: 3;
  opacity: 0.62;
  background:
    radial-gradient(ellipse at 20% 68%, rgba(241, 245, 249, 0.4), transparent 42%),
    radial-gradient(ellipse at 78% 45%, rgba(226, 232, 240, 0.34), transparent 46%);
  animation: fog-drift 18s ease-in-out infinite alternate;
}

.weather-video-layer--light-snow .condition-effect,
.weather-video-layer--snow .condition-effect,
.weather-video-layer--heavy-snow .condition-effect,
.weather-video-layer--sleet .condition-effect {
  z-index: 4;
  background-image:
    radial-gradient(circle, rgba(255, 255, 255, 0.76) 0 1.5px, transparent 2px),
    radial-gradient(circle, rgba(255, 255, 255, 0.45) 0 0.9px, transparent 1.4px);
  background-position: 0 0, 24px 18px;
  background-size: 46px 54px, 31px 39px;
  opacity: 0.5;
  animation: snow-fall 8s linear infinite;
}

.weather-video-layer--light-snow .condition-effect { opacity: 0.32; animation-duration: 11s; }
.weather-video-layer--heavy-snow .condition-effect { opacity: 0.78; background-size: 34px 40px, 25px 30px; animation-duration: 4.8s; }
.weather-video-layer--sleet .condition-effect { opacity: 0.2; animation-duration: 9s; }

.condition-lightning {
  z-index: 5;
  opacity: 0;
}

.weather-video-layer--storm .condition-lightning {
  background: rgba(226, 238, 255, 0.52);
  animation: lightning-flash 7.5s steps(1, end) infinite;
}

.condition-vignette {
  z-index: 6;
  background: radial-gradient(ellipse at center, transparent 46%, rgba(9, 21, 32, 0.08) 100%);
  opacity: 0.28;
}

.weather-video-layer--heavy-rain .condition-vignette,
.weather-video-layer--violent-shower .condition-vignette,
.weather-video-layer--storm .condition-vignette { opacity: 0.68; }

.weather-video-layer--paused .condition-effect,
.weather-video-layer--paused .condition-lightning {
  animation-play-state: paused !important;
}

@keyframes snow-fall { to { background-position: 28px 180px, 2px 160px; } }
@keyframes fog-drift { to { transform: translate3d(4%, -1%, 0) scale(1.04); } }
@keyframes lightning-flash {
  0%, 89%, 93%, 100% { opacity: 0; }
  90% { opacity: 0.25; }
  91% { opacity: 0.06; }
  92% { opacity: 0.42; }
}

@media (prefers-reduced-motion: reduce) {
  .cloud-buffer { display: none; }
  .condition-effect,
  .condition-lightning { animation: none !important; }
}
</style>
