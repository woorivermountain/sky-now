const DAYLIGHT_COLOR_STOPS = [
  { at: 0, top: [70, 101, 145], middle: [224, 139, 126], horizon: [255, 194, 119] },
  { at: 0.22, top: [55, 142, 207], middle: [122, 191, 229], horizon: [217, 239, 247] },
  { at: 0.5, top: [38, 136, 205], middle: [103, 187, 231], horizon: [221, 242, 248] },
  { at: 0.76, top: [59, 126, 176], middle: [142, 184, 207], horizon: [240, 209, 172] },
  { at: 1, top: [67, 78, 119], middle: [197, 107, 104], horizon: [255, 177, 105] },
]

function interpolateChannel(from, to, progress) {
  return Math.round(from + (to - from) * progress)
}

function interpolateColor(from, to, progress) {
  return `rgb(${from.map((channel, index) => interpolateChannel(channel, to[index], progress)).join(' ')})`
}

// 일출부터 일몰까지 색을 단계적으로 교체하지 않고 연속 보간합니다.
export function getDaylightPalette(progress = 0.5) {
  const normalized = Math.min(1, Math.max(0, progress))
  const nextIndex = DAYLIGHT_COLOR_STOPS.findIndex((stop) => stop.at >= normalized)
  const resolvedIndex = nextIndex < 0 ? DAYLIGHT_COLOR_STOPS.length - 1 : nextIndex
  const end = DAYLIGHT_COLOR_STOPS[resolvedIndex]
  const start = DAYLIGHT_COLOR_STOPS[Math.max(0, resolvedIndex - 1)]
  const distance = Math.max(0.0001, end.at - start.at)
  const localProgress = start === end ? 0 : (normalized - start.at) / distance

  return {
    top: interpolateColor(start.top, end.top, localProgress),
    middle: interpolateColor(start.middle, end.middle, localProgress),
    horizon: interpolateColor(start.horizon, end.horizon, localProgress),
    warmth: Math.round((1 - Math.sin(normalized * Math.PI)) * 1000) / 1000,
  }
}
