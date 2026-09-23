/**
 * Polygon geometry: how the drawn ring is built and read back, the one number
 * it is gated on, and the rings a rendered area gives up for a label.
 *
 * Here rather than inside `MapView.tsx` for the reason `mapFraming.ts` is:
 * Vitest runs with no DOM and MapLibre needs a canvas, so anything defined in
 * that component is untestable by construction (#383). `bboxAreaKm2` is the
 * piece that made this matter — it is what the panel's "polygon is too large"
 * blocker reads — and `App.tsx` rather than the map is what calls it, so the
 * area of a ring restored from a link is on screen before the map has loaded.
 */
import type { Geometry, Position } from 'geojson'
import type { GeoPolygon } from '../types'
import type { Ring } from './polylabel'

/**
 * Approximate area of a ring, as the box around it.
 *
 * A port of `bbox_area_km2` in `backend/app/models/common.py`, formula for formula,
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

/**
 * The ring as the polygon the app holds, closed back onto its first point, or
 * null under three points, where there is no polygon yet. One spelling for the
 * two places a ring leaves the map: every committed edit, and Done.
 */
export function ringPolygon(pts: [number, number][]): GeoPolygon | null {
  return pts.length >= 3 ? { type: 'Polygon', coordinates: [[...pts, pts[0]]] } : null
}

/** The ring with one vertex moved, the others untouched. */
export function moveVertex(
  pts: [number, number][],
  index: number,
  to: [number, number],
): [number, number][] {
  return pts.map((p, j) => (j === index ? to : p))
}

/** The ring without one vertex. */
export function removeVertex(pts: [number, number][], index: number): [number, number][] {
  return pts.filter((_, i) => i !== index)
}

/**
 * The ring with a point inserted on a segment, where a midpoint handle sits.
 * Segment `n` runs from vertex `n` to vertex `n + 1`, so the new point lands at
 * index `n + 1` and is the vertex the drag then moves.
 */
export function insertOnSegment(
  pts: [number, number][],
  segment: number,
  pt: [number, number],
): [number, number][] {
  return [...pts.slice(0, segment + 1), pt, ...pts.slice(segment + 1)]
}
