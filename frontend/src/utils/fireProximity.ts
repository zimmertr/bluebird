// Flags ranked destinations that sit within a few miles of an active wildfire.
// The distance is measured to the fire *perimeter* (0 when the point is inside
// it), not to a centroid — a large fire's centroid can be many miles from its
// edge, so a centroid check would badly under-warn. Everything here is pure and
// deterministic; the fetch/lifecycle lives in hooks/useFireProximity.ts.
import type { FeatureCollection, Feature, Geometry, MultiPolygon, Position } from 'geojson'
import { geoKey, setKey } from './points'
import type { BBox, WildfireProps } from './wildfires'

export const FIRE_WARN_MILES = 10

export interface FireWarning {
  miles: number // 0 when the point falls inside a perimeter
  name: string
  // The middle of the fire's bounding box, for a link that centres a map on
  // it. The MIDDLE rather than the nearest point on the perimeter, which is
  // what the mileage above measures: a distance is asking how close the fire
  // comes, and a link is asking to be shown the fire.
  latitude: number
  longitude: number
}

/**
 * Whether the lookup has an answer, and whether that answer can be trusted.
 *
 * This used to be a bare Map, and every way of failing produced the same empty
 * one: an aborted request, a network error, and a truncated body all landed in
 * one silent catch. So the feature's failure mode was indistinguishable from
 * its all-clear mode, which for a safety warning is the wrong way round.
 * `ready` with an empty map means the check ran and found nothing within the
 * radius; `unavailable` means it could not run and the caller must not imply
 * otherwise.
 *
 * `unavailable` is now rare by construction. Perimeters come from Bluebird Forecast's
 * own cache rather than from NIFC directly, and that cache serves its last good
 * snapshot rather than expiring into nothing, so only a server that has never
 * completed a fetch has no answer at all (issue #203).
 *
 * `uncovered` names the geographic blind spot (#256): WFIGS is US-only, and
 * a destination outside the coverage the server publishes was never checked,
 * which used to be indistinguishable from its all-clear. It is a per-row
 * set rather than a status, because one analysis can hold a Cascades row and
 * a British Columbia row at once: both the table and the CSV write the no-data
 * dash in an uncovered row's wildfire cell, while covered rows keep their
 * real answers.
 */
export type FireProximityStatus = 'idle' | 'loading' | 'ready' | 'unavailable'

// One degree of latitude ≈ 69 mi. Longitude is scaled by cos(lat). Good to a
// fraction of a percent at the ~10 mi scale this warning cares about.
const MI_PER_DEG_LAT = 69.0

// Tooltip text, phrased to read cleanly whatever NIFC calls the incident (plain
// names, ALL-CAPS codes, numbered dispatches, …).
export function fireWarningText(w: FireWarning): string {
  if (w.miles < 0.1) return `Inside an active wildfire perimeter (${w.name})`
  return `${w.miles.toFixed(1)} mi from an active wildfire (${w.name})`
}

/**
 * The two hover texts an N/A cell carries (TJ, PR #275 review). One N/A mark
 * covers two causes, and the tooltip is what tells them apart: the row sat
 * outside the dataset's coverage, or the whole check failed. The second is
 * the same sentence the panel's footer warning shows, so the cell and the
 * panel cannot describe one failure two ways.
 */
export const FIRE_UNCOVERED_NOTE = 'NIFC wildfire proximity data is only available in the USA'
export const FIRE_UNAVAILABLE_NOTE =
  'NIFC is unreachable, so wildfire proximity data is unavailable.'

/**
 * Identity of a SET of destinations, order-independent.
 *
 * useFireProximity keys its lookup on this rather than on the array holding the
 * points, for the reason `setKey` in points.ts carries: keying on the reference
 * meant re-querying NIFC — and aborting the request already in flight — for a
 * set of points that had not changed at all.
 */
export function pointsKey(points: { latitude: number; longitude: number }[]): string {
  return setKey(points, (p) => geoKey(p.latitude, p.longitude))
}

// Bounding box around all points, padded by `marginMi` on every side so a fire
// up to that margin outside the cluster still intersects the query envelope.
export function pointsBbox(
  points: { latitude: number; longitude: number }[],
  marginMi: number,
): BBox | null {
  if (points.length === 0) return null
  let minLat = Infinity
  let minLon = Infinity
  let maxLat = -Infinity
  let maxLon = -Infinity
  for (const p of points) {
    minLat = Math.min(minLat, p.latitude)
    maxLat = Math.max(maxLat, p.latitude)
    minLon = Math.min(minLon, p.longitude)
    maxLon = Math.max(maxLon, p.longitude)
  }
  const latPad = marginMi / MI_PER_DEG_LAT
  const midLat = (minLat + maxLat) / 2
  const cos = Math.max(0.01, Math.cos((midLat * Math.PI) / 180))
  const lonPad = marginMi / (MI_PER_DEG_LAT * cos)
  return [minLon - lonPad, minLat - latPad, maxLon + lonPad, maxLat + latPad]
}

// Project (lng,lat) into a local equirectangular plane centered on (lng0,lat0),
// in miles. Cheap and accurate over the short spans this measures.
function toLocalMiles(lng: number, lat: number, lng0: number, lat0: number): [number, number] {
  const x = (lng - lng0) * MI_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180)
  const y = (lat - lat0) * MI_PER_DEG_LAT
  return [x, y]
}

