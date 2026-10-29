// Where a press on the results chart lands in its data (#336, #696; record
// 0144): which hour of the grid and what value on the y axis. A mouse is read
// by Recharts from its own hover state; a finger sends no hover, so the chart
// reads the finger's pixel itself and hands Recharts the hour to show. Both
// routes, and the click that moves the map's playhead, invert the same plot
// band through the same numbers, which is why the band's geometry lives here
// rather than in the component that draws it.

import { pixelToTime, pixelToValue, TOOLTIP_CHROME_PX, TOOLTIP_ROW_PX, tooltipCapacity } from './chartData'
import { nearestIndex } from '../timeline'
import { clamp } from '../numbers'

/**
 * The chart's margins, x-axis strip and y-axis strip, which the component
 * hands Recharts and which place the plotting band inside the chart's box.
 * Explicit so a pixel can be inverted to a data value at all.
 */
export const PLOT_MARGIN = { top: 8, right: 16, bottom: 2, left: 8 } as const
export const X_AXIS_HEIGHT_PX = 22
export const Y_AXIS_WIDTH_PX = 44

/**
 * The height of a phone chart's title (#696; `CHART_TITLE` in styles.ts):
 * the metric's picker, the app's select at 28px, a 16px line of the control
 * type inside a 1px edge and 5px either side. A phone's plot is inset from the top by
 * it and the room around it (`TITLED_PLOT_MARGIN`), so the plotted area,
 * the dashed Now and model-end lines, their labels and the y axis's top tick
 * all begin under the title rather than under its letters: the maintainer's
 * one requirement for moving the picker into the plot (2026-10-14).
 */
export const CHART_TITLE_PX = 28

/**
 * The room around a phone chart's title (#696; the maintainer on the Pixel,
 * 2026-10-14): the same 12px above it, under the grip's rule, and below it,
 * over the y axis's top label, and on its left, where the results bar's own
 * inset (`px-3`) puts "Lowest" and the view buttons, so the three stand on
 * one edge. The box sat on the rule and 8px from the sheet's edge before.
 */
export const CHART_TITLE_INSET_PX = 12

/**
 * How far the y axis's top label rises above the plotting band it labels:
 * about half its line at the chart's 11px (`CHART_TICK_PX`): 5.1px, measured
 * in the Playwright image's Chromium 2026-10-14. `PLOT_MARGIN.top`'s 8px is
 * this plus 3px of air for a plot with nothing over it; a titled plot spends
 * the air on the inset instead, so the gap under the title is the inset.
 */
export const TOP_LABEL_RISE_PX = 5

/** A phone chart's margins: `PLOT_MARGIN` with the title's box and its room over it. */
export const TITLED_PLOT_MARGIN = {
  ...PLOT_MARGIN,
  top: CHART_TITLE_INSET_PX + CHART_TITLE_PX + CHART_TITLE_INSET_PX + TOP_LABEL_RISE_PX,
} as const

export type PlotMargin = typeof PLOT_MARGIN | typeof TITLED_PLOT_MARGIN

/**
 * The x axis strip a panel draws under its plot (#499). Two stacked panels
 * share one time axis, and only the bottom one prints it: the top one's strip
 * is zero tall, so its band runs down to its box's foot. Both keep the same
 * left and right edges, which is what lines their hours up.
 */
export function xAxisPx(drawsAxis: boolean): number {
  return drawsAxis ? X_AXIS_HEIGHT_PX : 0
}

/**
 * The least plotting band a stacked panel may be dragged down to (#499): two
 * of the y axis's 11px tick labels with room between them, so a panel the
 * grip squeezes still reads as a scale rather than a smudge. Below it the
 * axis prints one tick or overlaps two.
 */
export const MIN_PANEL_BAND_PX = 40

/** The least box a stacked panel may have: its margins, its axis strip if any, and the least band. */
export function panelFloorPx(margin: PlotMargin, drawsAxis: boolean): number {
  return margin.top + margin.bottom + xAxisPx(drawsAxis) + MIN_PANEL_BAND_PX
}

