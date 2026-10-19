// Must trip: either half of the globe bound spelled again. MapLibre's
// Mercator latitude, a different rule, must not.
export const offGlobe = (lat: number, lon: number) => Math.abs(lat) > 90 || Math.abs(lon) > 180
export const offMercator = (lat: number) => Math.abs(lat) > 85.051129
