// Where the tutorial's card stands (#536), and what that leaves of the map.
// Pure, so the geometry is testable without a browser.
//
// The card stands in one place for the whole run and moves only when the
// screen does, so the reader's eye never has to find it again. On a desktop it
// stands at the map's left, as near the panel as the map's own left column
// allows, since most steps light the panel or that column, and a card centred
// on a wide map stood a screen's width from them. Its middle stands a little
// above the viewport's, raised where the demo's whole table would reach it: the
// map is at its shortest then, so a card that clears it there is on the map
// and clear of the results in every step. On a phone it spans the screen at
// the bottom, or at the top in the steps that light the results sheet
// (`phoneEdge`).
import { resolvePanelHeights } from '../utils/layout'
import { type Insets, clampInsets } from '../utils/mapFraming'
import { RESULTS_BAR_PX, dockedMapFloorPx } from '../utils/resultsSheet'
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
/**
 * How far right of the card's left edge a map step's subject may land on a
 * wide desktop. A fit into the whole free map of a 2560px screen put the
 * subject a thousand pixels from the card; kept to this, a peak, the ring or
 * the fire stands beside the card that names it. At 1280 and 1366 the map
 * ends first.
 */
export const FREE_MAP_REACH_PX = 1100
// The card's height before it is first measured.
const CARD_H_GUESS = 124
// How far down the viewport a desktop card's middle stands. The steps light
// the search box at the top of the map's left column and the Tutorial link at
// the bottom of the panel, so a card between them is near both; a little above
// the middle, so the map below it, where a fit lands on a short screen, is the
// taller band.
const CARD_MIDDLE_AT = 0.4
// The app's progress box, which it centres on the map while an analysis runs
// (`AnalysisOverlay`): 280px wide, and 205px tall as the demo fills it,
// measured 2026-09-30 at 1280x800. The analyze step is about it, so where the
// card would cover it the card stands above it.
const PROGRESS_W = 280
const PROGRESS_H = 205
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
  cardH = CARD_H_GUESS,
}: {
  viewportW: number
  viewportH: number
  isDesktop: boolean
  /** The map's box on screen. */
  map: Box
  edge: PhoneEdge
  /** The card's own height, which is the same at every step. */
  cardH?: number
}): CardPlace {
  if (!isDesktop) {
    return edge === 'top'
      ? { left: 0, width: viewportW, top: 0, edge }
      : { left: 0, width: viewportW, bottom: 0, edge }
  }
  // The player is off in the demo until its own step, whose map is the tall
  // one, so the card keeps no band for it.
  const lowest = map.top + dockedMapHeightPx(viewportH - map.top) - CARD_GAP
  const minLeft = map.left + LEFT_HELD_PX + CARD_GAP
  const maxRight = map.right - RIGHT_HELD_PX - CARD_GAP
  const width = Math.max(0, Math.min(CARD_W, maxRight - minLeft))
  const left = Math.round(Math.min(minLeft, maxRight - width))
  let top = Math.min(viewportH * CARD_MIDDLE_AT - cardH / 2, lowest - cardH)
  // The map as it stands in the analyze step, with the results folded to
  // their bar, and the progress box in its middle.
  const middleX = (map.left + map.right) / 2
  const middleY = (map.top + viewportH - RESULTS_BAR_PX) / 2
  if (left < middleX + PROGRESS_W / 2 + CARD_GAP && left + width > middleX - PROGRESS_W / 2 - CARD_GAP) {
    top = Math.min(top, middleY - PROGRESS_H / 2 - CARD_GAP - cardH)
  }
  return { left, width, top: Math.floor(Math.max(map.top + CARD_GAP, top)), edge: 'map' }
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
 * taller of the bands above and below it, reaching no further right than
 * `FREE_MAP_REACH_PX` from the card.
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
  // Kept off the map's bottom edge by the gap too, so a light there never
  // meets one on the results bar under it.
  const bottom = Math.min(map.bottom, coveredTop) - CARD_GAP
  if (edge === 'bottom') return { left, top, right, bottom: Math.min(bottom, card.top - CARD_GAP) }
  if (edge === 'top') return { left, top: Math.max(top, card.bottom + CARD_GAP), right, bottom }
  const near = Math.min(right, card.left + FREE_MAP_REACH_PX)
  const below = { left, top: Math.max(top, card.bottom + CARD_GAP), right: near, bottom }
  const above = { left, top, right: near, bottom: Math.min(bottom, card.top - CARD_GAP) }
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
