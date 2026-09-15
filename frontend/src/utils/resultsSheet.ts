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
// Desktop is mostly unaffected: the panel is docked below the map there,
// nothing is covered, and every lift here is 0. The one number it does take is
// `dockedMapFloorPx` — the map floor. A docked panel does not cover the map,
// but it does take its height out of the same column, so "enough map for the
// legend stack" is the same question at both widths and is answered from the
// same three constants.

import { resolvePanelHeights } from './layout'

/**
 * The legend stack's own top inset (`LEGEND_TOP` in `styles.ts`, which spells
 * the classes and carries the derivation).
 *
 * `LEGEND_TOP` has FOUR numbers: two pointer sizes, each with and without the
 * Controls button, which stands in the column only while the panel is
 * collapsed. These two are the pair a FLOOR is about, and they are not the same
 * arm of that table:
 *
 *   - `LEGEND_TOP_PX` is the coarse inset with the Controls button (156), which
 *     is the phone at rest: the drawer is closed, so the button is up, and the
 *     sheet covers the map's bottom whatever the drawer is doing. Everything
 *     derived from it here is the sheet's, and a floor is a promise about the
 *     smallest map that will do — so it takes the taller column.
 *   - `LEGEND_TOP_FINE_PX` is the fine inset WITHOUT it (92), which is the
 *     desktop a docked floor is asked about: the panel is docked, so the
 *     Controls button is not there. When it is, the panel is collapsed and the
 *     map has that whole panel back, so the floor is the slacker constraint
 *     rather than the binding one.
 */
export const LEGEND_TOP_PX = 156
export const LEGEND_TOP_FINE_PX = 92

/**
 * What the legend stack needs to render with no scrolling: four layer rows in
 * one box plus the six-band colour key in a second, with the gap between them.
 * Measured in Chrome 2026-09-14 with every layer on, the forecast grid drawn
 * and a freezing-level ranking held: 94px of layer rows, the 8px gap, and
 * 163px of key. The same number at both widths, because the boxes are one
 * fixed width (`MAP_COL_W`) and a legend row is read rather than operated, so
 * no part of it takes the coarse-pointer target the buttons above it do.
 *
 * It was 245 while the tallest key had five bands. The freezing level's key has
 * six (2026-09-14), which is the second time a band has joined — re-measure if
 * a layer row or a colour band joins again.
 */
export const LEGEND_STACK_PX = 265

/** The gap the legend keeps below itself when no timeline is on (`bottom-8`). */
export const LEGEND_GAP_PX = 32

/**
 * The gap between the top of the results and the bottom of the forecast player:
 * the band MapLibre's two bottom controls stand in, one per corner, each
 * centred in it by `map.css`.
 *
 * Sized by the taller control plus the library's own margin on BOTH sides of
 * it. Measured in Chrome on macOS 2026-09-13 against maplibre-gl's stylesheet:
 * the compact attribution a phone gets is a 20px line plus 2px of padding top
 * and bottom (`CORNER_CONTROL_PX`), the scale bar is a 20px line plus its 2px
 * rule, and the expanded attribution a desk gets is a bare 20px line. The
 * library keeps 10px between a control and the container's edge
 * (`CORNER_MARGIN_PX`), and the band keeps that same 10px between the control
 * and the player above it, so a control is exactly as far from the player as
 * it is from the results — and stands exactly where the library would put it
 * with no player on screen at all. Re-measure if the library changes either
 * control's box.
 *
 * A band of the control plus ONE margin was tried first (#249 review, round
 * two): it sat the attribution's top edge against the player's bottom edge.
 * The bar used to sit 40px up with no reason recorded for the number, which was
 * both more room than the credits need and, because the lift under it was an
 * ESTIMATE of the results' height rather than the height itself, a different
 * gap in every results mode (#249 review).
 */
export const CORNER_CONTROL_PX = 24
export const CORNER_MARGIN_PX = 10
export const TRANSPORT_GAP_PX = CORNER_CONTROL_PX + 2 * CORNER_MARGIN_PX

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
 * 19.5px title row, the 4px gap, then 66px of actions — the mode segment at the
 * 44px a coarse pointer gives it, and the links (five today) wrapping under it, which
 * they do at this width now that they read at the size of every other control —
 * then the 1px rule and the sheet's own 1px top border. Rounded up from 103.5.
 *
 * This is an ESTIMATE and is used only where an estimate is the right answer:
 * the resting reserve the panel clamp takes, and the camera padding, both of
 * which must be the same number before and after a drag. What the map's bottom
 * chrome rides is the sheet's MEASURED height (`App.tsx` observes the element),
 * because an estimate that was 20px out put a different gap under the player in
 * every results mode. Re-measure if a member joins or leaves the bar.
 */
export const SHEET_HEADER_PX = 104

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

/**
 * The results bar above the docked panels: the mode segment, the row count and
 * the export links. Measured in Chrome at 1440x1000, 2026-09-14 (35px) and
 * rounded up. The sheet's own header is taller and is `SHEET_HEADER_PX`; this
 * is the docked half of the same bar, with no grab handle and no sheet border.
 */
export const RESULTS_BAR_PX = 36

/**
 * One drag grip as the docked panel draws it (`h-2`). The sheet's grips are
 * floored at 24 by `TAP.grip`, and this is the same control on a pointer.
 */
const DOCKED_GRIP_PX = 8

/**
 * The map floor the panel clamp takes where the results are DOCKED below the
 * map rather than parked over it.
 *
 * Same question as `restingMapFloorPx`, same three constants: the stack's
 * inset, the stack itself, and the band the timeline stands in — counted
 * whether or not a bar is on screen, because a map overlay must never decide
 * how tall the results may be.
 *
 * What differs is the chrome. A docked panel covers nothing, but its bar and
 * its grips come out of the same column as the map, and `resolvePanelHeights`
 * clamps only the two panel heights. So they are part of the floor here, or
 * the map ends up short of it by exactly their height — which is what put the
 * bottom of the legend stack under the results bar before this existed.
 *
 * It replaces the fixed 280 `resolvePanelHeights` defaults to: that number
 * predated the legend stack and was under half of what the stack now needs.
 */
export function dockedMapFloorPx(gripCount: number): number {
  // The FINE inset, not `RESTING_MAP_PX`'s coarse one: the results are docked
  // beside a pointer, and a docked layout on a coarse pointer is a tablet wide
  // enough that the 16px is noise either way.
  const reserve = LEGEND_TOP_FINE_PX + LEGEND_STACK_PX + TRANSPORT_BAND_PX
  return reserve + RESULTS_BAR_PX + gripCount * DOCKED_GRIP_PX
}

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
 * The band's height is published beside the lift (`--map-corner-band`) so the
 * stylesheet can centre each control in it rather than stand it on the edge.
 *
 * One number for both corners, at every width. On a desktop the results are
 * docked, the container ends where they begin, and the lift is 0 — which is
 * the same band, measured from the same edge.
 */
export function mapCornerLiftPx(liftPx: number): number {
  return liftPx
}
