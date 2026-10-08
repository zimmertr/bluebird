/**
 * Which map layers can draw anything over the map's current view.
 *
 * A layer whose data stops at a border draws nothing past it, and nothing is
 * ambiguous: outside the Forest Service feeds an empty closures layer means
 * "not covered", never "open" (#551), and the same holds for every layer here.
 * The Layers menu used to say so in its labels, three ways at once (`(West)`,
 * `(US only)`, `(OR/WA)`), and the row that most needed one had no truthful
 * short form: the area feeds cover eight states and no word names them. So the
 * menu greys the row instead, the way the Forecast player greys when nothing
 * spans time (#460): a grey row says the layer has nothing to say HERE, and
 * the label stays the layer's name.
 *
 * The rule is "wholly outside": a view that overlaps an outline at all keeps
 * its row live, and the layer draws to its edge, which is honest. The outlines
 * for the three snapshot layers are the server's, published by
 * `/api/capabilities` as the same geometries that ride each layer's own
 * response (`useCapabilities.ts`); the three raster and plume layers carry a
 * measured extent each in their own pure module. A missing outline (an older
 * server, or the moment before the fetch answers) keeps every row live, which
 * is what the menu did before.
 *
 * `BBox` is `[west, south, east, north]` in degrees, the order a raster
 * source's `bounds` and the overlay fetches already take.
 */
import type { MultiPolygon, Position } from 'geojson'
import { pointInRing } from './fireProximity'
import { RADAR_EXTENTS } from './radar'
import { SMOKE_EXTENT } from './smoke'
import { SNOW_BOUNDS } from './snowDepth'
import type { BBox } from './wildfires'

/** The outlines `/api/capabilities` publishes; each absent until it answers. */
export interface LayerCoverage {
  wildfires?: MultiPolygon
  areaClosures?: MultiPolygon
  trailClosures?: MultiPolygon
}

/** The Layers rows whose data has an edge, by the keys the menu uses. */
export type BoundedLayer = 'closedareas' | 'closedtrails' | 'fires' | 'radar' | 'smoke' | 'snow'

/** What MapLibre's `getBounds()` answers, without naming its class. */
export interface ViewBounds {
  getWest(): number
  getSouth(): number
  getEast(): number
  getNorth(): number
}

/**
 * The view as boxes inside [-180, 180], so it can meet outlines that are split
 * at the antimeridian. MapLibre reports a view across the antimeridian as a
 * west past -180 or an east past 180 rather than as a wrap, and a view wider
 * than the world as one wider than 360°, which this answers as the whole
 * world: nothing is outside it.
 */
export function viewBoxes(view: ViewBounds): BBox[] {
  const south = view.getSouth()
  const north = view.getNorth()
  let west = view.getWest()
  let east = view.getEast()
  if (east - west >= 360) return [[-180, south, 180, north]]
  // Bring the west edge into range and carry the east with it.
  const shift = Math.floor((west + 180) / 360) * 360
  west -= shift
  east -= shift
  if (east <= 180) return [[west, south, east, north]]
  return [
    [west, south, 180, north],
    [-180, south, east - 360, north],
  ]
}

/** Whether two boxes share any ground, edges included. */
export function boxesMeet(a: BBox, b: BBox): boolean {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]
}

function inBox(p: Position, box: BBox): boolean {
  return p[0] >= box[0] && p[0] <= box[2] && p[1] >= box[1] && p[1] <= box[3]
}

// Whether segment pq crosses segment rs, by orientation; a touch counts.
function orient(p: Position, q: Position, r: Position): number {
  const v = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  return v > 0 ? 1 : v < 0 ? -1 : 0
}
function onSegment(p: Position, q: Position, r: Position): boolean {
  return (
    Math.min(p[0], q[0]) <= r[0] &&
    r[0] <= Math.max(p[0], q[0]) &&
    Math.min(p[1], q[1]) <= r[1] &&
    r[1] <= Math.max(p[1], q[1])
  )
}
function segmentsCross(p: Position, q: Position, r: Position, s: Position): boolean {
  const o1 = orient(p, q, r)
  const o2 = orient(p, q, s)
  const o3 = orient(r, s, p)
  const o4 = orient(r, s, q)
  if (o1 !== o2 && o3 !== o4) return true
  if (o1 === 0 && onSegment(p, q, r)) return true
  if (o2 === 0 && onSegment(p, q, s)) return true
  if (o3 === 0 && onSegment(r, s, p)) return true
  return o4 === 0 && onSegment(r, s, q)
}

/**
 * Whether a box shares any ground with an outline's outer ring.
 *
 * Three cases cover every overlap of a rectangle and a polygon: a vertex of
 * the ring inside the box, a corner of the box inside the ring, or an edge of
 * each crossing. The first two catch containment either way round; the third
 * catches a ring that passes through the box with no vertex of either inside
 * the other. Holes are ignored, as the proximity checks ignore them: a view
 * over a hole in coverage is a view the outline's author did not mean to
 * exclude at this scale.
 */
export function boxMeetsRing(box: BBox, ring: Position[]): boolean {
  if (ring.some((p) => inBox(p, box))) return true
  const corners: Position[] = [
    [box[0], box[1]],
    [box[2], box[1]],
    [box[2], box[3]],
    [box[0], box[3]],
  ]
  if (corners.some((c) => pointInRing(c[0], c[1], ring))) return true
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    for (let k = 0; k < 4; k++) {
      if (segmentsCross(ring[j], ring[i], corners[k], corners[(k + 1) % 4])) return true
    }
  }
  return false
}

function boxesMeetOutline(boxes: BBox[], outline: MultiPolygon): boolean {
  return boxes.some((box) => outline.coordinates.some((polygon) => boxMeetsRing(box, polygon[0])))
}

function boxesMeetAny(boxes: BBox[], extents: readonly BBox[]): boolean {
  return boxes.some((box) => extents.some((extent) => boxesMeet(box, extent)))
}

const NONE: ReadonlySet<BoundedLayer> = new Set()

/**
 * The layers that can draw nothing over `view`: each whose coverage the view
 * lies wholly outside. A layer whose outline the server has not published is
 * never here.
 */
export function layersOutOfView(view: ViewBounds, coverage: LayerCoverage): ReadonlySet<BoundedLayer> {
  const boxes = viewBoxes(view)
  const out = new Set<BoundedLayer>()
  if (coverage.areaClosures && !boxesMeetOutline(boxes, coverage.areaClosures)) out.add('closedareas')
  if (coverage.trailClosures && !boxesMeetOutline(boxes, coverage.trailClosures)) out.add('closedtrails')
  if (coverage.wildfires && !boxesMeetOutline(boxes, coverage.wildfires)) out.add('fires')
  if (!boxesMeetAny(boxes, RADAR_EXTENTS)) out.add('radar')
  if (!boxesMeetAny(boxes, [SMOKE_EXTENT])) out.add('smoke')
  if (!boxesMeetAny(boxes, [SNOW_BOUNDS])) out.add('snow')
  return out.size === 0 ? NONE : out
}

/** Whether two answers name the same rows, so a settled pan that changed nothing renders nothing. */
export function sameLayers(a: ReadonlySet<BoundedLayer>, b: ReadonlySet<BoundedLayer>): boolean {
  if (a.size !== b.size) return false
  for (const key of a) if (!b.has(key)) return false
  return true
}
