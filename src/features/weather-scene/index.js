import { getWeatherVideoSources } from './mediaManifest.js'
import { WEATHER_SCENE_PROFILES } from './sceneProfiles.js'

export { getDaylightPalette } from './scenePalette.js'
export { getWeatherSceneProfile, getWeatherVideoGroup } from './sceneClassifier.js'
export { getPrecipitationVisualProfile } from './precipitationVisuals.js'
export { getWeatherVideoSources } from './mediaManifest.js'
export { WEATHER_SCENE_PROFILES } from './sceneProfiles.js'

export const WEATHER_VIDEO_GROUPS = Object.fromEntries(
  Object.keys(WEATHER_SCENE_PROFILES).map((group) => [group, getWeatherVideoSources(group)]),
)
