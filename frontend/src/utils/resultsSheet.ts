// The results sheet on a phone (#249): how tall it is, how tall it may rest, and
// how far the map's own bottom chrome rides up to clear it.
//
// On a phone the results are parked OVER the map's bottom edge instead of taking
// a share of the column, so the map keeps its full height and the legend stack,
// the timeline and the map's attribution measure from the sheet's top edge
// rather than from the bottom of the screen. Every number the anchors need is
// derived here rather than in `App.tsx`, because a component is untestable under
// the node-env Vitest and these are the numbers that decide whether a legend is
// on screen at all.
//
// Desktop is unaffected: the panel is docked below the map there, nothing is
// covered, and every function here is asked for a lift of 0.

/**
 * The legend stack's own top inset (`top-28` in `App.tsx`), which clears the
 * Controls/search/Layers column at every width.
 */
export const LEGEND_TOP_PX = 112

/**
 * What the legend stack needs to render with no scrolling: four layer rows in
 * one box plus the five-band colour key in a second, with the gap between them.
 * Measured at 402x874 with every layer on and a report held (issue #249).
 * Re-measure if a layer row or a colour band joins.
 */
export const LEGEND_STACK_PX = 245

/** The gap the legend keeps below itself when no timeline is on (`bottom-8`). */
export const LEGEND_GAP_PX = 32

/**
 * The band the timeline transport occupies, which the legend clears while the
 * bar is on screen (`bottom-28`).
 */
export const TRANSPORT_BAND_PX = 112

/** The transport's own offset off the edge it sits on (`bottom-10`). */
export const TRANSPORT_GAP_PX = 40

/**
 * The sheet's header bar, which is also the sheet's collapsed height.
 *
 * At 402px the bar carries two rows and its actions row wraps: 12px of padding,
 * a 24px title row, the 4px gap, then the 44px a coarse pointer gives the mode
 * segment plus the wrapped row of links under it, and the 1px rule. Re-measure
 * it if a member joins or leaves the bar, and round UP rather than down: this is
 * what the map's bottom chrome clears, so an over-estimate leaves a gap and an
 * under-estimate hides a legend row behind the sheet.
 */
export const SHEET_HEADER_PX = 104

/** One drag grip (`h-2`), of which the sheet carries one or two. */
const GRIP_PX = 8

/**
 * Map that stays uncovered while the sheet rests: the legend stack, its top
 * inset, and the band the timeline sits in. The transport band is counted
 * whether or not a timeline is on screen, because a map overlay must never
 * change the height of the results — toggling radar would otherwise resize the
 * sheet under the reader's hand.
 */
export const RESTING_MAP_PX = LEGEND_TOP_PX + LEGEND_STACK_PX + TRANSPORT_BAND_PX

/** The sheet's own chrome: the header bar plus each grip it renders. */
export function sheetChromePx(gripCount: number): number {
  return SHEET_HEADER_PX + gripCount * GRIP_PX
}

/**
 * The map floor the panel clamp takes on a phone before the reader has set a
 * height of their own. It is not "some map" but "enough map for the legend
 * stack to sit above the sheet", and it is bigger than the docked floor because
 * the sheet's own chrome is part of what covers the map.
 */
export function restingMapFloorPx(gripCount: number): number {
  return RESTING_MAP_PX + sheetChromePx(gripCount)
}

/**
 * The sheet's height: its chrome plus the panels inside it, or its header alone
 * while the collapse chevron is down.
 */
export function sheetHeightPx({
  collapsed,
  gripCount,
  panelsPx,
}: {
  collapsed: boolean
  gripCount: number
  panelsPx: number
}): number {
  if (collapsed) return SHEET_HEADER_PX
  return sheetChromePx(gripCount) + panelsPx
}

/**
 * Where the legend stack's bottom edge goes. `liftPx` is the sheet's height (0
 * where the results are docked), so the stack keeps exactly the clearance it
 * keeps on a full-height map: the transport's band when the bar is on screen,
 * and the plain gap otherwise.
 */
export function legendBottomPx(liftPx: number, timelineShown: boolean): number {
  return liftPx + (timelineShown ? TRANSPORT_BAND_PX : LEGEND_GAP_PX)
}

/** Where the timeline transport's bottom edge goes, on the same terms. */
export function transportBottomPx(liftPx: number): number {
  return liftPx + TRANSPORT_GAP_PX
}
