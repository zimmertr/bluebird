// Where the tutorial's card stands (#536), and what that leaves of the map.
// Pure, so the geometry is testable without a browser.
//
// The card stands in one place for the whole run and moves only when the
// screen does, so the reader's eye never has to find it again. On a desktop it
// is centred on the map, just above the band the forecast player takes while
// the demo's whole table is open: the map is at its shortest then, so a card
// that clears it there is on the map and clear of the results in every step.
// On a phone it spans the screen at the bottom, or at the top in the steps that
// light the results sheet (`phoneEdge`).
import { resolvePanelHeights } from '../utils/layout'
import { type Insets, clampInsets } from '../utils/mapFraming'
import { RESULTS_BAR_PX, TRANSPORT_BAND_PX, dockedMapFloorPx } from '../utils/resultsSheet'
import type { PhoneEdge } from '../utils/tourSteps'

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** The card's width on a desktop: the width of the docked panel beside it. */
export const CARD_W = 360
/** The space the card keeps from what it stands beside. */
export const CARD_GAP = 16
// The map's left edge holds the search box, Layers and the legends
// (`MAP_COL_W`, 184px at a 12px inset), and the model list opens over it from
// the panel: measured 2026-09-29 at 1280x800, its right edge is 245px into the
// map. The right edge holds MapLibre's zoom, compass and locate buttons, 42px
// from the edge. The card keeps its gap from both.
const LEFT_HELD_PX = 245
const RIGHT_HELD_PX = 42

// The demo's table with all of its rows showing, in the steps about the
// ranking: the header row (34px) and the nine rows the demo analyzes (29px
// each), measured 2026-09-29 in Chromium at 1280x800, and room for the
// horizontal scrollbar under them. The browser suite holds every row whole at
// 1280x800 and 1366x768.
export const WHOLE_TABLE_PX = 34 + 9 * 29 + 10

/**
 * The map's height on a desktop while the demo's whole table is docked open
 * under it (Table mode, one grip): the shortest it gets in the tutorial. The
 * table never takes the map under its floor. `availPx` is the height the map
 * and the results share.
 */
export function dockedMapHeightPx(availPx: number): number {
  const { table } = resolvePanelHeights(0, WHOLE_TABLE_PX, {
    chartShown: false,
    tableShown: true,
    availPx,
    mapMinPx: dockedMapFloorPx(1),
  })
  // The bar and the grip come out of the same column, which is the part of
  // `dockedMapFloorPx` over what the legend stack and the player need.
  const chrome = RESULTS_BAR_PX + dockedMapFloorPx(1) - dockedMapFloorPx(0)
  return availPx - table - chrome
}

/** Where the card stands, as the fixed-position style it wears. */
export interface CardPlace {
  left: number
  width: number
  /** One of the two is set: a desktop and a phone's bottom edge stand on `bottom`. */
  top?: number
  bottom?: number
  edge: PhoneEdge | 'map'
}

export function cardPlace({
  viewportW,
  viewportH,
  isDesktop,
  map,
  edge,
}: {
  viewportW: number
  viewportH: number
  isDesktop: boolean
  /** The map's box on screen. */
  map: Box
  edge: PhoneEdge
}): CardPlace {
  if (!isDesktop) {
    return edge === 'top'
      ? { left: 0, width: viewportW, top: 0, edge }
      : { left: 0, width: viewportW, bottom: 0, edge }
  }
  const lowest = map.top + dockedMapHeightPx(viewportH - map.top) - TRANSPORT_BAND_PX - CARD_GAP
  const minLeft = map.left + LEFT_HELD_PX + CARD_GAP
  const maxRight = map.right - RIGHT_HELD_PX - CARD_GAP
  const width = Math.max(0, Math.min(CARD_W, maxRight - minLeft))
  const centred = map.left + (map.right - map.left - width) / 2
  const left = Math.round(Math.min(Math.max(centred, minLeft), maxRight - width))
  return { left, width, bottom: Math.round(viewportH - lowest), edge: 'map' }
}

/**
 * What the map's own chrome takes of each edge, in px in from that edge: on a
 * desktop the search box, Layers and the legends down the left and MapLibre's
 * buttons down the right; on a phone the search box, Controls, Layers
 * and the legends under them, across the top. Measured by the run, since the chrome changes with what is
 * on (a legend per layer, the Layers menu open).
 */
export interface Held {
  top: number
  right: number
  left: number
}

export const NOTHING_HELD: Held = { top: 0, right: 0, left: 0 }

/**
 * The part of the map a map step acts in and a camera frames into: the map
 * less the card's band, less what its own chrome holds, and less whatever
 * covers its bottom edge (`coveredTop`: the player, and on a phone the results
 * sheet). On a desktop the card stands inside the map, so the free part is the
 * taller of the bands above and below it.
 */
export function freeMap(
  card: Box,
  map: Box,
  edge: PhoneEdge | 'map',
  coveredTop = map.bottom,
  held: Held = NOTHING_HELD,
): Box {
  const left = map.left + held.left
  const right = map.right - held.right
  const top = map.top + held.top
  const bottom = Math.min(map.bottom, coveredTop)
  if (edge === 'bottom') return { left, top, right, bottom: Math.min(bottom, card.top - CARD_GAP) }
  if (edge === 'top') return { left, top: Math.max(top, card.bottom + CARD_GAP), right, bottom }
  const below = { left, top: Math.max(top, card.bottom + CARD_GAP), right, bottom }
  const above = { left, top, right, bottom: Math.min(bottom, card.top - CARD_GAP) }
  return above.bottom - above.top > below.bottom - below.top ? above : below
}

/**
 * What the camera must leave clear so a fit or a flight lands in the free map,
 * never under the card or the map's own chrome. Held so each axis keeps a third
 * of the map at least, so a short map still has room to frame into.
 */
export function cameraInsets(free: Box, map: Box): Insets {
  return clampInsets(
    {
      top: free.top - map.top,
      right: map.right - free.right,
      bottom: map.bottom - free.bottom,
      left: free.left - map.left,
    },
    map.right - map.left,
    map.bottom - map.top,
  )
}

/** The part of `a` inside `b`, or null where they do not meet. */
export function clip(a: Box, b: Box): Box | null {
  const box = {
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  }
  return box.right > box.left && box.bottom > box.top ? box : null
}

/** Whether two boxes share any area. */
export function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}
