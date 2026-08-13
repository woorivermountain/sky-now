<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useTemperature } from '../../composables/useTemperature'

const props = defineProps({
  regions: { type: Array, required: true },
  selectedRegionId: { type: String, default: '' },
})

const emit = defineEmits(['select-region'])
const { displayTemp, unit, unitSymbol } = useTemperature()
const mapElement = ref(null)
let map
let markerLayer
let resizeObserver
let fullBounds

const validTemperatures = computed(() => props.regions
  .map((region) => Number(region.temp))
  .filter(Number.isFinite))

const averageTemperature = computed(() => {
  if (!validTemperatures.value.length) return null
  return validTemperatures.value.reduce((sum, temp) => sum + temp, 0) / validTemperatures.value.length
})

const relativeRange = computed(() => {
  if (averageTemperature.value === null) return 1
  return Math.max(1, ...validTemperatures.value.map((temp) => Math.abs(temp - averageTemperature.value)))
})

const legendHigh = computed(() => averageTemperature.value === null
  ? null
  : averageTemperature.value + relativeRange.value)
const legendLow = computed(() => averageTemperature.value === null
  ? null
  : averageTemperature.value - relativeRange.value)

function markerColor(temp) {
  const value = Number(temp)
  if (!Number.isFinite(value) || averageTemperature.value === null) return '#64748b'
  const ratio = Math.min(1, Math.max(0,
    (value - averageTemperature.value + relativeRange.value) / (relativeRange.value * 2),
  ))
  const hue = Math.round(210 - ratio * 175)
  return `hsl(${hue} 72% 43%)`
}

function markerIcon(region) {
  const temperature = region.temp === null ? '…' : `${displayTemp(region.temp)}°`
  const selected = region.id === props.selectedRegionId ? 'selected' : ''
  return L.divIcon({
    className: 'weather-marker-container',
    html: `<span class="weather-marker ${selected}" style="--marker-color:${markerColor(region.temp)}"><span class="weather-marker-value">${temperature}</span><span class="weather-marker-label">${region.city}</span><span class="weather-marker-stem"></span></span>`,
    iconSize: [30, 40],
    iconAnchor: [15, 39],
  })
}

function renderMarkers() {
  if (!markerLayer) return
  markerLayer.clearLayers()
  props.regions.forEach((region) => {
    const marker = L.marker([region.latitude, region.longitude], {
      icon: markerIcon(region),
      keyboard: true,
      title: `${region.name} ${displayTemp(region.temp)}${unitSymbol.value}`,
    })
    marker.bindTooltip(`<strong>${region.name}</strong><br>${displayTemp(region.temp)}${unitSymbol.value} · ${region.status}`, {
      className: 'weather-tooltip', direction: 'top', offset: [0, -12],
    })
    marker.on('click', () => emit('select-region', region.id))
    marker.addTo(markerLayer)
  })
}

function resize() {
  nextTick(() => map?.invalidateSize({ animate: false, pan: false }))
}

function resetView() {
  if (!map || !fullBounds) return
  map.stop()
  map.flyToBounds(fullBounds.pad(0.16), { duration: 0.55, easeLinearity: 0.25 })
}

function focusRegion(regionId) {
  if (!map || !regionId) return
  const region = props.regions.find((item) => item.id === regionId)
  if (!region) return
  map.stop()
  map.panTo([region.latitude, region.longitude], {
    animate: true,
    duration: 0.42,
    easeLinearity: 0.28,
    noMoveStart: true,
  })
}

onMounted(() => {
  map = L.map(mapElement.value, {
    zoomControl: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
  })
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map)
  markerLayer = L.layerGroup().addTo(map)
  renderMarkers()
  fullBounds = L.latLngBounds(props.regions.map((region) => [region.latitude, region.longitude]))
  map.fitBounds(fullBounds.pad(0.16))
  resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(mapElement.value)
})

watch(() => [props.regions, unit.value], renderMarkers, { deep: true })
watch(() => props.selectedRegionId, (regionId) => {
  renderMarkers()
  focusRegion(regionId)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  map?.remove()
})

defineExpose({ resize, resetView, focusRegion })
</script>

