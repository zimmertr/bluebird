// The map camera as a share link carries it (`view=lng,lat,zoom`), and the two
// rules about it that need no map: which camera the map opens on, and which
// settled moves are the reader's own. Apart from `MapView.tsx` because that
// file declares no helpers and runs in no test, and apart from `urlParams.ts`
// because the map module that reports the camera reads the classifier too.

/** A settled camera: the centre in degrees and the zoom level. */
export interface CameraView {
  lng: number
  lat: number
  zoom: number
}

// Four decimals is about 8 m at 47°N, two pixels at zoom 15, and two
// decimals of zoom is under 1% of scale: finer only lengthens the link.
const LNG_LAT_DECIMALS = 4
const ZOOM_DECIMALS = 2

// MapLibre's own limits, so a hand-edited link cannot ask for a camera the
// map would clamp into something other than what the link says.
const MAX_LAT = 85.051129
const MAX_ZOOM = 22

/** Where the map opens when a link names no camera and holds nothing to frame. */
export const DEFAULT_CAMERA: CameraView = { lng: -120.5, lat: 47.5, zoom: 7 }

function fixed(n: number, decimals: number): string {
  // Number() drops trailing zeros, so 7.00 reads `7`.
  return String(Number(n.toFixed(decimals)))
}

export function encodeView(view: CameraView): string {
  return [fixed(view.lng, LNG_LAT_DECIMALS), fixed(view.lat, LNG_LAT_DECIMALS), fixed(view.zoom, ZOOM_DECIMALS)].join(',')
}

/** The camera a link names, or null for a value that is not three finite numbers in range. */
export function decodeView(raw: string): CameraView | null {
  const parts = raw.split(',')
  if (parts.length !== 3 || parts.some((p) => p.trim() === '')) return null
  const [lng, lat, zoom] = parts.map(Number)
  if (![lng, lat, zoom].every(Number.isFinite)) return null
  if (lng < -180 || lng > 180 || Math.abs(lat) > MAX_LAT || zoom < 0 || zoom > MAX_ZOOM) return null
  return { lng, lat, zoom }
}

/**
 * The camera the map is built with. A link's own camera wins over every fit
 * the app would otherwise make on load (the ring, the pasted list, the pins),
 * because it is where the person who shared the link was looking.
 */
export function initialCamera(restored: CameraView | null): CameraView {
  return restored ?? DEFAULT_CAMERA
}

/**
 * Whether a settled move was the reader's own. MapLibre hands a `moveend` the
 * DOM event behind a drag, a wheel, a touch, a key, a box zoom or a press of
 * the zoom buttons, and marks the geolocate button's move `geolocateSource`.
 * The app's own camera calls (the opening fit, a search, a click on a rank)
 * carry neither. A move of the reader's own makes a link by itself; an app move
 * only keeps the camera current in a link that exists for another reason.
 */
export function isReaderMove(event: { originalEvent?: unknown; geolocateSource?: unknown }): boolean {
  return event.originalEvent != null || event.geolocateSource === true
}
