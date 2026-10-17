// The six addresses the browser fetches third-party data from, as the pod
// publishes them on `GET /api/config` (#224).
//
// Runtime rather than build-time, because one image serves production and the
// supplier simulator alike: the pod reads its `BROWSER_*` variables and builds
// its Content-Security-Policy from the same values it publishes here, so a
// build-time copy could only disagree with the policy the page arrives under.
// The literals below are the production hosts and the fallback until the pod
// answers, or for good when it cannot. Every consumer reads `upstreams()` at
// the moment it builds a URL, never at import, so the answer reaches a fetch
// made after it lands.

export interface UpstreamUrls {
  openMeteoForecast: string
  openMeteoArchive: string
  openMeteoAirQuality: string
  /** The basemap host's base. The style, TileJSON and tiles are paths under it. */
  mapTiles: string
  /** IEM's tile cache, which a radar frame's product id and `{z}/{x}/{y}` follow. */
  radar: string
  /** The NOHRSC map service, whose `export` draws the layer and `identify` reads a point. */
  snow: string
}

export const DEFAULT_UPSTREAMS: Readonly<UpstreamUrls> = Object.freeze({
  openMeteoForecast: 'https://api.open-meteo.com/v1/forecast',
  // Where a window older than the forecast endpoint's retention goes (#123).
  // `windowSource` in forecastWindow.ts is the one thing that decides which of
  // the two a window belongs to, mirrored with the backend.
  openMeteoArchive: 'https://archive-api.open-meteo.com/v1/archive',
  openMeteoAirQuality: 'https://air-quality-api.open-meteo.com/v1/air-quality',
  mapTiles: 'https://tiles.openfreemap.org',
  radar: 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0',
  snow: 'https://mapservices.weather.noaa.gov/raster/rest/services/snow/NOHRSC_Snow_Analysis/MapServer',
})

// The wire name of each member, which is the backend's `BrowserUpstreams`.
const WIRE_KEYS: Record<keyof UpstreamUrls, string> = {
  openMeteoForecast: 'open_meteo_forecast',
  openMeteoArchive: 'open_meteo_archive',
  openMeteoAirQuality: 'open_meteo_air_quality',
  mapTiles: 'map_tiles',
  radar: 'radar',
  snow: 'snow',
}

let current: Readonly<UpstreamUrls> = DEFAULT_UPSTREAMS

/** The addresses in force now. Read it where a URL is built, not at import. */
export function upstreams(): Readonly<UpstreamUrls> {
  return current
}

/**
 * Take the `upstreams` member of a `/api/config` body. Per member, like
 * `parseCapabilities`: a pod on an older build publishes none, and a missing,
 * empty or non-string member keeps its production host rather than leaving a
 * fetch with `undefined` for a base.
 */
export function setUpstreams(body: unknown): void {
  const raw = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const next = { ...DEFAULT_UPSTREAMS }
  for (const key of Object.keys(WIRE_KEYS) as (keyof UpstreamUrls)[]) {
    const value = raw[WIRE_KEYS[key]]
    if (typeof value === 'string' && value !== '') next[key] = value
  }
  current = Object.freeze(next)
}

/** Back to the production hosts (tests). */
export function resetUpstreams(): void {
  current = DEFAULT_UPSTREAMS
}

/**
 * OpenFreeMap's Liberty style under the map host. Here rather than in
 * `map/basemap.ts`, whose top level holds only helpers that need a map
 * (`map-basemap-declares`); this is a string in and a string out.
 */
export function styleUrl(): string {
  return `${current.mapTiles}/styles/liberty`
}
