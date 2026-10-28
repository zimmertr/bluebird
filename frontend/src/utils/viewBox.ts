/**
 * The box a view covers as if it lay flat (#799).
 *
 * MapLibre's `getBounds()` answers the bounding box of what the camera sees,
 * and a pitched camera sees to the horizon. At the 3D button's 45 degrees the
 * far edge of that box runs several times as far from the centre as the near
 * one, so a viewport fetch built on it asks the pod for fires, closures and
 * markers across a region nobody can read at that distance. The overlays that
 * fetch for the view ask for this box instead: the rectangle the canvas would
 * cover at the same centre, zoom and bearing with the pitch at 0. A rotated
 * view takes the bounding box of the rotated rectangle, which is what
 * `getBounds()` gives a flat rotated map too, so the two agree whenever the
 * map lies flat.
 *
 * Web Mercator at MapLibre's 512px tile, so zoom z is a world 512 * 2^z pixels
 * wide. Plain arithmetic rather than a call on the map, so the node tests can
 * hold it to numbers worked out by hand.
 */
import { clamp } from './numbers'
import type { BBox } from './wildfires'

/** MapLibre's tile size, which its zoom is counted in. */
const TILE_PX = 512

/** The latitude Web Mercator stops at, where the world square ends. */
const MAX_LAT = 85.051128779806604

/**
 * The box `[west, south, east, north]` a `widthPx` by `heightPx` view at this
 * centre, zoom and bearing covers lying flat. Pitch is not an argument: the
 * answer is the same whatever the camera's tilt.
 */
export function visibleBox(
  center: { lng: number; lat: number },
  zoom: number,
  widthPx: number,
  heightPx: number,
  bearingDeg: number,
): BBox {
  const world = TILE_PX * 2 ** zoom
  const x = ((center.lng + 180) / 360) * world
  const sin = Math.sin((clamp(center.lat, -MAX_LAT, MAX_LAT) * Math.PI) / 180)
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * world
  // Half the rotated rectangle's extent on each axis.
  const turn = (bearingDeg * Math.PI) / 180
  const cos = Math.abs(Math.cos(turn))
  const sinT = Math.abs(Math.sin(turn))
  const halfX = (widthPx * cos + heightPx * sinT) / 2
  const halfY = (widthPx * sinT + heightPx * cos) / 2
  const lngAt = (px: number) => (px / world) * 360 - 180
  const latAt = (px: number) => {
    const inside = clamp(px, 0, world)
    return (Math.atan(Math.sinh(Math.PI * (1 - (2 * inside) / world))) * 180) / Math.PI
  }
  return [lngAt(x - halfX), latAt(y + halfY), lngAt(x + halfX), latAt(y - halfY)]
}

/** The part of a MapLibre map `viewBoxOf` reads, without naming its class. */
export interface ViewCamera {
  getCenter(): { lng: number; lat: number }
  getZoom(): number
  getBearing(): number
  getCanvas(): { clientWidth: number; clientHeight: number }
}

/** The box the map's view covers lying flat: `visibleBox` read off the map. */
export function viewBoxOf(map: ViewCamera): BBox {
  const canvas = map.getCanvas()
  return visibleBox(map.getCenter(), map.getZoom(), canvas.clientWidth, canvas.clientHeight, map.getBearing())
}