// Distance (miles) from the projected origin P(0,0) to segment A–B.
function originToSegmentMiles(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(ax, ay)
  let t = -(ax * dx + ay * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(ax + t * dx, ay + t * dy)
}

// Ray-casting point-in-ring test in lon/lat space.
function pointInRing(lng: number, lat: number, ring: Position[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const hit = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (hit) inside = !inside
  }
  return inside
}

// A geometry's polygons as ring lists: Polygon → one, MultiPolygon → many.
// Anything else contributes nothing.
function polygonsOf(geom: Geometry | null): Position[][][] {
  if (!geom) return []
  if (geom.type === 'Polygon') return [geom.coordinates]
  if (geom.type === 'MultiPolygon') return geom.coordinates
  return []
}

// Miles from a point to a fire's perimeter: 0 if inside any polygon's outer ring
// (holes are ignored — being on an unburned island amid fire is still a warning),
// otherwise the min distance to any ring edge.
function distanceToFeatureMiles(lat: number, lon: number, geom: Geometry | null): number {
  const polys = polygonsOf(geom)
  let min = Infinity
  for (const rings of polys) {
    if (rings.length > 0 && pointInRing(lon, lat, rings[0])) return 0
    for (const ring of rings) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [ax, ay] = toLocalMiles(ring[i][0], ring[i][1], lon, lat)
        const [bx, by] = toLocalMiles(ring[i + 1][0], ring[i + 1][1], lon, lat)
        const d = originToSegmentMiles(ax, ay, bx, by)
        if (d < min) min = d
      }
    }
  }
  return min
}

// The middle of a geometry's bounding box. Cheap, and stable in a way a
// centroid is not: a ring winding the other way, or a multipolygon of scattered
// islands, moves a centroid and leaves a bbox alone.
function featureCenter(geom: Geometry | null): { latitude: number; longitude: number } {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const rings of polygonsOf(geom)) {
    for (const ring of rings) {
      for (const [lng, lat] of ring) {
        if (lng < west) west = lng
        if (lng > east) east = lng
        if (lat < south) south = lat
        if (lat > north) north = lat
      }
    }
  }
  if (!Number.isFinite(west)) return { latitude: 0, longitude: 0 }
  return { latitude: (south + north) / 2, longitude: (west + east) / 2 }
}

function featureFireName(props: WildfireProps | null): string {
  const p = props ?? {}
  return (p.attr_IncidentName || p.poly_IncidentName || '').trim() || 'unnamed fire'
}

/**
 * The Wildfire (mi) column's on-screen cell once the check has answered
 * (#256). Three states, each visible (TJ, PR #275 review): the ⚠️ and the
 * mileage where a fire is within FIRE_WARN_MILES (the column is the flag's
 * only home — the name column carries nothing, so one row never warns
 * twice), the dash where the check ran and cleared the row, and `N/A` where
 * the row was never checked because it sits outside the fire dataset's
 * US-only coverage. Cleared and unchecked stay distinct marks so a missing
 * warning is never mistaken for a clear check. The CSV renders its own cell
 * (resultsCsv.ts): a file needs the number bare to stay parseable, where
 * this string is written for a human reading a row.
 */
export function fireCellText(warning: FireWarning | undefined, uncovered: boolean): string {
  if (warning) return `⚠️ ${warning.miles.toFixed(1)}`
  return uncovered ? 'N/A' : '—'
}

/**
 * The same cell while the check is still running: a ticking trail of middle
 * dots — the separator glyph the app already speaks (`Precipitation ·
 * Total`), so the loader reads as the product's own punctuation rather than
 * a terminal cursor. Frames rather than a spinner because the cell is a text
 * column in a font-mono table — a glyph animation stays in the type system
 * and costs no layout. The component owns the clock (and mutes the type);
 * this owns the frames so the sequence is testable without a DOM.
 */
export const FIRE_LOADING_FRAMES = ['·', '··', '···', ''] as const

export function fireLoadingFrame(tick: number): string {
  return FIRE_LOADING_FRAMES[((tick % FIRE_LOADING_FRAMES.length) + FIRE_LOADING_FRAMES.length) % FIRE_LOADING_FRAMES.length]
}

/**
 * The destinations the fire dataset cannot see, keyed by `geoKey` (#256).
 *
 * `coverage` is the server-published WFIGS outline (a coarse US shape, split
 * at the antimeridian so the plain ray cast above needs no wraparound case).
 * A point outside it was never checked, and the table and the CSV mark its
 * wildfire cell `N/A` per row rather than raising one report-wide banner — a
 * Cascades row and a British Columbia row in the same table each say what
 * happened to them. A missing `coverage` (an older server) returns the empty
 * set, which degrades to the old trust-the-empty-answer behavior.
 */
export function uncoveredKeys(
  points: { latitude: number; longitude: number }[],
  coverage: MultiPolygon | undefined,
): Set<string> {
  const out = new Set<string>()
  if (!coverage) return out
  for (const p of points) {
    if (!coverage.coordinates.some((polygon) => pointInRing(p.longitude, p.latitude, polygon[0]))) {
      out.add(geoKey(p.latitude, p.longitude))
    }
  }
  return out
}

// The nearest active fire to (lat, lon), or null when there are none. Distance is
// 0 when the point lies inside a perimeter. The caller applies the mileage
// threshold — this always returns the closest fire it saw.
export function nearestFire(
  lat: number,
  lon: number,
  fires: FeatureCollection,
): FireWarning | null {
  let best: FireWarning | null = null
  for (const f of fires.features as Feature[]) {
    const d = distanceToFeatureMiles(lat, lon, f.geometry)
    if (!Number.isFinite(d)) continue
    if (best === null || d < best.miles) {
      best = {
        miles: d,
        name: featureFireName(f.properties as WildfireProps | null),
        ...featureCenter(f.geometry),
      }
      // A destination inside a perimeter measures zero, and nothing in the
      // rest of the snapshot can beat it. Rare, and the loop is not a
      // bottleneck; it is here because "stop when the answer cannot improve"
      // costs one line (#337, finding 5).
      if (d === 0) break
    }
  }
  return best
}
