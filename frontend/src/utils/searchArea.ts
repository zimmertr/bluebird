/**
 * The search area when no ring is drawn: the map's own view (record 0309).
 *
 * The view is the area a reader is already looking at, so it is what a
 * Forecast searches unless they draw a ring or pick a list. It is handed to
 * the gate, the count ahead of Forecast and the command exactly where a drawn
 * ring would be, as a four-cornered ring of the box the view covers lying flat
 * (`viewBoxOf`), so every rule a ring obeys (the area cap among them) holds
 * for the view with no second spelling.
 *
 * Rounded to four decimals, about 8 m, so a pan of a pixel or two is not a new
 * area to count.
 */
import type { GeoPolygon } from '../types'
import { roundTo } from './numbers'
import type { BBox } from './wildfires'

const DECIMALS = 4

/** The closed ring of a `[west, south, east, north]` box, corners anticlockwise. */
export function boxRing(box: BBox): GeoPolygon {
  const [w, s, e, n] = box.map((v) => roundTo(v, DECIMALS))
  return {
    type: 'Polygon',
    coordinates: [
      [
        [w, s],
        [e, s],
        [e, n],
        [w, n],
        [w, s],
      ],
    ],
  }
}

/** Whether two rings are the same area to search, so a state update can keep the old one. */
export function sameRing(a: GeoPolygon | null, b: GeoPolygon | null): boolean {
  return JSON.stringify(a?.coordinates ?? null) === JSON.stringify(b?.coordinates ?? null)
}

/** Where a Forecast searches: the drawn ring, the view, or a list alone. */
export type AreaSource = 'drawn' | 'view' | 'list'

/**
 * The ring a Forecast searches and the point count the gate reads for it.
 * A drawn ring of three points or more wins; otherwise the view, unless the
 * reader chose a list, which searches no ring at all.
 */
export function searchArea(
  drawn: GeoPolygon | null,
  drawPointCount: number,
  view: GeoPolygon | null,
  listOnly: boolean,
): { polygon: GeoPolygon | null; pointCount: number; source: AreaSource } {
  if (drawPointCount > 0) return { polygon: drawn, pointCount: drawPointCount, source: 'drawn' }
  if (listOnly || view === null) return { polygon: null, pointCount: 0, source: 'list' }
  return { polygon: view, pointCount: 4, source: 'view' }
}
