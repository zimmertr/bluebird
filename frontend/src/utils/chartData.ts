import { DestinationResult, HourlySeries, SortBy } from '../types'
import {
  MetricFamily,
  SnapshotFamily,
  familyOf,
  formatPrecipRate,
  isSnapshotFamily,
  metricLabel,
} from '../metrics'
import { setKey } from './points'

/**
 * The families this chart can plot: every one that is an hourly series.
 *
 * A snapshot family is excluded by construction rather than by a check at each
 * call site (#449). Snow depth is one number for today, so there is nothing to
 * draw across an axis of hours, and `SERIES_FIELD` below would have no field
 * to name for it — which is what makes this a type error rather than an empty
 * line on screen.
 */
export type ChartMetric = Exclude<MetricFamily, SnapshotFamily>

export const SERIES_FIELD: Record<ChartMetric, keyof HourlySeries> = {
  precip: 'precip_in',
  temp: 'temp_f',
  wind: 'wind_mph',
  freeze: 'freeze_ft',
  aqi: 'aqi',
  cloud_base: 'cloud_base_ft',
  cloud_cover: 'cloud_cover_pct',
}

// The chart's metric select, in option order. No aggregate: these plot the raw
// hourly series, so a point is that hour's own value rather than anything
// reduced over the window. The two cloud metrics come last (#117): they are
// the two a report carries only when it was asked for them, so an option that
// can draw nothing sits under every option that always draws.
export const CHART_METRICS: { key: ChartMetric; label: string }[] = (
  ['precip', 'temp', 'wind', 'freeze', 'aqi', 'cloud_base', 'cloud_cover'] as const
).map((key) => ({ key, label: metricLabel(key) }))

/** Whichever metric the chart opens on when the ranking names none it can draw. */
const FIRST_CHART_METRIC = CHART_METRICS[0].key

// The chart opens on whatever metric the results were ranked by.
//
// Read off the ranking key's own family rather than matched against a list of
// keys: since #291 a family has three or four rankable keys, and a list
// naming one of them each opened the precipitation chart for the other two.
export function metricForSort(sortBy: SortBy, current?: ChartMetric | null): ChartMetric {
  const family = familyOf(sortBy)
  // A snapshot ranking leaves the chart where it is (#449): it has no hourly
  // series, so following it would mean clearing the chart to say something the
  // table already says. `current` is what the reader last had on screen, and
  // the first metric is the answer before they have had one.
  if (isSnapshotFamily(family)) return current ?? FIRST_CHART_METRIC
  return family
}

// Coordinate-based identity: it survives the table's client-side re-sorting and
// keys a line to a destination.
//
// Deliberately NOT `geoKey`, which every other coordinate identity in the app
// is. This one keys what the reader picked — a colour, a ticked box, a compared
// model's row group — and two destinations a metre apart are two of those.
// points.ts carries the full reasoning.
export function chartKey(row: DestinationResult): string {
  return `${row.latitude},${row.longitude}`
}

// Identity of the SET of destinations the chart tracks, order-independent.
//
// useChartSelection's debut effect keys on this string, never on the array that
// holds the rows. `chartCandidates` in App.tsx is a fresh array whenever the
// displayed rows or the pending list are re-derived, which is once per keystroke
// in the coordinates box and once per live knob change, so an effect keyed on
// the reference scanned for debuts over a set that had not changed at all.
export function candidateSetKey(rows: DestinationResult[]): string {
  return setKey(rows, chartKey)
}

