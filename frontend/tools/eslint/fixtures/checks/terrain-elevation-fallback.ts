// Must trip: a fetch of places that reads every one of them like a peak, and
// carries no per-place decision.
declare function fetchWeather(coords: unknown[], startMs: number, endMs: number, options: object): void
fetchWeather([{ latitude: 1, longitude: 1 }], 0, 1, { model: 'gfs_seamless', terrainElevation: true })
