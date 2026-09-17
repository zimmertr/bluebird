/**
 * What one click on the map means when several layers answer it.
 *
 * Five things can sit under one cursor — a fire perimeter, a smoke plume, a
 * basemap peak or lake label, a result marker, and a draw handle — and which of
 * them the click belongs to was settled case by case against real overlaps
 * rather than derived from anything. That rule lived inside `MapView`'s click
 * handler, where Vitest cannot reach it: the component needs a canvas and this
 * environment has no DOM (#383).
 *
 * `mapFraming.ts` splits the same way. The caller queries the map and hands the
 * answer here; nothing in this file touches a map, a layer or an event.
 */
import { SMOKE_CLICK_ORDER } from './smoke'

/**
 * What the map found under the cursor, plus the two pieces of state that change
 * what a click is for.
 *
 * Booleans rather than features, because the rule reads only whether each kind
 * of thing was hit. Smoke is the exception: its three densities are three
 * layers over one source, and which of them won decides which plume the popup
 * describes.
 */
export interface MapClickHits {
  /** Draw mode: the ring is being built, so a click can mean a new vertex. */
  drawing: boolean
  /** Shift is down: keep the popups already open rather than clearing them. */
  pinning: boolean
  /** A wildfire perimeter. */
  fire: boolean
  /** A ranked result marker. */
  result: boolean
  /** A clickable basemap label, a peak or a lake. */
  poi: boolean
  /** A draw handle: a ring vertex or the midpoint between two. */
  vertex: boolean
  /** Which smoke-plume layers were hit, by layer id, in any order. */
  smoke: readonly string[]
}

/** The one thing a click does, once every layer under it has been considered. */
export type MapClickAction =
  /** Open NIFC's map on the fire under the cursor. */
  | { kind: 'open-fire' }
  /** Extend the ring being drawn. */
  | { kind: 'add-vertex' }
  /** Describe the plume drawn by this smoke layer. */
  | { kind: 'open-smoke'; layer: string }
  /** Nothing: a layer's own handler owns this click, or there is nothing under it. */
  | { kind: 'none' }

/**
 * Which layer under the cursor the click belongs to.
 *
 * One resolution for the polygon overlays, rather than a click handler per
 * layer, because they overlap in exactly the cases anyone cares about: smoke
 * comes from fires, so a plume sits on top of the perimeter that made it. Two
 * handlers there would open a tab AND a popup for one click.
 */
export function resolveMapClick(hits: MapClickHits): MapClickAction {
  // The fire wins — it is the hazard, and it is the one with somewhere to send
  // you. Deliberately ahead of draw mode, keeping the behavior the fire layer
  // already had: a perimeter swallows a vertex either way, so the click may as
  // well do the useful thing.
  if (hits.fire) return { kind: 'open-fire' }

  if (hits.drawing) {
    // Smoke is deliberately not in this list where fire is. A plume can cover a
    // whole state, so blocking on one would make large parts of the map
    // undrawable; a perimeter is small enough that treating it as an object is
    // free. A peak or lake label is not in it either, for the opposite reason:
    // outside draw mode those are destinations, and while drawing they are
    // scenery a polygon corner is allowed to land on.
    if (hits.result || hits.vertex) return { kind: 'none' }
    return { kind: 'add-vertex' }
  }

  // A destination under the cursor outranks the plume over it: the marker and
  // the label are small, deliberate targets and their own layer handlers own
  // the click. Smoke is what is left.
  if (hits.result || hits.poi) return { kind: 'none' }

  // Heaviest first: HMS nests its plumes, so a click in the interesting place
  // lands on three at once and the reader means the densest.
  const densest = SMOKE_CLICK_ORDER.find((id) => hits.smoke.includes(id))
  return densest ? { kind: 'open-smoke', layer: densest } : { kind: 'none' }
}

/**
 * Does this click clear the popups already on the map?
 *
 * Clicking the map itself dismisses every popup, the same way clicking another
 * destination does. Skipped while pinning, which is what pinning means, and
 * skipped when the click landed on something that opens a popup of its own —
 * those handlers do their own clearing, and this would otherwise close the card
 * they are about to open.
 *
 * A fire is not one of them: it opens a tab rather than a popup, so a click on
 * a perimeter clears the board like any other.
 */
export function dismissesPopups(hits: MapClickHits): boolean {
  if (hits.pinning) return false
  return !hits.poi && !hits.result && hits.smoke.length === 0
}
