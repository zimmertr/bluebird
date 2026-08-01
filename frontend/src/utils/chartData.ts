import { DestinationResult, HourlySeries, SortBy } from '../types'
import { MetricFamily, metricLabel } from '../metrics'

export type ChartMetric = MetricFamily

const SERIES_FIELD: Record<ChartMetric, keyof HourlySeries> = {
  precip: 'precip_in',
  temp: 'temp_f',
  wind: 'wind_mph',
  aqi: 'aqi',
}

// The chart's radios. No aggregate: these plot the raw hourly series, so a
// point is that hour's own value rather than anything reduced over the window.
export const CHART_METRICS: { key: ChartMetric; label: string }[] = (
  ['precip', 'temp', 'wind', 'aqi'] as const
).map((key) => ({ key, label: metricLabel(key) }))

// The chart opens on whatever metric the results were ranked by.
export function metricForSort(sortBy: SortBy): ChartMetric {
  switch (sortBy) {
    case 'temp_avg_f':
      return 'temp'
    case 'wind_avg_mph':
      return 'wind'
    case 'aqi_avg':
      return 'aqi'
    default:
      return 'precip'
  }
}

// Coordinate-based identity (same rationale as fireProximity's fireKey): it
// survives the table's client-side re-sorting and keys a line to a destination.
export function chartKey(row: DestinationResult): string {
  return `${row.latitude},${row.longitude}`
}

// The inclusive run of rows between two chart keys in the given display order —
// for shift-click range selection. Order-agnostic (anchor may be above or below
// the target); empty if either key isn't in the list.
export function rowsBetween(
  ordered: DestinationResult[],
  anchorKey: string,
  targetKey: string,
): DestinationResult[] {
  const a = ordered.findIndex((r) => chartKey(r) === anchorKey)
  const b = ordered.findIndex((r) => chartKey(r) === targetKey)
  if (a === -1 || b === -1) return []
  const [lo, hi] = a < b ? [a, b] : [b, a]
  return ordered.slice(lo, hi + 1)
}

// Re-index a row's series onto the target grid by timestamp. Ranked rows share
// the grid already (no series_times) and return unchanged; a pinned row carries
// its own series_times and is remapped — grid hours the pin doesn't cover stay
// null (gaps), so a pin fetched for a different window can't show wrong-time data.
export function alignRowToGrid(row: DestinationResult, times: number[]): DestinationResult {
  const st = row.series_times
  if (!row.series || !st) return row
  const pos = new Map<number, number>()
  st.forEach((t, j) => {
    if (!pos.has(t)) pos.set(t, j)
  })
  const remap = (arr: (number | null)[]): (number | null)[] =>
    times.map((t) => {
      const j = pos.get(t)
      return j == null ? null : arr[j] ?? null
    })
  return {
    ...row,
    series: {
      precip_in: remap(row.series.precip_in),
      temp_f: remap(row.series.temp_f),
      wind_mph: remap(row.series.wind_mph),
      aqi: remap(row.series.aqi),
    },
  }
}

// Default chart selection when a report arrives: every chartable row, so the
// chart mirrors the whole table until the user prunes it. Returns null when any
// already-charted key is still present — re-analyses over the same area and
// row removals must never clobber deliberate unchecks.
export function defaultChartRows(
  results: DestinationResult[],
  everCharted: ReadonlySet<string>,
): DestinationResult[] | null {
  // Every chartable row this report has never charted before. It used to be
  // "chart everything, but only when nothing selected is still on screen",
  // which meant a report that ADDED rows to an existing one left the new ones
  // unchecked — tick Lakes alongside Peaks, re-analyze, and every lake arrived
  // off the chart because the peaks were still on it.
  //
  // Keyed on ever-charted rather than currently-selected so the fix does not
  // cost the other half: a box you deliberately unticked is a row that HAS
  // been charted, so it stays off, and re-analyzing never re-checks it.
  const rows = results.filter((r) => r.series && !everCharted.has(chartKey(r)))
  return rows.length > 0 ? rows : null
}

