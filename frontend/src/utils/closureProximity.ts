// Flags ranked destinations that stand inside an active Forest Service area
// closure (#550). The Closure column's pure half: the fetch and its lifecycle
// live in hooks/useClosureProximity.ts, and the ring math is the fire check's
// own (fireProximity.ts), imported rather than copied so the two checks cannot
// disagree about what "inside" means.
//
// A POLYGON test and nothing else (TJ, 2026-09-30). No distance, unlike the
// fire check: a closure is a line on the ground the order draws, and a
// destination a mile outside it is not inside that order. No trail-line test
// either: a closed trail says nothing about the summit it leads to, which other
// routes reach.
// The status is the Forest Service's own, trusted as sent, the way the layers
// trust it.
import type { Feature, FeatureCollection } from 'geojson'
import { type ClosureProps, closureName, closureUrl } from './closures'
import { type FireProximityStatus, featureCenter, pointInRing, polygonsOf } from './fireProximity'

/** The closure a destination stands inside, as the table and the popup need it. */
export interface ClosureWarning {
  /** What the order is called (`closureName`: its name, else its number, else `Closure`). */
  name: string
  /** The order's own page when it has an http(s) one, else null. */
  url: string | null
  // The middle of the closure's bounding box, the fire warning's centre and
  // for the same reason: a place to show the closure, not a distance to it.
  latitude: number
  longitude: number
}

/**
 * The check's state. The same four as the fire check's, because the two
 * checks share one field, one retry doctrine and one set of cell states.
 */
export type ClosureProximityStatus = FireProximityStatus

/**
 * The two hover texts an N/A cell carries, the fire column's pair (TJ, PR #275
 * review) for the closure feeds: the row sat outside the area the feeds cover
 * (#551), or the whole check failed. The second is also the panel's line below
 * Analyze, so the cell and the panel cannot describe one failure two ways.
 *
 * The first names no place (TJ, 2026-10-01, #567). The outline takes in only
 * part of Idaho, Wyoming and Nevada, and drops a region whose feed failed, so a
 * list of states was wrong about both; a sentence that names nothing cannot
 * be. No trailing period, like the fire column's uncovered note beside it.
 */
export const CLOSURE_UNCOVERED_NOTE = 'Outside the area the closure data covers'
export const CLOSURE_UNAVAILABLE_NOTE =
  'The Forest Service is unreachable, so closure data is unavailable.'

/** The warned cell's hover sentence, and the marker popup's closure line. */
export function closureWarningText(w: ClosureWarning): string {
  return `Inside an active closure (${w.name})`
}

/**
 * The Closure column's on-screen cell once the check has answered: the fire
 * column's three visible states. The ⚠️ and the order's name where the row is
 * inside a closure, the dash where the check ran and found no order holding
 * it, and `N/A` where the row sits outside the area feeds' coverage and was
 * never checked. The dash is "no Forest Service order here", not "open": the
 * feeds carry no park, state, BLM or tribal closure (docs/DATA.md#closures).
 * The CSV writes its own cell (resultsCsv.ts), the bare name, as it writes the
 * fire column's bare number.
 */
export function closureCellText(warning: ClosureWarning | undefined, uncovered: boolean): string {
  if (warning) return `⚠️ ${warning.name}`
  return uncovered ? 'N/A' : '—'
}

/**
 * The first active area closure whose outer ring holds (lat, lon), or null.
 *
 * Holes are ignored for the fire test's reason: an island of open ground
 * inside a closure is still reached through closed ground. The first hit wins
 * because the cell has room for one order and every hit says the same thing
 * to the reader, that the destination is closed; overlapping orders are the
 * same ground closed twice, and the linked one names the forest that closed
 * it. The server's order is its snapshot's, so the pick is stable between
 * analyses of the same field.
 */
export function closureFor(
  lat: number,
  lon: number,
  areas: FeatureCollection,
): ClosureWarning | null {
  for (const f of areas.features as Feature[]) {
    const inside = polygonsOf(f.geometry).some(
      (rings) => rings.length > 0 && pointInRing(lon, lat, rings[0]),
    )
    if (!inside) continue
    const props = (f.properties ?? {}) as ClosureProps
    return { name: closureName(props), url: closureUrl(props), ...featureCenter(f.geometry) }
  }
  return null
}
