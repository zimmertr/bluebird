// The map camera as a share link carries it (`view=lng,lat,zoom`, and
// `view=lng,lat,zoom,bearing,pitch` for a map that is rotated or tilted), and
// the two rules about it that need no map: which camera the map opens on, and which
// settled moves are the reader's own. Apart from `MapView.tsx` because that
// file declares no helpers and runs in no test, and apart from `urlParams.ts`
// because the map module that reports the camera reads the classifier too.

import { roundTo } from './numbers'

/**
 * A settled camera: the centre in degrees, the zoom level, and the two angles
 * (#864), the bearing the top of the map faces, clockwise from north, and the
 * pitch from straight down, both in degrees.
 */
export interface CameraView {
  lng: number
  lat: number
  zoom: number
  bearing: number
  pitch: number
}

// Four decimals is about 8 m at 47°N, two pixels at zoom 15, and two
// decimals of zoom is under 1% of scale: finer only lengthens the link.
const LNG_LAT_DECIMALS = 4
const ZOOM_DECIMALS = 2

// MapLibre's own limits, so a hand-edited link cannot ask for a camera the
// map would clamp into something other than what the link says.
const MAX_LAT = 85.051129
const MAX_ZOOM = 22
/**
 * The steepest tilt the map takes. MapLibre's own default, said here because
 * the 3D button tilts the map and past 60 the library calls it experimental;
 * the map is built with it and a link's pitch is held to it.
 */
export const MAX_PITCH = 60

/** Where the map opens when a link names no camera and holds nothing to frame. */
export const DEFAULT_CAMERA: CameraView = { lng: -120.5, lat: 47.5, zoom: 7, bearing: 0, pitch: 0 }

function fixed(n: number, decimals: number): string {
  // A number rather than a padded string, so 7.00 reads `7`.
  return String(roundTo(n, decimals))
}

/**
 * The camera as a link writes it. The two angles are whole degrees, a degree
 * being finer than a reader can turn the map to on purpose, and both are left
 * out while the map is north-up and flat, so the common link keeps three
 * fields. Either one off zero writes both, so the fourth field is always the
 * bearing and the fifth the pitch.
 */
export function encodeView(view: CameraView): string {
  const fields = [fixed(view.lng, LNG_LAT_DECIMALS), fixed(view.lat, LNG_LAT_DECIMALS), fixed(view.zoom, ZOOM_DECIMALS)]
  const bearing = Math.round(view.bearing)
  const pitch = Math.round(view.pitch)
  // `String`, since a bearing a hair west of north rounds to -0, which is 0.
  if (bearing !== 0 || pitch !== 0) fields.push(fixed(bearing, 0), fixed(pitch, 0))
  return fields.join(',')
}

/**
 * The camera a link names, or null for a value that is not three or five
 * finite numbers in range. Three fields are a north-up, flat camera.
 */
export function decodeView(raw: string): CameraView | null {
  const parts = raw.split(',')
  if ((parts.length !== 3 && parts.length !== 5) || parts.some((p) => p.trim() === '')) return null
  const [lng, lat, zoom, bearing = 0, pitch = 0] = parts.map(Number)
  if (![lng, lat, zoom, bearing, pitch].every(Number.isFinite)) return null
  if (lng < -180 || lng > 180 || Math.abs(lat) > MAX_LAT || zoom < 0 || zoom > MAX_ZOOM) return null
  if (bearing < -180 || bearing > 180 || pitch < 0 || pitch > MAX_PITCH) return null
  return { lng, lat, zoom, bearing, pitch }
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
 * DOM event behind a drag, a wheel, a touch, a key or a press of the zoom
 * buttons, and marks the geolocate button's move `geolocateSource`. Box zoom
 * would carry neither, and the app turns it off (`map/controls.ts`).
 * The app's own camera calls (the opening fit, a search, a click on a rank)
 * carry neither. A move of the reader's own makes a link by itself; an app move
 * only keeps the camera current in a link that exists for another reason.
 */
export function isReaderMove(event: { originalEvent?: unknown; geolocateSource?: unknown }): boolean {
  return event.originalEvent != null || event.geolocateSource === true
}