// Aggregate selection over the chartable rows for the header "select all" box:
// 'all' when every row is charted, 'none' when none are, 'some' otherwise (the
// checkbox's indeterminate dash). Empty input is 'none'. A click targets the
// opposite of 'all' — select everything unless everything's already selected.
export function selectionState(
  rows: DestinationResult[],
  isSelected: (row: DestinationResult) => boolean,
): 'all' | 'some' | 'none' {
  if (rows.length === 0) return 'none'
  let selected = 0
  for (const row of rows) if (isSelected(row)) selected++
  if (selected === 0) return 'none'
  if (selected === rows.length) return 'all'
  return 'some'
}

export function valueAt(row: DestinationResult, metric: ChartMetric, i: number): number | null {
  const arr = row.series ? row.series[SERIES_FIELD[metric]] : undefined
  const v = arr ? arr[i] : null
  return v == null ? null : v
}

export function formatMetricValue(v: number, metric: ChartMetric): string {
  if (metric === 'precip') return v.toFixed(3)
  if (metric === 'aqi') return v.toFixed(0)
  return v.toFixed(1)
}

// Above this span an axis tick names the date instead of the weekday. Two days
// is where a weekday stops identifying a day on its own: a 16-day range repeats
// every name, so "Mon 3 PM" appears twice with a week between them.
const AXIS_DATE_SPAN_MS = 48 * 3_600_000

/**
 * An x-axis tick, labelled for the span it sits in. `spanMs` is the whole grid's
 * extent, so every tick on one axis is formatted the same way.
 *
 * Both forms keep the hour. Dropping it on the long form reads as an improvement
 * — past two days the ticks land hours apart within a single date — but Recharts
 * thins ticks by measuring the labels it is given, so identical short strings all
 * fit and the axis renders "Jul 30" eight times in a row. Keeping the hour makes
 * every tick distinct and lets that thinning do its job.
 *
 * A calendar makes a 16-day range two clicks (#166), where it used to mean typing
 * two datetimes, so the long-span case went from rare to ordinary.
 */
export function axisTimeLabel(t: number, spanMs: number): string {
  return spanMs > AXIS_DATE_SPAN_MS
    ? new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric' })
    : new Date(t).toLocaleString([], { weekday: 'short', hour: 'numeric' })
}

/**
 * Where "now" falls on the chart's grid, or null when it falls outside it.
 *
 * The forecast endpoint serves history as well as forecast, so a window can span
 * the boundary and the chart is then plotting two different kinds of number:
 * what happened on the left, what is expected on the right. Marking the seam is
 * the only way that reads. Null for a grid entirely on one side, and for a
 * one-stamp point sample, where a line through the single dot says nothing.
 */
export function nowWithinGrid(times: number[], nowMs: number): number | null {
  if (times.length < 2) return null
  return nowMs >= times[0] && nowMs <= times[times.length - 1] ? nowMs : null
}

// Points on screen — lines charted x hours in the window — above which the chart
// stops following the cursor. Both variables matter and they multiply, because the
// work is per line per point: hovering only changes stroke widths, opacities and
// the tooltip's row order, but it does so through React state, so Recharts rebuilds
// every line's `d` attribute from all of its points to repaint a cosmetic
// difference.
//
// Calibrated by the maintainer against the running app, holding destinations at 25
// and varying the window so the count moved along one axis:
//
//   15,600 points  satisfactory
//   21,000         satisfactory
//   26,400         starting to degrade
//   44,160         (20 destinations x 92 days) the point needing a limit
//
// Shape independence checked separately: 19,200 points as 100 lines x 8 days, as
// 50 x 16, and as 20 x 40 all read the same, so the product is the right variable
// rather than either term alone. 25,000 is the cap: the last count that read as
// satisfactory was 21,000 and the next one read as degrading, so the line goes
// between them rather than above both.
//
// Re-derive by sweeping one axis again; a subjective read is the right instrument
// here, since the failure is "the chart lags the pointer" rather than a number.
const CURSOR_POINT_BUDGET = 25_000

/**
 * Should the chart follow the cursor — emphasizing the nearest line, dimming the
 * others, and ordering the tooltip by nearness?
 *
 * Only while it is affordable. Counted on hours rather than days so a narrowed
 * window is charged for what it actually draws, and on lines *charted* rather
 * than destinations analyzed, so unchecking rows in the table brings the
 * emphasis back. The tooltip itself is unaffected either way: Recharts tracks
 * the cursor for that on its own.
 */