<template>
  <div class="weather-map weather-map-shell">
    <div ref="mapElement" class="weather-map-canvas" aria-label="대한민국 광역시·도 대표 날씨 지도"></div>
    <aside v-if="averageTemperature !== null" class="temperature-legend" aria-label="전국 평균 기준 상대 기온 범례">
      <span class="legend-title">평균 기준</span>
      <div class="legend-scale">
        <i></i>
        <span class="legend-high">{{ displayTemp(legendHigh, 1) }}{{ unitSymbol }}</span>
        <span class="legend-average">평균 {{ displayTemp(averageTemperature, 1) }}{{ unitSymbol }}</span>
        <span class="legend-low">{{ displayTemp(legendLow, 1) }}{{ unitSymbol }}</span>
      </div>
      <small>위쪽일수록<br />평균보다 높음</small>
    </aside>
  </div>
</template>

<style scoped>
.weather-map-shell {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.weather-map-canvas {
  width: 100%;
  height: 100%;
  min-height: inherit;
}

.temperature-legend {
  position: absolute;
  z-index: 500;
  top: 14px;
  right: 14px;
  width: 82px;
  padding: 10px 9px;
  border: 1px solid rgba(255, 255, 255, .78);
  border-radius: 14px;
  background: rgba(255, 255, 255, .88);
  box-shadow: 0 8px 24px rgba(15, 23, 42, .14);
  color: #334155;
  backdrop-filter: blur(12px);
  pointer-events: none;
}

.legend-title {
  display: block;
  margin-bottom: 8px;
  font-size: 10px;
  font-weight: 900;
  text-align: center;
}

.legend-scale {
  position: relative;
  height: 130px;
  margin-left: 3px;
}

.legend-scale i {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 8px;
  border: 1px solid rgba(15, 23, 42, .08);
  border-radius: 999px;
  background: linear-gradient(to top, hsl(210 72% 43%), hsl(122 58% 42%), hsl(35 82% 48%));
}

.legend-scale span {
  position: absolute;
  left: 14px;
  font-size: 9px;
  font-weight: 800;
  white-space: nowrap;
}

.legend-high { top: -2px; color: hsl(35 82% 38%); }
.legend-average { top: 50%; color: hsl(122 42% 32%); transform: translateY(-50%); }
.legend-low { bottom: -2px; color: hsl(210 72% 36%); }

.temperature-legend small {
  display: block;
  margin-top: 8px;
  color: #64748b;
  font-size: 8px;
  line-height: 1.35;
  text-align: center;
}

:global(.weather-marker-container) { background: transparent; border: 0; }
:global(.weather-marker) {
  --marker-color: #2563eb;
  position: relative;
  display: grid;
  width: 27px;
  height: 27px;
  place-items: center;
  border: 2px solid white;
  border-radius: 50%;
  background: var(--marker-color);
  box-shadow: 0 4px 12px rgba(15, 23, 42, .25);
  color: white;
  font-size: 9px;
  font-weight: 900;
  transition: transform .2s ease, box-shadow .2s ease;
}
:global(.weather-marker:hover),
:global(.weather-marker.selected) {
  z-index: 5;
  transform: translateY(-2px) scale(1.08);
  box-shadow: 0 0 0 4px rgba(255,255,255,.48), 0 7px 18px rgba(15,23,42,.32);
}
:global(.weather-marker-label) {
  position: absolute;
  top: 50%;
  left: 32px;
  padding: 5px 8px;
  border: 1px solid rgba(255,255,255,.7);
  border-radius: 8px;
  background: rgba(15,23,42,.82);
  box-shadow: 0 5px 14px rgba(15,23,42,.2);
  opacity: 0;
  color: white;
  font-size: 10px;
  white-space: nowrap;
  pointer-events: none;
  transform: translate(-4px, -50%);
  transition: opacity .18s ease, transform .18s ease;
}
:global(.weather-marker:hover .weather-marker-label),
:global(.weather-marker.selected .weather-marker-label) {
  opacity: 1;
  transform: translate(0, -50%);
}
:global(.weather-marker-stem) { position:absolute; bottom:-9px; width:1px; height:8px; background:var(--marker-color); }
:global(.weather-marker-stem::after) { position:absolute; bottom:-2px; left:-2.25px; width:6px; height:6px; border-radius:50%; background:var(--marker-color); content:''; }
:global(.weather-tooltip) { padding:9px 11px; border:0; border-radius:10px; box-shadow:0 6px 20px rgba(15,23,42,.2); font-family:inherit; font-size:13px; line-height:1.55; }

@media (max-width: 720px) {
  .weather-map { height: 390px; }
}
</style>
