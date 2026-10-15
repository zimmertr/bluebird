// Where a press on the results chart lands in its data (#336, #696; record
// 0144): which hour of the grid and what value on the y axis. A mouse is read
// by Recharts from its own hover state; a finger sends no hover, so the chart
// reads the finger's pixel itself and hands Recharts the hour to show. Both
// routes, and the click that moves the map's playhead, invert the same plot
// band through the same numbers, which is why the band's geometry lives here
// rather than in the component that draws it.

import { pixelToTime, pixelToValue } from './chartData'
import { nearestIndex } from './timeline'

/**
 * The chart's margins, x-axis strip and y-axis strip, which the component
 * hands Recharts and which place the plotting band inside the chart's box.
 * Explicit so a pixel can be inverted to a data value at all.
 */
export const PLOT_MARGIN = { top: 8, right: 16, bottom: 2, left: 8 } as const
export const X_AXIS_HEIGHT_PX = 22
export const Y_AXIS_WIDTH_PX = 44

/**
 * The height of a phone chart's title line (#696; `CHART_TITLE` in
 * styles.ts): the metric's name, which is its picker, a 16px line of the
 * control type and 2px either side. A phone's plot is inset from the top by
 * it on top of `PLOT_MARGIN.top` (`TITLED_PLOT_MARGIN`), so the plotted area,
 * the dashed Now and model-end lines, their labels and the y axis's top tick
 * all begin under the title rather than under its letters: the maintainer's
 * one requirement for moving the picker into the plot (2026-10-14).
 */
export const CHART_TITLE_PX = 20

/** A phone chart's margins: `PLOT_MARGIN` with the title's line over it. */
export const TITLED_PLOT_MARGIN = { ...PLOT_MARGIN, top: PLOT_MARGIN.top + CHART_TITLE_PX } as const

export type PlotMargin = typeof PLOT_MARGIN | typeof TITLED_PLOT_MARGIN

/** The plotting band inside a chart box of this size, in the box's own pixels. */
export function plotBand(
  width: number,
  height: number,
  margin: PlotMargin = PLOT_MARGIN,
): { left: number; top: number; width: number; height: number } {
  const left = margin.left + Y_AXIS_WIDTH_PX
  const top = margin.top
  return {
    left,
    top,
    width: width - left - margin.right,
    height: height - top - margin.bottom - X_AXIS_HEIGHT_PX,
  }
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
): { index: number; value: number } | null {
  const index = hourIndexAt(x, box.width, times)
  const band = plotBand(box.width, box.height, margin)
  if (index === null || band.height <= 0) return null
  return { index, value: pixelToValue(y, band.top, band.height, yMin, yMax) }
}
