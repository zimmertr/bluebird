import type { ResultsMode } from './viewPrefs'
import { clamp } from './numbers'

// One of the two panels on its own, which is what Both falls back to where it
// does not fit.
export type SinglePanel = Exclude<ResultsMode, 'both'>

/**
 * The shortest a results panel stands, chart or table: under it the plot or
 * the rows stop being usable.
 */
export const PANEL_FLOOR_PX = 120

// Height a resizable bottom panel (the results table or the comparison chart)
// should settle at after a vertical drag. Two clamps apply: the panel stays at
// least `floorPx` tall to remain usable, and the map above it keeps at least
// `mapMinPx`. The map floor matters because its legend is bottom-anchored and
// would ride up over the top-anchored search box if the map got too short.
// `reservedPx` is the height already taken below the map by the sibling panel
// and any preview banner, so the two panels together can't crowd the map out.
// `dragUpPx` is the drag distance with up positive (drag the handle up to grow).
export function clampPanelHeight(
  startHeight: number,
  dragUpPx: number,
  reservedPx: number,
  viewportPx: number,
  mapMinPx = 280,
  floorPx = PANEL_FLOOR_PX,
): number {
  const ceil = Math.max(floorPx, viewportPx - mapMinPx - reservedPx)
  return clamp(startHeight + dragUpPx, floorPx, ceil)
}

// Resolve the *applied* heights of the stacked chart and table panels from their
// desired (state) heights. `availPx` is the height below the map that the two
// panels share (viewport minus any preview banner); the map takes the rest and
// must keep at least `mapMinPx` so its bottom-anchored legends never ride up over
// the top-anchored search box and controls.
//
// Chart-priority: the chart keeps its requested height (bounded so the map floor
// and a floor-height table still fit) and the table gets whatever room is left
// above the map floor. This is what makes *enabling* the chart immediately shrink
// an over-tall table instead of pushing the map's legends off-screen — the clamp
// runs every render, not only during a drag.
export function resolvePanelHeights(
  chartHeight: number,
  tableHeight: number,
  {
    chartShown,
    tableShown,
    availPx,
    mapMinPx = 280,
    floorPx = PANEL_FLOOR_PX,
  }: {
    chartShown: boolean
    tableShown: boolean
    availPx: number
    mapMinPx?: number
    floorPx?: number
  },
): { chart: number; table: number } {
  // Whichever panel isn't rendered contributes no height, so the other gets the
  // full band above the map floor.
  if (!chartShown && !tableShown) return { chart: 0, table: 0 }
  if (!chartShown) {
    return { chart: 0, table: clamp(tableHeight, floorPx, Math.max(floorPx, availPx - mapMinPx)) }
  }
  if (!tableShown) {
    return { chart: clamp(chartHeight, floorPx, Math.max(floorPx, availPx - mapMinPx)), table: 0 }
  }
  const chart = clamp(chartHeight, floorPx, Math.max(floorPx, availPx - mapMinPx - floorPx))
  const table = clamp(tableHeight, floorPx, Math.max(floorPx, availPx - mapMinPx - chart))
  return { chart, table }
}

// Whether Both mode has room for two panels the reader can still trade against
// each other, rather than two pinned at their floor under grips that move
// nothing (#430).
//
// `resolvePanelHeights` above caps the chart at `availPx - mapMinPx - floorPx`,
// so once the band above the map floor is down to two floors both panels sit at
// `floorPx`: the divider preserves the pair's sum and has nothing to give, and
// the chart's own ceiling is already its floor. Hence the strict comparison —
// exactly two floors is the first inert case, not the last usable one.
//
// `mapMinPx` is the floor a DRAG may go to, not the resting one. A phone rests
// its panels above the whole legend stack, and both of them sitting at their
// floor there is a layout a grip can still open up, which is the difference
// between constrained and broken.
export function bothFits(
  availPx: number,
  { mapMinPx = 280, floorPx = PANEL_FLOOR_PX }: { mapMinPx?: number; floorPx?: number } = {},
): boolean {
  return availPx - mapMinPx > 2 * floorPx
}

