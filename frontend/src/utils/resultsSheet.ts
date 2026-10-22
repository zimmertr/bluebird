// The results sheet on a phone (#249): how tall it is, how tall it may rest, and
// how far the map's own bottom chrome rides up to clear it.
//
// On a phone the results are parked OVER the map's bottom edge instead of taking
// a share of the column, so the map keeps its full height and the legend stack,
// the timeline and the map's attribution measure from the sheet's top edge
// rather than from the bottom of the screen. Every number the anchors need is
// derived here rather than in `MapStage.tsx`, because `MapStage.tsx` renders the
// map, which no Vitest project can stand up without a mock, and these are the numbers that decide
// whether a legend is on screen at all.
//
// Desktop is mostly unaffected: the panel is docked below the map there,
// nothing is covered, and every lift here is 0. The numbers it does take are
// `dockedMapFloorPx`, the map floor, and `legendMaxCss`, the legend card's
// height. A docked panel does not cover the map, but it does take its height
// out of the same column, so "enough map for the legend" is the same question
// at both widths and is answered from the same constants.

import { resolvePanelHeights } from './layout'

/** Where the map's two rows end, from the map's top edge (`MAP_ROWS`), at both widths since #714. */
export const MAP_ROWS_PX = 92

/**
 * The top a phone's resting sheet reserves map below: the inset the legend
 * stack had under a coarse pointer's column of search, Controls and Layers,
 * 44px rows 4px apart from a 12px inset.
 *
 * A phone has stood no legend on its map since #696, its key being the Legend
 * sheet's, and no column since its two rows (`MAP_ROWS_PX`). The number stays
 * on purpose: the sheet rests where it has since #249, so its half height is
 * the one a reader knows. Its full height is the Analyze button's
 * (`DRAGGED_MAP_PX`).
 */
export const RESTING_TOP_PX = 156

/**
 * The phone's Analyze button (#696; record 0135), an extended floating action
 * button in Material's sense: 56px tall (`FAB_PX`), 16px off the map's right
 * edge and off whatever it stands on (`FAB_INSET_PX`). `FAB_STRIP_PX` is the
 * map a full sheet leaves it, the button and an inset above and below, so the
 * sheet's highest stop is that strip under the chip row.
 */
export const FAB_PX = 56
export const FAB_INSET_PX = 16
export const FAB_STRIP_PX = FAB_INSET_PX + FAB_PX + FAB_INSET_PX

/** The gap the player keeps above the button. */
export const FAB_GAP_PX = 8

/**
 * What the legend needs to render with no scrolling: ONE card holding the
 * metric key and a section per layer that is on. Measured in Chrome 2026-09-17
 * with every layer on, the forecast grid drawn and a freezing-level ranking
 * held. The same number at both widths, because the card is one fixed width
 * (`MAP_MENU_W`) and a legend row is read rather than operated, so no part of
 * it takes a coarse pointer's target.
 *
 * It has been 245, then 265, then 313 as bands and layers joined — a six-band
 * freezing-level key (2026-09-14) and then the snow depth overlay's own section
 * (#446). #454 merged the two boxes into one and turned both scale keys into
 * strips, first with their numbers under them (196) and then with the numbers
 * inside the strip (182), which is where 131px of that went.
 *
 * **Re-measure when a SECTION joins, not when a band does.** A scale is one
 * line plus its label whatever its band count, so the six-band key that cost
 * 20px here in September costs nothing now; what still moves this number is
 * another layer, or a section growing a line.
 */
export const LEGEND_STACK_PX = 182