/** The plotting band inside a chart box of this size, in the box's own pixels. */
export function plotBand(
  width: number,
  height: number,
  margin: PlotMargin = PLOT_MARGIN,
  drawsAxis = true,
): { left: number; top: number; width: number; height: number } {
  const left = margin.left + Y_AXIS_WIDTH_PX
  const top = margin.top
  return {
    left,
    top,
    width: width - left - margin.right,
    height: height - top - margin.bottom - xAxisPx(drawsAxis),
  }
}

/**
 * Where the split between two stacked panels lands after a drag (#499): the
 * top panel's share of `totalPx`, held so each panel keeps its floor. The
 * share rather than pixels, so a sheet that grows keeps the split the reader
 * set. A box too short for both floors splits evenly.
 */
export function splitAfterDrag(
  startShare: number,
  dragUpPx: number,
  totalPx: number,
  topFloorPx: number,
  bottomFloorPx: number,
): number {
  if (totalPx <= 0 || topFloorPx + bottomFloorPx > totalPx) return 0.5
  const topPx = startShare * totalPx - dragUpPx
  const held = clamp(topPx, topFloorPx, totalPx - bottomFloorPx)
  return held / totalPx
}

/**
 * How far below the top of the sheet a phone's readout may start (#696): the
 * sheet's own edge and the rule along it stay clear, so the card reads as
 * standing in the sheet rather than cut by it.
 */
export const READOUT_ROOM_GAP_PX = 8

/**
 * Where a phone chart's readout stands, and how many lines it lists (#696).
 * The card is drawn inside the plotting band, which at a phone sheet's rest
 * height is about 68px against a card of 129px for five lines (measured at
 * 390x844, 2026-10-14), so the band clipped it to its top four rows. A card
 * the band holds stays where Recharts puts it, by the reading; one it cannot
 * hold stands at the top of the room above the band instead, the sheet's own
 * height above the chart (`roomAbovePx`, from the chart box's top up to the
 * sheet's less `READOUT_ROOM_GAP_PX`), over the results bar and the picker,
 * and runs down from there. How many lines it lists is that whole room's
 * capacity, so the card it decides on always fits the room. `top` is in the
 * chart box's own pixels, negative above it, or null for Recharts' own place.
 */
export function readoutPlace(
  boxHeight: number,
  margin: PlotMargin,
  roomAbovePx: number,
  lineCount: number,
  drawsAxis = true,
): { rows: number; top: number | null } {
  const band = plotBand(0, boxHeight, margin, drawsAxis)
  const bandBottom = band.top + band.height
  const rows = tooltipCapacity(roomAbovePx + bandBottom)
  const listed = Math.min(rows, lineCount)
  const cardPx = TOOLTIP_CHROME_PX + listed * TOOLTIP_ROW_PX
  // With no room above there is nowhere to rise to, however tall the card.
  return { rows, top: cardPx <= band.height || roomAbovePx <= 0 ? null : -roomAbovePx }
}

/**
 * The hour of the grid under a pixel `x` from the chart box's left edge: the
 * one a hover at that pixel names, snapped to the nearest stamp. Null for an
 * empty grid or a box too narrow to hold a band. A pixel outside the band
 * reads its nearer end, so a finger that slides off the plot keeps the last
 * hour rather than losing the reading.
 */
export function hourIndexAt(x: number, boxWidth: number, times: readonly number[]): number | null {
  if (times.length === 0) return null
  const band = plotBand(boxWidth, 0)
  if (band.width <= 0) return null
  return nearestIndex(times, pixelToTime(x, band.left, band.width, times[0], times[times.length - 1]))
}

/**
 * What a finger at (`x`, `y`) in a chart box of this size reads: the hour's
 * index and the y axis value at its height, which picks the nearest line the
 * way the mouse's cursor does. Null where there is no hour or no band to read.
 */
