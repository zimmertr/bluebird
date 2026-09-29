// Where the tutorial's card stands (#536), and what that leaves of the map.
// Pure, so the geometry is testable without a browser.
//
// The card stands in one place for the whole run and moves only when the
// screen does, so the reader's eye never has to find it again. On a desktop it
// is centred on the map, just above the band the forecast player takes once
// the results are open: the map is at its shortest then, so a card that clears
// it there is on the map and clear of the results in every step. On a phone it
// spans the screen at the bottom, or at the top once the results are on screen
// (`phoneEdge`).
import { DEFAULT_PANEL_HEIGHT } from '../hooks/useResultsLayout'
import { bothFits, resolvePanelHeights } from '../utils/layout'
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

/**
 * The map's height on a desktop while the results are docked open in Both
 * mode at their opening heights: the shortest it gets in the tutorial.
 * `availPx` is the height the map and the results share.
 */
export function dockedMapHeightPx(availPx: number): number {
  const both = bothFits(availPx)
  const grips = both ? 2 : 1
  const { chart, table } = resolvePanelHeights(DEFAULT_PANEL_HEIGHT, DEFAULT_PANEL_HEIGHT, {
    chartShown: both,
    tableShown: true,
    availPx,
    mapMinPx: dockedMapFloorPx(grips),
  })
  // The bar and the grips come out of the same column, which is the part of
  // `dockedMapFloorPx` over what the legend stack and the player need.
  const chrome = RESULTS_BAR_PX + dockedMapFloorPx(grips) - dockedMapFloorPx(0)
  return availPx - chart - table - chrome
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
 * What the camera must leave clear on a desktop so a fit or a flight lands off
 * the card: everything down to the card's lower edge. Held to a third of each
 * axis, so a short map still has room to frame into. A phone needs none: its
 * map ends where the card begins.
 */
export function cameraInsets(card: Box, map: Box): Insets {
  return clampInsets(
    { top: card.bottom + CARD_GAP - map.top, right: 0, bottom: 0, left: 0 },
    map.right - map.left,
    map.bottom - map.top,
  )
}

/**
 * The part of the map a map step acts in: the map less the card's band and
 * less the results where they stand on a phone's map (`coveredTop`, the top of
 * whatever covers the map's bottom edge).
 */
export function freeMap(card: Box, map: Box, edge: PhoneEdge | 'map', coveredTop = map.bottom): Box {
  const bottom = Math.min(map.bottom, coveredTop)
  return edge === 'bottom'
    ? { left: map.left, top: map.top, right: map.right, bottom: Math.min(bottom, card.top - CARD_GAP) }
    : { left: map.left, top: Math.max(map.top, card.bottom + CARD_GAP), right: map.right, bottom }
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
