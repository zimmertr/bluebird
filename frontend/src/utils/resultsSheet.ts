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
 * The gap between the top of the results and the bottom of the forecast player,
 * which is exactly the room MapLibre's two bottom controls need and no more.
 *
 * Both of them ride `mapCornerLiftPx` into this band, one per corner, so it is
 * sized by the taller: measured in Chrome on macOS 2026-09-13 against
 * maplibre-gl's own stylesheet, the compact attribution a phone gets is a 20px
 * line plus 2px of padding top and bottom and a 10px margin — 34px — where the
 * scale bar is a 20px line plus its 2px rule and the same margin (32px) and the
 * expanded attribution a desk gets is a bare 20px line with no margin at all.
 * Re-measure if the library changes either control's box.
 *
 * The bar used to sit 40px up with no reason recorded for the number, which was
 * both more room than the credits need and, because the lift under it was an
 * ESTIMATE of the results' height rather than the height itself, a different
 * gap in every results mode (#249 review).
 */
export const TRANSPORT_GAP_PX = 34

/**
 * The transport's own height, in its tallest state: the axis switch appears
 * once two axes exist, and on a coarse pointer its halves take the 44px target
 * every other button takes. Measured at 402x874 with radar and a multi-hour
 * report, 2026-09-13; the one-axis bar is 62px and is left the same band.
 */
export const TRANSPORT_HEIGHT_PX = 80

/**
 * The band the timeline transport occupies, which the legend stack clears while
 * the bar is on screen. Derived rather than measured, so the gap above cannot
 * move without the clearance above the bar moving with it.
 */
export const TRANSPORT_BAND_PX = TRANSPORT_GAP_PX + TRANSPORT_HEIGHT_PX

/**
 * The sheet's header bar, which is also the sheet's collapsed height.
 *
 * Measured at 402x874 on a coarse pointer, 2026-09-13: 12px of padding, a
 * 19.5px title row, the 4px gap, the 44px a coarse pointer gives the mode
 * segment, the 1px rule, and the sheet's own 1px top border. Rounded up.
 *
 * This is an ESTIMATE and is used only where an estimate is the right answer:
 * the resting reserve the panel clamp takes, and the camera padding, both of
 * which must be the same number before and after a drag. What the map's bottom
 * chrome rides is the sheet's MEASURED height (`App.tsx` observes the element),
 * because an estimate that was 20px out put a different gap under the player in
 * every results mode. Re-measure if a member joins or leaves the bar.
 */
export const SHEET_HEADER_PX = 84

/**
 * One drag grip, of which the sheet carries one or two. `h-2` is 8px, but
 * `TAP.grip` floors it at 24px on a coarse pointer, which is what a phone
 * sheet actually carries — and under-counting it was half of why the estimate
 * above drifted per results mode.
 */
const GRIP_PX = 24

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
 * How far the results cover the map, which is what every anchor below measures
 * from.
 *
 * `measuredPx` is the sheet element's own height, observed in `App.tsx`. It is
 * the answer wherever it exists, because the alternative — adding up a header,
 * its grips and the panel heights — is an estimate, and an estimate that is
 * 20px out puts the forecast player a different distance above the results in
 * every results mode. It was: the header was over-counted by 20px and each grip
 * under-counted by 16, so the four modes sat 44.5, 44.5, 28.5 and 60.5px clear
 * of a panel they were all meant to clear by the same amount (#249 review).
 *
 * `estimatePx` covers the frame before the observer has reported, and `docked`
 * is every width where the results are a sibling of the map rather than a sheet
 * over it — there the map's own bottom edge IS the top of the results, so
 * nothing rides anything.
 */
export function resolveSheetLift({
  docked,
  measuredPx,
  estimatePx,
}: {
  docked: boolean
  measuredPx: number | null
  estimatePx: number
}): number {
  if (docked) return 0
  return measuredPx ?? estimatePx
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