export function tracksCursor(timestampCount: number, lineCount: number): boolean {
  return timestampCount * lineCount <= CURSOR_POINT_BUDGET
}

export type ChartPoint = { t: number } & Record<string, number | null>

// One object per timestamp — { t, [destKey]: value|null, … } — the shape
// Recharts consumes, with a line per selected destination keyed by chartKey.
// Nulls pass through so the line breaks at gaps (connectNulls={false}).
export function buildChartData(
  times: number[],
  rows: DestinationResult[],
  metric: ChartMetric,
): ChartPoint[] {
  return times.map((t, i) => {
    const point: ChartPoint = { t }
    for (const row of rows) point[chartKey(row)] = valueAt(row, metric, i)
    return point
  })
}

// Y range across the selected set. Magnitudes (precip/wind/AQI) floor at 0 so
// heights compare honestly; temperature floats to its own min. A small top pad
// keeps the tallest line off the frame. The same [min,max] drives the hover
// pixel→value inversion, so the focus math matches the rendered axis exactly.
export function computeYDomain(
  rows: DestinationResult[],
  metric: ChartMetric,
): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const row of rows) {
    const arr = row.series ? row.series[SERIES_FIELD[metric]] : undefined
    if (!arr) continue
    for (const v of arr) {
      if (v == null) continue
      if (v < min) min = v
      if (v > max) max = v
    }
  }
  if (!isFinite(min) || !isFinite(max)) return [0, 1]
  const floor = metric === 'temp' ? min : Math.min(0, min)
  if (min === max) {
    const lo = floor === max ? (metric === 'temp' ? floor - 1 : 0) : floor
    return [lo, max + 1]
  }
  return [floor, max + (max - floor) * 0.05]
}

// Map a pixel Y within the plot area to a data value (top = yMax, bottom = yMin).
export function pixelToValue(
  y: number,
  plotTop: number,
  plotHeight: number,
  yMin: number,
  yMax: number,
): number {
  if (plotHeight <= 0) return yMax
  const frac = Math.max(0, Math.min(1, (y - plotTop) / plotHeight))
  return yMax - frac * (yMax - yMin)
}

// The key of the line closest (in value) to the cursor at a given time; nulls
// are skipped. Null when no line has a value there. Drives both the popped line
// and the bold tooltip entry from one computation.
export function nearestKey(
  valuesByKey: Record<string, number | null>,
  cursorValue: number,
): string | null {
  let best: string | null = null
  let bestDist = Infinity
  for (const key of Object.keys(valuesByKey)) {
    const v = valuesByKey[key]
    if (v == null) continue
    const d = Math.abs(v - cursorValue)
    if (d < bestDist) {
      bestDist = d
      best = key
    }
  }
  return best
}


// ── Tooltip capacity ───────────────────────────────────────────────────────
// The hover card is drawn inside the plotting area, so how many series it can
// list is bounded by that area's height rather than by a constant. At the
// chart panel's floor an eight-row card is taller than the chart itself and
// hangs over the results table below it.
//
// The two measurements are of the rendered card: a row is the 12px control
// step on its default line box, and the chrome is the card's vertical padding
// plus the timestamp line above the rows and the "+N more" line below them.
// Both are deliberately slight over-estimates, so the cap errs toward one row
// fewer rather than one row of overhang.
export const TOOLTIP_ROW_PX = 18
export const TOOLTIP_CHROME_PX = 46

// Eight is where the card stops being scannable, so height can only ever
// lower it. One is the floor: a tooltip listing nothing is worse than a
// tooltip that overhangs, and "+N more" still says what is missing.
export const TOOLTIP_MAX_ROWS = 8
export const TOOLTIP_MIN_ROWS = 1

export function tooltipCapacity(plotHeightPx: number): number {
  const fits = Math.floor((plotHeightPx - TOOLTIP_CHROME_PX) / TOOLTIP_ROW_PX)
  return Math.max(TOOLTIP_MIN_ROWS, Math.min(TOOLTIP_MAX_ROWS, fits))
}
