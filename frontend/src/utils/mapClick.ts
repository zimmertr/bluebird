/**
 * What one click on the map means when several things answer it, and the
 * cursor that says so before the click.
 *
 * Every kind of thing on the map that opens a popup is a target, and the
 * targets stand in one rank (TJ, 2026-10-08). A click opens the popup of the
 * highest-ranked target under it and nothing else; the cursor reads the same
 * rule, so a pointer over the map always means a click there opens something.
 * The rule lived as a chain of special cases before, with a fire swallowing
 * every click on a marker inside it and each popup layer asking the others
 * whether to stand down, which is what made a destination inside a fire or a
 * closure hard to select.
 *
 * `map/mapPopups.ts` queries the map and hands the answer here; nothing in this
 * file touches a map, a layer or an event, so Vitest can hold the rank (#383).
 */

/**
 * Every target, in rank order: the first one under the cursor takes the click.
 *
 * Small, deliberate targets first, because a reader who aims at one means it,
 * and a large shape under it can be clicked anywhere else. The ring's own
 * handles lead, then a ranked marker, then a basemap peak or lake (a
 * destination the reader may add), then a closed trail, road or site, then a
 * fire perimeter, then the closed ground around it, then a smoke plume. A fire
 * outranks the closure drawn around it because the perimeter is the smaller
 * shape and the hazard itself, and smoke is last because a plume routinely
 * covers states.
 */
export const MAP_TARGETS = ['vertex', 'result', 'poi', 'closure-trail', 'fire', 'closure-area', 'smoke'] as const
export type MapTarget = (typeof MAP_TARGETS)[number]

/**
 * What still takes a click while the ring is being drawn: its own handles and
 * a ranked marker. Everything else is scenery a corner may land on, so a ring
 * can be drawn inside a fire or a closure (TJ, 2026-10-08), where a perimeter
 * used to swallow the click.
 */
export const DRAW_TARGETS: readonly MapTarget[] = ['vertex', 'result']

/** The one thing a click does, once every target under it has been considered. */
export type MapClickAction =
  /** Open this target's popup. */
  | { kind: 'open'; target: MapTarget }
  /** Extend the ring being drawn. */
  | { kind: 'add-vertex' }
  /** Nothing: a click on bare map, which only clears the popups. */
  | { kind: 'none' }

/**
 * Every target under the cursor that may take the click, highest first. The
 * first is the click's; the rest are who it falls to when that target finds
 * nothing to open at the spot, such as a basemap label with no name.
 */
export function rankedTargets(drawing: boolean, under: readonly MapTarget[]): MapTarget[] {
  const live = drawing ? under.filter((t) => DRAW_TARGETS.includes(t)) : under
  return MAP_TARGETS.filter((t) => live.includes(t))
}

/** Which target under the cursor the click belongs to, given every target under it. */
export function resolveMapClick(drawing: boolean, under: readonly MapTarget[]): MapClickAction {
  const [target] = rankedTargets(drawing, under)
  if (target) return { kind: 'open', target }
  return drawing ? { kind: 'add-vertex' } : { kind: 'none' }
}

/**
 * The cursor over this spot, from the same rule as the click: the grab hand
 * over a ring handle, which drags as well as clicks, the pointer over any
 * other target, and otherwise the map's resting cursor, a crosshair in draw
 * mode, where the next click places a point.
 */
export function mapCursor(drawing: boolean, under: readonly MapTarget[]): string {
  const action = resolveMapClick(drawing, under)
  if (action.kind === 'open') return action.target === 'vertex' ? 'grab' : 'pointer'
  return drawing ? 'crosshair' : ''
}