export function fingerReading(
  x: number,
  y: number,
  box: { width: number; height: number },
  times: readonly number[],
  yMin: number,
  yMax: number,
  margin: PlotMargin = PLOT_MARGIN,
  drawsAxis = true,
): { index: number; value: number } | null {
  const index = hourIndexAt(x, box.width, times)
  const band = plotBand(box.width, box.height, margin, drawsAxis)
  if (index === null || band.height <= 0) return null
  return { index, value: pixelToValue(y, band.top, band.height, yMin, yMax) }
}

/**
 * The widest x axis tick the chart prints, `Sep 18, 11 PM` at the axis's
 * 11px: 73.4px, measured 2026-10-29 in the Playwright image's Chromium on the
 * app's default sans stack (`Dec 30, 12 AM` 73.2, `Wed 11 PM` 55.8). Rounded
 * up to 74.
 */
export const WIDEST_X_TICK_PX = 74

/**
 * The least band WIDTH a grid panel may be drawn at (#499): two of the widest
 * ticks and 8px between them, so a squeezed panel still prints its time axis
 * as two ticks on one line each. At 40px, the height's floor, a 110px panel
 * printed one tick wrapped onto two lines and its extreme label sat on the
 * lines (the review screenshots, 2026-10-29). The height floor stays
 * `MIN_PANEL_BAND_PX`.
 */
export const MIN_PANEL_BAND_WIDTH_PX = 2 * WIDEST_X_TICK_PX + 8

/**
 * The least width a grid panel may have before it is not drawn (#499): its
 * margins, the y axis strip and the least band width.
 */
export function panelWidthFloorPx(margin: PlotMargin): number {
  return margin.left + Y_AXIS_WIDTH_PX + margin.right + MIN_PANEL_BAND_WIDTH_PX
}

/** How far the hover card stands off the cursor, Recharts' own default offset. */
export const CARD_CURSOR_OFFSET_PX = 10

/**
 * Where the hover card stands inside the chart area when there is more than
 * one panel (#499): its top left, in the area's own pixels, from the cursor
 * point and the card's measured size. Below and right of the cursor as
 * Recharts puts it, flipped to the cursor's left when it would run past the
 * area's right edge, pulled up when it would run past the bottom, and never
 * past the area's left or top edge. One panel keeps Recharts' own placement
 * inside its plot.
 */
export function cardPlacement(
  cursor: { x: number; y: number },
  card: { w: number; h: number },
  area: { w: number; h: number },
  offset = CARD_CURSOR_OFFSET_PX,
): { x: number; y: number } {
  let x = cursor.x + offset
  if (x + card.w > area.w) x = cursor.x - offset - card.w
  x = clamp(x, 0, Math.max(0, area.w - card.w))
  let y = cursor.y + offset
  if (y + card.h > area.h) y = area.h - card.h
  y = Math.max(0, y)
  return { x, y }
}

/** Where a grid's column and row splits stand: each the first track's share, 0 to 1. */
export interface GridShares {
  x: number
  y: number
}

/** A grid split evenly, which a double press on the crossing puts back. */
export const EVEN_GRID: GridShares = { x: 0.5, y: 0.5 }

/**
 * Where the grid's two splits land after a gutter is dragged (#499): the
 * drag in pixels, right and down positive, over the tracks' total width and
 * height less the gutters. Each split is held to [0, 1] and no floor, so the
 * crossing can be dragged into a corner and one panel take the whole area; a
 * panel under its floor is simply not drawn.
 */
export function gridAfterDrag(start: GridShares, dx: number, dy: number, totalW: number, totalH: number): GridShares {
  return {
    x: totalW > 0 ? clamp(start.x + dx / totalW, 0, 1) : start.x,
    y: totalH > 0 ? clamp(start.y + dy / totalH, 0, 1) : start.y,
  }
}
