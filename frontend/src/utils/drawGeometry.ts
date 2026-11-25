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
 * The most positions a ring may carry, the closing repeat of its first point
 * included (#619). The fallback for `limits.max_polygon_points`, held until
 * `/api/capabilities` answers, and the browser's half of `MAX_POLYGON_POINTS` in
 * `backend/app/limits.py`: every position is copied into every clause of the
 * Overpass query, so the server refuses a ring past it, and the draw tool and a
 * share link stop there rather than build one it would refuse.
 */
export const MAX_POLYGON_POINTS = 1_000

/**
 * Whether one more point fits in a ring of `pts`, under a cap that counts the
 * closing repeat as the server does. The one test the draw tool's two ways of
 * adding a point share.
 */
export function ringHasRoom(pts: readonly [number, number][], maxPoints: number): boolean {
  return pts.length + 1 < maxPoints
}

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

/** How far a hand's stroke may stray from the loop drawn for it, in screen pixels, before a point is kept. */
const LOOP_TOLERANCE_PX = 3

/** The smallest stroke that is a loop rather than a slip: its box, in screen pixels, on its longer side. */
const LOOP_MIN_SPAN_PX = 12

function offLine(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1])
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len
}

// Douglas-Peucker: keep a point only where the stroke strays past `tol` from
// the straight line its neighbours would draw. A stack rather than recursion,
// so a long stroke cannot run out of frames.
function douglasPeucker(pts: [number, number][], tol: number): [number, number][] {
  const keep = new Array<boolean>(pts.length).fill(false)
  keep[0] = true
  keep[pts.length - 1] = true
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length > 0) {
    const [i, j] = stack.pop()!
    let far = -1
    let farDist = tol
    for (let k = i + 1; k < j; k++) {
      const d = offLine(pts[k], pts[i], pts[j])
      if (d > farDist) {
        far = k
        farDist = d
      }
    }
    if (far === -1) continue
    keep[far] = true
    stack.push([i, far], [far, j])
  }
  return pts.filter((_, k) => keep[k])
}

/**
 * A hand's one stroke, in screen pixels, as the loop's points (record 0316):
 * the corners the stroke turned, closed from its last point back to its first,
 * at most as many as a ring under `maxPoints` may carry. Empty for a stroke too
 * small to be a loop, or one that turned fewer than three corners.
 *
 * The tolerance starts at what an eye cannot tell from the stroke and widens
 * until the loop fits under the cap, so an ordinary loop keeps its shape and
 * only a stroke that wanders for minutes is drawn coarser.
 */
export function simplifyLoop(stroke: [number, number][], maxPoints: number): [number, number][] {
  if (stroke.length < 3) return []
  const xs = stroke.map((p) => p[0])
  const ys = stroke.map((p) => p[1])
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  if (span < LOOP_MIN_SPAN_PX) return []
  // The stroke ends where the hand let go, which is near its start but rarely
  // on it: the loop closes the gap, so the last point is a corner like any.
  let tol = LOOP_TOLERANCE_PX
  let loop = douglasPeucker(stroke, tol)
  while (loop.length + 1 > maxPoints) {
    tol *= 1.5
    loop = douglasPeucker(stroke, tol)
  }
  return loop.length >= 3 ? loop : []
}
