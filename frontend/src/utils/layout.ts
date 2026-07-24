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
  floorPx = 120,
): number {
  const ceil = Math.max(floorPx, viewportPx - mapMinPx - reservedPx)
  return Math.max(floorPx, Math.min(startHeight + dragUpPx, ceil))
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(value, hi))
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
    floorPx = 120,
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

// The table's drag handle when the chart is visible: a chart│table divider.
// Dragging up (`dragUpPx` > 0) grows the table by shrinking the chart, leaving
// the map untouched — the pair's sum is preserved. Both panels keep at least
// `floorPx`, so the divider stops when either hits its floor.
export function splitChartTable(
  chartStart: number,
  tableStart: number,
  dragUpPx: number,
  floorPx = 120,
): { chart: number; table: number } {
  const maxUp = Math.max(0, chartStart - floorPx) // chart shrinks no further than its floor
  const maxDown = Math.max(0, tableStart - floorPx) // table shrinks no further than its floor
  const d = clamp(dragUpPx, -maxDown, maxUp)
  return { chart: chartStart - d, table: tableStart + d }
}
