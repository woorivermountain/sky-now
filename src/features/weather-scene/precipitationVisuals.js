const RAIN_VISUALS = Object.freeze({
  drizzle: { density: 1.8, minCount: 18, maxCount: 48, speed: [300, 520], length: [4, 11], alpha: 0.12, lensDrops: 1 },
  'light-rain': { density: 3.2, minCount: 32, maxCount: 84, speed: [460, 720], length: [7, 17], alpha: 0.17, lensDrops: 2 },
  'moderate-rain': { density: 5.2, minCount: 54, maxCount: 138, speed: [650, 980], length: [11, 27], alpha: 0.22, lensDrops: 4 },
  shower: { density: 6.2, minCount: 62, maxCount: 158, speed: [760, 1120], length: [14, 33], alpha: 0.24, lensDrops: 3 },
  sleet: { density: 3.6, minCount: 36, maxCount: 92, speed: [400, 700], length: [7, 18], alpha: 0.18, lensDrops: 2 },
  'heavy-rain': { density: 7.6, minCount: 80, maxCount: 190, speed: [900, 1320], length: [18, 42], alpha: 0.3, lensDrops: 6 },
  'violent-shower': { density: 8.8, minCount: 92, maxCount: 220, speed: [1050, 1460], length: [21, 49], alpha: 0.33, lensDrops: 7 },
  storm: { density: 8.2, minCount: 86, maxCount: 205, speed: [980, 1400], length: [20, 46], alpha: 0.31, lensDrops: 6 },
})

export function getPrecipitationVisualProfile(group, weather = {}) {
  const preset = RAIN_VISUALS[group]
  if (!preset) return null

  const intensityBoost = {
    trace: 0.82,
    light: 0.92,
    moderate: 1,
    heavy: 1.12,
    extreme: 1.22,
  }[weather.precipitationIntensity] ?? 1

  return {
    ...preset,
    density: preset.density * intensityBoost,
    windSpeed: Math.min(50, Math.max(0, Number(weather.windSpeed ?? 0))),
    windDirection: Number(weather.windDirection ?? 0),
  }
}