// Whether the first report should widen a desk's results from Table to Both
// (#687). Only where Both, at its opening heights, leaves the table more than
// its floor: under that the chart takes its share and the table opens pinned
// at `floorPx`, three rows under a short map, and the one panel the reader
// came for is the one squeezed. It extends the phone's fallback to one panel
// (#430, record 0034) to a desk whose column is short, and like that fallback
// it decides only the opening: a reader who presses Both gets it.
//
// The heights are `resolvePanelHeights`' own answer rather than a measured
// window height, so the line moves with the panel defaults and the map floor:
// at today's 220px panels and docked floor it falls at a column of 790px,
// which takes 1024x768 to Table and leaves 1280x800 on Both.
export function bothOpensWithRoom(
  availPx: number,
  panelPx: number,
  mapMinPx: number,
  floorPx = PANEL_FLOOR_PX,
): boolean {
  const { table } = resolvePanelHeights(panelPx, panelPx, {
    chartShown: true,
    tableShown: true,
    availPx,
    mapMinPx,
    floorPx,
  })
  return table > floorPx
}

/** The single panel a mode names, or null for Both and for no answer at all. */
export function panelOf(mode: ResultsMode | null): SinglePanel | null {
  return mode === 'chart' || mode === 'table' ? mode : null
}

// The mode the results area draws, which is the reader's preference wherever it
// fits. Under `bothFits` they get ONE panel with a working grip instead of two
// inert ones, and it is the panel they last chose: a stored Both says which
// panels they want, never which of them they would keep.
//
// The preference itself is left alone, because the constraint belongs to the
// viewport rather than to the reader — a window that grows gives Both back with
// no press, and a rotation does not cost them a setting. Table is the answer for
// a reader who has only ever chosen Both, being the mode everyone opens on.
export function resolveResultsMode(
  chosen: ResultsMode,
  lastPanel: SinglePanel | null,
  fits: boolean,
): ResultsMode {
  if (chosen !== 'both' || fits) return chosen
  return lastPanel ?? 'table'
}

// The mode a phone sheet draws while it holds only rows nobody has forecast
// yet (#696): the table alone, whatever the reader's saved mode says. A chart
// with no report has nothing to plot, and on a phone its empty frame took most
// of the sheet a searched place had just opened, under a single row of dashes.
//
// Like the fit above, it leaves the preference alone, so the saved mode comes
// back with the first report. A press made while the hold stands is the reader
// answering it, so it wins: a segment that does nothing when pressed reads as
// broken (the #242 review's lesson). A desktop is never held, because the
// results are docked beside the map there and an empty chart covers nothing.
export function heldResultsMode(
  mode: ResultsMode,
  { pendingOnly, pressed, isDesktop }: { pendingOnly: boolean; pressed: boolean; isDesktop: boolean },
): ResultsMode {
  return pendingOnly && !pressed && !isDesktop ? 'table' : mode
}

// The table's drag handle when the chart is visible: a chart│table divider.
// Dragging up (`dragUpPx` > 0) grows the table by shrinking the chart, leaving
// the map untouched — the pair's sum is preserved. Both panels keep at least
// `floorPx`, so the divider stops when either hits its floor.
export function splitChartTable(
  chartStart: number,
  tableStart: number,
  dragUpPx: number,
  floorPx = PANEL_FLOOR_PX,
): { chart: number; table: number } {
  const maxUp = Math.max(0, chartStart - floorPx) // chart shrinks no further than its floor
  const maxDown = Math.max(0, tableStart - floorPx) // table shrinks no further than its floor
  const d = clamp(dragUpPx, -maxDown, maxUp)
  return { chart: chartStart - d, table: tableStart + d }
}
