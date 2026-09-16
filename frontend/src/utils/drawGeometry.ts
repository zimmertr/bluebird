/**
 * The plain data the map draws from, and the one number it gates on.
 *
 * Here rather than inside `MapView.tsx` for the reason `mapFraming.ts` is:
 * Vitest runs with no DOM and MapLibre needs a canvas, so anything defined in
 * that component is untestable by construction (#383). `bboxAreaKm2` is the
 * piece that made this matter — it is what the panel's "polygon is too large"
 * blocker reads — and the feature builders around it are the same shape: plain
 * arrays in, plain GeoJSON out, with nothing that needs a map.
 */
import type { FeatureCollection, Geometry, Position } from 'geojson'
import type { DestinationResult, GeoPolygon } from '../types'
import type { PendingDestination } from './customList'
import type { Ring } from './polylabel'

/**
 * Approximate area of a ring, as the box around it.
 *
 * A port of `bbox_area_km2` in `backend/app/models.py`, formula for formula,
 * and that is the whole point of it: the browser blocks Analyze at the size the
 * server would refuse the request at, so the two have to measure a ring the
 * same way. The true area of the ring would be a better number and a worse
 * gate, because a shape the browser accepted would then come back as a 400.
 *
 * Under three points there is no polygon yet, so there is nothing to measure.
 */
export function bboxAreaKm2(pts: [number, number][]): number | null {
  if (pts.length < 3) return null
  const lats = pts.map((p) => p[1])
  const lons = pts.map((p) => p[0])
  const latKm = (Math.max(...lats) - Math.min(...lats)) * 111
  const avgLat = (Math.max(...lats) + Math.min(...lats)) / 2
  const lonKm = (Math.max(...lons) - Math.min(...lons)) * 111 * Math.cos((avgLat * Math.PI) / 180)
  return latKm * lonKm
}

/**
 * A clicked marker's properties read back as a row.
 *
 * Only reached when the click cannot be matched to a row in the report, which
 * `results-circles` being the popup's one layer makes close to unreachable —
 * it is the guard rather than the path. The feature carries the handful of
 * values the markers themselves need, so every other column reads undefined,
 * and `popupRows.ts` draws those as the dash it draws any missing value as.
 *
 * The coordinates are arguments rather than properties because the caller has
 * the exact pair and the feature does not: a rendered feature's geometry is
 * snapped to the tile grid.
 */
export function featureRow(
  p: Record<string, unknown>,
  latitude: number,
  longitude: number,
): DestinationResult {
  return {
    name: p.name as string,
    type: p.type as DestinationResult['type'],
    osm_id: (p.osm_id as string) ?? null,
    latitude,
    longitude,
    elevation_ft: (p.elevation_ft as number) ?? null,
    precip_total_in: p.precip as number,
    wind_avg_mph: p.wind_avg as number,
    temp_avg_f: p.temp_avg as number,
    freeze_min_ft: (p.freeze_min as number) ?? null,
    aqi_avg: (p.aqi_avg as number) ?? null,
    aqi_max: (p.aqi_max as number) ?? null,
  } as DestinationResult
}

/** The drawn ring as the `draw` source's features: the shape and its handles. */
export function makeDrawData(pts: [number, number][]): object {
  const features: object[] = []

  if (pts.length >= 3) {
    features.push({
      type: 'Feature',
      properties: { kind: 'polygon' },
      geometry: { type: 'Polygon', coordinates: [[...pts, pts[0]]] },
    })
  } else if (pts.length === 2) {
    features.push({
      type: 'Feature',
      properties: { kind: 'line' },
      geometry: { type: 'LineString', coordinates: pts },
    })
  }

  // Midpoint handle between each segment — drag to insert a new vertex
  const segCount = pts.length >= 3 ? pts.length : pts.length - 1
  for (let i = 0; i < segCount; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    features.push({
      type: 'Feature',
      properties: { kind: 'midpoint', segment: i },
      geometry: { type: 'Point', coordinates: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] },
    })
  }

  // Vertices rendered last so they sit on top of midpoints
  pts.forEach((pt, i) => {
    features.push({
      type: 'Feature',
      properties: { kind: 'vertex', index: i },
      geometry: { type: 'Point', coordinates: pt },
    })
  })

  return { type: 'FeatureCollection', features }
}

// A GeoPolygon's ring (closed: last vertex repeats the first) → editable points
export function ringToPts(polygon: GeoPolygon): [number, number][] {
  const ring = (polygon.coordinates[0] ?? []).map((c) => [c[0], c[1]] as [number, number])
  if (ring.length > 1) {
    const [first, last] = [ring[0], ring[ring.length - 1]]
    if (first[0] === last[0] && first[1] === last[1]) ring.pop()
  }
  return ring
}

// Minimal features for pending custom destinations — just position + name
// label. There is no forecast to color or rank by yet.
export function pendingFC(pending: PendingDestination[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pending.map((d) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [d.longitude, d.latitude] },
      properties: { name: d.name },
    })),
  }
}

// A rendered feature's polygons, each as its own ring list (outer first, holes
// after) so `widestPole` can pole them separately. Anything that is not an
// area contributes nothing.
//
// Typed on the geometry alone rather than on MapLibre's feature, because the
// geometry is all it reads and that keeps the renderer out of a pure module.
export function polygonsOf(features: { geometry: Geometry }[]): Ring[][] {
  const out: Ring[][] = []
  for (const f of features) {
    const g = f.geometry
    const toRings = (poly: Position[][]) =>
      poly.map((r) => r.map((p) => [p[0], p[1]] as [number, number]))
    if (g.type === 'Polygon') out.push(toRings(g.coordinates))
    else if (g.type === 'MultiPolygon') for (const poly of g.coordinates) out.push(toRings(poly))
  }
  return out
}
