// Must trip: a fetch of a place that leaves a row with no elevation at the surface.
declare function fetchWeather(coords: unknown[], startMs: number, endMs: number, options: object): void
fetchWeather([], 0, 1, { model: 'gfs_seamless' })
