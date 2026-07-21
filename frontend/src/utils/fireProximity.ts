// Flags ranked destinations that sit within a few miles of an active wildfire.
// The distance is measured to the fire *perimeter* (0 when the point is inside
// it), not to a centroid — a large fire's centroid can be many miles from its
// edge, so a centroid check would badly under-warn. Everything here is pure and
// deterministic; the fetch/lifecycle lives in hooks/useFireProximity.ts.
import type { FeatureCollection, Feature, Geometry, Position } from 'geojson'
import type { BBox, WildfireProps } from './wildfires'

export const FIRE_WARN_MILES = 10

export interface FireWarning {
  miles: number // 0 when the point falls inside a perimeter
  name: string
}

// One degree of latitude ≈ 69 mi. Longitude is scaled by cos(lat). Good to a
// fraction of a percent at the ~10 mi scale this warning cares about.
const MI_PER_DEG_LAT = 69.0

// Stable lookup key tying a result row to its warning. Coordinate-based so it
// survives the results table's client-side re-sorting.
export function fireKey(lat: number, lon: number): string {
  return `${lat.toFixed(5)},${lon.toFixed(5)}`
}

// Tooltip text, phrased to read cleanly whatever NIFC calls the incident (plain
// names, ALL-CAPS codes, numbered dispatches, …).
export function fireWarningText(w: FireWarning): string {
  if (w.miles < 0.1) return `Inside an active wildfire perimeter (${w.name})`
  return `${w.miles.toFixed(1)} mi from an active wildfire (${w.name})`
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

function featureFireName(props: WildfireProps | null): string {
  const p = props ?? {}
  return (p.attr_IncidentName || p.poly_IncidentName || '').trim() || 'unnamed fire'
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
      best = { miles: d, name: featureFireName(f.properties as WildfireProps | null) }
    }
  }
  return best
}
