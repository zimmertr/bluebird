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

import { resolvePanelHeights } from './layout'

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

/**
 * Map that stays uncovered however high the reader drags: the timeline's band
 * and the inset the map's own button column occupies.
 *
 * The legend stack starts at `LEGEND_TOP_PX` because that is where the
 * Controls/search/Layers column ends, and the transport rides the same lift, so
 * it takes the same floor. Without it a drag puts the bar THROUGH that column:
 * measured at 500x757, a sheet dragged high left the transport at y 100-145,
 * across the Layers button at y 102-140 and MapLibre's zoom stack opposite it.
 *
 * The band is counted whether or not a bar is on screen, for the reason
 * `RESTING_MAP_PX` counts it: a map overlay must never decide how tall the
 * results may be.
 */
export const DRAGGED_MAP_PX = LEGEND_TOP_PX + TRANSPORT_BAND_PX

/** The sheet's own chrome: the header bar plus each grip it renders. */
export function sheetChromePx(gripCount: number): number {
  return SHEET_HEADER_PX + gripCount * GRIP_PX
}

/**
 * The cap as a map floor, which is the form `clampPanelHeight` takes: the
 * sheet's chrome is part of what covers the map, so the panels inside it may
 * only have what is left.
 */
export function draggedMapFloorPx(gripCount: number): number {
  return DRAGGED_MAP_PX + sheetChromePx(gripCount)
}

/**
 * The same cap read as a sheet height, which is the number the collision is
 * about. `availPx` is the height the map and the sheet share (the viewport less
 * any preview banner).
 *
 * A viewport shorter than the cap answers with less than a sheet needs, or with
 * nothing; the panel floors in `clampPanelHeight` win there, and the transport
 * lands in the button column as it does on any map too short for both. That is
 * the same trade the resting reserve makes.
 */
export function maxSheetPx(availPx: number): number {
  return availPx - DRAGGED_MAP_PX
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
 * How far the sheet stands up the map when it opens, before anyone has dragged
 * a grip. This is the camera's bottom padding: `fitBounds` and `flyTo` measure
 * into the whole container, which on a phone runs on behind the sheet, so a
 * fitted polygon or a pasted list otherwise lands under it.
 *
 * The RESTING lift rather than the live one, and from the default panel heights
 * rather than the reader's: a camera move must not depend on a height the
 * reader is dragging at the time, and a reader who drags the sheet over the map
 * has chosen to cover it. So this answers the same number for the whole
 * session, and only the results mode moves it.
 */
export function restingLiftPx({
  collapsed,
  gripCount,
  chartShown,
  tableShown,
  chartPx,
  tablePx,
  availPx,
}: {
  collapsed: boolean
  gripCount: number
  chartShown: boolean
  tableShown: boolean
  chartPx: number
  tablePx: number
  availPx: number
}): number {
  const { chart, table } = resolvePanelHeights(chartPx, tablePx, {
    chartShown,
    tableShown,
    availPx,
    mapMinPx: restingMapFloorPx(gripCount),
  })
  return sheetHeightPx({ collapsed, gripCount, panelsPx: chart + table })
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

/**
 * Where MapLibre's own bottom corners go: the scale bar on the left and the
 * attribution on the right, published to `map.css` as `--map-corner-lift`.
 *
 * Those two are the library's, anchored to the container's bottom edge, and on
 * a phone the results sheet stands on that edge. So the corners ride the
 * sheet's own height, which lands them in the band between the top of the
 * results and the forecast player above it — the band `TRANSPORT_GAP_PX`
 * exists to keep clear, and the one place on this edge nothing else stands.
 *
 * One number for both corners, at every width. On a desktop the results are
 * docked, the container ends where they begin, and the lift is 0 — which is
 * the same band, measured from the same edge.
 */
export function mapCornerLiftPx(liftPx: number): number {
  return liftPx
}