/** The gap the legend keeps below itself when no timeline is on. */
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
 * Measured on a coarse pointer, 2026-10-13: 84px at 360, 390, 402 and 430
 * wide, with Removed showing or not. 12px of padding, the 19.5px title row,
 * the 4px gap, the 46px actions line (the mode switch and the button group,
 * each 44px controls in a 1px-bordered well, side by side on one line since
 * #687 drops their words where the bar is narrow, `BAR_LABEL`), then the 1px
 * rule and the sheet's own 1px top border. It was 104 when the actions were
 * links that wrapped onto a second row, and briefly 106 when they were
 * buttons that wrapped onto three.
 *
 * Re-measure when the bar gains a member, because one glyph more than the
 * line holds at 360px wide wraps the group and moves this number.
 *
 * This is an ESTIMATE and is used only where an estimate is the right answer:
 * the resting reserve the panel clamp takes, and the camera padding, both of
 * which must be the same number before and after a drag. What the map's bottom
 * chrome rides is the sheet's MEASURED height (`useResultsLayout` observes the element),
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
export const RESTING_MAP_PX = RESTING_TOP_PX + LEGEND_STACK_PX + TRANSPORT_BAND_PX

/**
 * Map that stays uncovered however high the reader drags, which is a phone's
 * question alone (a desk's results are docked): the two rows and the strip
 * under them the Analyze button stands on (#696). It reserved the old column
 * and the player's band until then, 280px, which left the button nowhere to
 * stand under a full sheet. The player now stands above the button, and a
 * full sheet leaves it its room too while it is on (`PLAYER_ROOM_PX`).
 */
export const DRAGGED_MAP_PX = MAP_ROWS_PX + FAB_STRIP_PX

/**
 * The room the player takes above the button: its bar and the gap under it.
 * A full sheet leaves it while the reader has the player on (`draggedMapFloorPx`),
 * so a chart and its playhead stay on screen together; with the player off,
 * a phone's default, the sheet stops at the button's strip alone.
 */
export const PLAYER_ROOM_PX = FAB_GAP_PX + TRANSPORT_HEIGHT_PX

/**
 * The results bar above the docked panels: the mode segment, the row count and
 * the export links. Measured in Chrome at 1440x1000, 2026-09-14 (35px) and
 * rounded up. The sheet's own header is taller and is `SHEET_HEADER_PX`; this
 * is the docked half of the same bar, with no grab handle and no sheet border.
 *
 * One line, which is the bar wherever it is 896px wide or more. It is the
 * estimate for the frame before `useResultsLayout` has measured the bar, and
 * the measurement wins from then on, because a narrower bar is taller: beside
 * the docked panel at 1024 the title stands over the actions, 59px, and a
 * three-digit Removed count wraps the button group onto a line of its own,
 * 85px (#714, measured 2026-10-20). Counted at 36 there, the map came up 23 or
 * 49px short of the room the floor below keeps for it whenever the floor bound.
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
 *
 * `barPx` is the bar's height as `useResultsLayout` measured it, and
 * `RESULTS_BAR_PX` until it has.
 */
export function dockedMapFloorPx(gripCount: number, barPx: number = RESULTS_BAR_PX): number {
  // The legend card hangs from its chip, so its top is where the rows end, at
  // either pointer: the rows are the same 92px under a finger.
  const reserve = MAP_ROWS_PX + LEGEND_STACK_PX + TRANSPORT_BAND_PX
  return reserve + barPx + gripCount * DOCKED_GRIP_PX
}

/**
 * The chart and the table open at the same height, and at the height that
 * leaves the map its whole legend stack.
 *
 * One number for both, because they are two halves of one answer and an 8px
 * difference between them read as a mistake. The value is what Both mode can
 * spend on a 1000px-tall window: 1000 less the docked map floor
 * (`dockedMapFloorPx`, 541 with two grips) is 459, and two panels of 220 fit
 * inside it with the map a few pixels clear of its floor. They were 288 and
 * 280, chosen before the legend stack had a number, and at those heights the
 * bottom of the stack sat under the results bar on exactly this window.
 *
 * Shared with the phone, where the sheet's own floors take over; they are the
 * starting heights either way, and the reader's drag replaces them.
 */
export const DEFAULT_PANEL_HEIGHT = 220

/** The sheet's own chrome: the header bar plus each grip it renders. */
export function sheetChromePx(gripCount: number): number {
  return SHEET_HEADER_PX + gripCount * GRIP_PX
}

/**
 * The cap as a map floor, which is the form `clampPanelHeight` takes: the
 * sheet's chrome is part of what covers the map, so the panels inside it may
 * only have what is left.
 */
export function draggedMapFloorPx(gripCount: number, playerOn = false): number {
  return DRAGGED_MAP_PX + (playerOn ? PLAYER_ROOM_PX : 0) + sheetChromePx(gripCount)
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
 * `measuredPx` is the sheet element's own height, observed in `useResultsLayout`. It is
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
  footPx = 0,
}: {
  docked: boolean
  measuredPx: number | null
  estimatePx: number
  /**
   * A phone's home indicator band (record 0145), which is the datum on a
   * phone with no sheet: the chrome on the map's foot stands above it. 0 on
   * a desk, where the docked lift stays 0.
   */
  footPx?: number
}): number {
  if (docked) return footPx
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
 * How far above the map's bottom edge the legend stops. `liftPx` is the
 * sheet's height (0 where the results are docked), so the legend keeps
 * exactly the clearance it keeps on a full-height map: the transport's band
 * when the bar is on screen, and the plain gap otherwise.
 */
export function legendBottomPx(liftPx: number, timelineShown: boolean): number {
  return liftPx + (timelineShown ? TRANSPORT_BAND_PX : LEGEND_GAP_PX)
}

/**
 * The gap between a chip and the menu standing under it at a desk (#714):
 * 4px, half the 8px between the pill and the chip row, so the card reads as
 * its chip's (TJ, 2026-10-18). `MAP_CHIP_MENU`'s `mt-1` in `styles.ts`; the
 * test there holds the two to one number.
 */
export const CHIP_MENU_GAP_PX = 4

/**
 * The tallest a desk's legend card may be (#714): the map below the rows and
 * the gap under its chip, less the floor `legendBottomPx` keeps. A CSS length,
 * because the card hangs from its chip inside the rows and cannot see the
 * map's height; the map wrapper is a size container (`MAP_EDGE.publish`), so
 * `100cqh` is it. Past this the card scrolls inside itself.
 */
export function legendMaxCss(liftPx: number, timelineShown: boolean): string {
  return `calc(100cqh - ${MAP_ROWS_PX + CHIP_MENU_GAP_PX + legendBottomPx(liftPx, timelineShown)}px)`
}

/**
 * Where the phone's Analyze button stands (#696; record 0135). One thing
 * moves it and nothing else, Material's rule for a floating button: the
 * sheet, whose top edge it rides 16px above at every height. Never higher
 * than one inset under the chip row (`mapPx`, the map's whole height), which
 * is where a dragged sheet stops anyway (`DRAGGED_MAP_PX`). The notice band
 * that stood on the sheet's edge and raised the button by its height went
 * with record 0208: the panel's messages are a count on the button now, and
 * a list it opens.
 */
export function fabBottomPx(liftPx: number, mapPx: number): number {
  const highest = mapPx - MAP_ROWS_PX - FAB_INSET_PX - FAB_PX
  return Math.min(liftPx + FAB_INSET_PX, highest)
}

/**
 * Where a phone's scale and (i) stand: on the Analyze button's row, at its
 * left, each with its bottom on the button's bottom edge (record 0140; TJ,
 * 2026-10-14). `map.css` stands each control on the library's 10px margin
 * inside the corner band, so the band starts that margin under the button,
 * and the opened credit line, taller than the band, grows up from the same
 * edge. They were centred on the button's middle until the maintainer read
 * it on a Pixel: the credit line opened above the button's top and the
 * collapsed controls stood 6px higher than the button's foot.
 */
export function phoneCornerLiftPx(fabBottom: number): number {
  return fabBottom - CORNER_MARGIN_PX
}

/**
 * The map the Controls sheet leaves on a phone (#696; record 0141): 256px,
 * so its top stands 256px down the map at every size. The number was a sum,
 * the two rows (92), the strip a full results sheet leaves the Analyze
 * button (88), and the notice band at its fullest on the sheet's edge (10
 * over the edge and 66 of band). The band went with record 0208 and the
 * button stands under the sheet's dim (record 0207), so nothing above the
 * sheet needs the 164px under the rows; the sheet keeps them so it opens at
 * the height a reader knows, and taking them back is the maintainer's call.
 */
export const CONTROLS_MAP_PX = 256

/** The Controls sheet's height on a phone whose map is `mapPx` tall. */
export function controlsSheetPx(mapPx: number): number {
  return Math.max(0, mapPx - CONTROLS_MAP_PX)
}

/**
 * The most a Controls sheet rises under a drag on its grip (#696; record
 * 0146): where a dragged results sheet stops, the strip under the chip row.
 */
export function controlsFullPx(mapPx: number): number {
  return Math.max(0, mapPx - DRAGGED_MAP_PX)
}

/**
 * The player on a phone stands on the Analyze button rather than on the sheet
 * (#696): its bottom edge 8px above the button's top. Answered as the edge
 * `transportBottomPx` measures from, so the bar keeps one way of placing
 * itself.
 */
export function transportStandPx(fabBottom: number): number {
  return fabBottom + FAB_PX + FAB_GAP_PX - TRANSPORT_GAP_PX
}

/**
 * Whether the player fits on a phone's map above the button, under the rows
 * and one inset clear of them. A full sheet leaves the player its room while
 * it is on (`draggedMapFloorPx`); a sheet dragged high before the player came
 * on leaves none, and the bar then steps off until there is room again rather
 * than standing over the chips.
 */
export function transportFits(fabBottom: number, mapPx: number): boolean {
  const top = fabBottom + FAB_PX + FAB_GAP_PX + TRANSPORT_HEIGHT_PX
  return top <= mapPx - MAP_ROWS_PX - FAB_INSET_PX
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