// The rows the chart has never seen, in list order and at most one per
// coordinate key. `charted` is the "ever charted" memory (useChartSelection's
// colorByKey): a key in it already owns a color, so it never debuts twice, and a
// box the user unchecked is never re-checked by a later report.
//
// Pure and separate from the hook because the node-env Vitest has no DOM to
// render a hook in, so a decision left inside one is untestable by construction.
export function debutRows(
  rows: DestinationResult[],
  charted: Record<string, string>,
): DestinationResult[] {
  const seen = new Set<string>()
  return rows.filter((r) => {
    const key = chartKey(r)
    if (charted[key] || seen.has(key)) return false
    seen.add(key)
    return true
  })
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

/**
 * A function re-indexing any array from one timestamp grid onto another.
 *
 * The position map is built once and closed over, because every caller remaps
 * three or four arrays that share a grid: rebuilding it per array would be the
 * same map four times. Hours the source does not cover come back null, which is
 * what keeps a series fetched for a different window from showing wrong-time
 * data — the chart breaks its line at a null rather than bridging it.
 */
export function gridRemapper(
  from: readonly number[],
  to: readonly number[],
): (values: readonly (number | null)[]) => (number | null)[] {
  const pos = new Map<number, number>()
  from.forEach((t, j) => {
    if (!pos.has(t)) pos.set(t, j)
  })
  return (values) =>
    to.map((t) => {
      const j = pos.get(t)
      return j == null ? null : values[j] ?? null
    })
}

// Re-index a row's series onto the target grid by timestamp. Ranked rows share
// the grid already (no series_times) and return unchanged; a pinned row carries
// its own series_times and is remapped — grid hours the pin doesn't cover stay
// null (gaps), so a pin fetched for a different window can't show wrong-time data.
export function alignRowToGrid(row: DestinationResult, times: number[]): DestinationResult {
  const st = row.series_times
  if (!row.series || !st) return row
  const remap = gridRemapper(st, times)
  return {
    ...row,
    series: {
      precip_in: remap(row.series.precip_in),
      temp_f: remap(row.series.temp_f),
      wind_mph: remap(row.series.wind_mph),
      freeze_ft: remap(row.series.freeze_ft),
      aqi: remap(row.series.aqi),
      // Present only on a report that fetched the cloud column (#117), and
      // spread for the reason the bearings below are.
      ...(row.series.cloud_base_ft ? { cloud_base_ft: remap(row.series.cloud_base_ft) } : {}),
      ...(row.series.cloud_cover_pct
        ? { cloud_cover_pct: remap(row.series.cloud_cover_pct) }
        : {}),
      // Remapped rather than dropped, and spread so a row that never carried
      // bearings still carries no key. The chart does not read them, but the
      // forecast grid aligns its cells through here (#246) and a silently
      // dropped series would take that layer's wind arrows with it.
      ...(row.series.wind_dir_deg ? { wind_dir_deg: remap(row.series.wind_dir_deg) } : {}),
    },
  }
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

/**
 * Anything the chart can read an hourly value out of.
 *
 * A destination row is one. So is a compared model's line (#232), which is the
 * reason this is a shape rather than `DestinationResult`: on a one-destination
 * chart a line is a model rather than a place, and neither the reader of a
 * value nor the y-axis has any business knowing which it has.
 */
export interface SeriesHolder {
  series?: HourlySeries | null
}

/**
 * One plotted line: what identifies it, what it is called, what colour it
 * draws in, and its values on the chart's grid.
 *
 * The key is the Recharts `dataKey`, so it has to be unique across everything
 * on the chart at once — a destination keys by coordinate (`chartKey`), a
 * (destination, model) pair by a prefixed pair id, and the two namespaces
 * cannot collide.
 */
export interface ChartLine extends SeriesHolder {
  key: string
  label: string
  /**
   * Every line is solid and colour is the only channel it carries, so every
   * line has one no other line is wearing. With no comparison up that is the
   * destination's colour; under one the ranking model's lines keep it and
   * every other (destination, model) pair takes its own from the session
   * allocator (`allocateColors` in `chartColors.ts`).
   */
  color: string
}

/**
 * One entry's name while a comparison is up: `1. Mount Rainier (NOAA GFS)`.
 *
 * Rank, destination, model, in that order, for EVERY line the chart draws —
 * the ranking model's own included. A key that named the destination on one
 * line and the model on the next was the #232 review's second finding: two
 * entries a reader has to hold different things in mind to tell apart are not
 * a comparison. The rank leads because it is what the table's first column
 * says, so a line can be found in the ranking without reading the name twice.
 *
 * Composed here rather than in the hook or the chart so the tooltip, the lines
 * and anything later cannot spell it three ways.
 */
export function comparedLineLabel(rank: number, name: string, modelLabel: string): string {
  return `${rank}. ${name} (${modelLabel})`
}

export function valueAt(row: SeriesHolder, metric: ChartMetric, i: number): number | null {
  const arr = row.series ? row.series[SERIES_FIELD[metric]] : undefined
  const v = arr ? arr[i] : null
  return v == null ? null : v
}

/**
 * The same series with every hour after `endMs` dropped.
 *
 * What a model comparison's clamp is made of (#232): the lines have to stop
 * together or their shapes are not answers to one question. Null rather than a
 * shorter array, so every line stays index-aligned to the chart's grid and the
 * x-axis keeps its full extent — the empty stretch on the right IS the statement
 * that the comparison stops there.
 */
export function cutSeriesAfter(
  times: readonly number[],
  series: HourlySeries | null | undefined,
  endMs: number | null,
): HourlySeries | null {
  if (!series) return null
  if (endMs === null || times.length === 0 || times[times.length - 1] <= endMs) {
    return series
  }
  const keep = (values: readonly (number | null)[]): (number | null)[] =>
    times.map((t, i) => (t > endMs ? null : values[i] ?? null))
  return {
    precip_in: keep(series.precip_in),
    temp_f: keep(series.temp_f),
    wind_mph: keep(series.wind_mph),
    freeze_ft: keep(series.freeze_ft),
    aqi: keep(series.aqi),
    ...(series.cloud_base_ft ? { cloud_base_ft: keep(series.cloud_base_ft) } : {}),
    ...(series.cloud_cover_pct ? { cloud_cover_pct: keep(series.cloud_cover_pct) } : {}),
    ...(series.wind_dir_deg ? { wind_dir_deg: keep(series.wind_dir_deg) } : {}),
  }
}

/**
 * One plotted hour, as the tooltip prints it.
 *
 * A point on this chart is a single hour's value, which is the number the
 * table's per-hour columns are the average, floor and peak OF — so the digits
 * come from the shared formatter rather than from a count spelled here (#395).
 * The tooltip and the cell beside it are read in the same glance.
 */
export function formatMetricValue(v: number, metric: ChartMetric): string {
  if (metric === 'precip') return formatPrecipRate(v)
  // Whole units: an AQI is an integer index, and a freezing level or a cloud
  // base in feet, or a cloud cover in percent, carries no decimal the model
  // could support.
  if (
    metric === 'aqi' ||
    metric === 'freeze' ||
    metric === 'cloud_base' ||
    metric === 'cloud_cover'
  )
    return v.toFixed(0)
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

// One object per timestamp — { t, [lineKey]: value|null, … } — the shape
// Recharts consumes, with a line per plotted series keyed by its own key.
// Nulls pass through so the line breaks at gaps (connectNulls={false}).
export function buildChartData(
  times: number[],
  lines: readonly ChartLine[],
  metric: ChartMetric,
): ChartPoint[] {
  return times.map((t, i) => {
    const point: ChartPoint = { t }
    for (const line of lines) point[line.key] = valueAt(line, metric, i)
    return point
  })
}

// Y range across the selected set. Magnitudes (precip/wind/AQI) floor at 0 so
// heights compare honestly; temperature floats to its own min. A small top pad
// keeps the tallest line off the frame. The same [min,max] drives the hover
// pixel→value inversion, so the focus math matches the rendered axis exactly.
export function computeYDomain(
  rows: readonly SeriesHolder[],
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
