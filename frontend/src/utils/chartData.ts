import { DestinationResult, HourlySeries, SortBy } from '../types'
import { cloudDeckMark } from './cloudDeckMark'
import { MetricFamily, familyOf, formatPrecipRate, metricLabel } from '../metrics'
import { setKey } from './points'

/**
 * The families this chart can plot, which is every one: each is an hourly
 * series. Snow depth was the one exception, as one number for today, until
 * snowfall replaced it (#678).
 */
export type ChartMetric = MetricFamily

export const SERIES_FIELD: Record<ChartMetric, keyof HourlySeries> = {
  precip: 'precip_in',
  temp: 'temp_f',
  wind: 'wind_mph',
  freeze: 'freeze_ft',
  snowfall: 'snowfall_in',
  aqi: 'aqi',
  cloud_deck: 'cloud_deck_ft',
}

// The chart's metric select, in option order. No aggregate: these plot the raw
// hourly series, so a point is that hour's own value rather than anything
// reduced over the window. The cloud deck comes last (#117, #670): it is the
// one a report carries only when it was asked for it, so an option that can
// draw nothing sits under every option that always draws.
export const CHART_METRICS: { key: ChartMetric; label: string }[] = (
  ['precip', 'temp', 'wind', 'freeze', 'snowfall', 'aqi', 'cloud_deck'] as const
).map((key) => ({ key, label: metricLabel(key) }))

// The chart opens on whatever metric the results were ranked by.
//
// Read off the ranking key's own family rather than matched against a list of
// keys: since #291 a family has three or four rankable keys, and a list
// naming one of them each opened the precipitation chart for the other two.
// A gust ranking opens the wind, which draws the gust beside every line
// (`drawsGustLines`).
export function metricForSort(sortBy: SortBy): ChartMetric {
  return familyOf(sortBy)
}

/**
 * The hourly series one hour of a ranking key is read from: its family's,
 * except the wind's gust, which is a series of its own (#584). Map playback
 * reads it, so a marker under a gust ranking plays the hour's gust rather than
 * the hour's sustained wind.
 */
export function seriesFieldFor(sortBy: SortBy): keyof HourlySeries {
  return sortBy === 'wind_gust_mph' ? 'wind_gust_mph' : SERIES_FIELD[familyOf(sortBy)]
}

/**
 * Whether the Wind chart draws the gust beside its lines: only while the
 * report is RANKED by the gust (TJ, 2026-10-09, #584), whatever metric the
 * chart has been switched to by hand. A companion doubles the lines the wind
 * draws, which measured 48 to 112 ms for a plain 200-row switch to Wind and 111
 * to 384 ms under a three-model comparison (record 0124), so a reader who
 * ranks by the sustained wind pays what main pays and sees what main shows.
 */
export function drawsGustLines(sortBy: SortBy): boolean {
  return sortBy === 'wind_gust_mph'
}

/**
 * The gust's dashed line beside each wind line (TJ, #584): the same colour as
 * its destination's (or its compared model's) wind, so the pair reads as one
 * place, and listed directly after it, which is the order the tooltip keeps.
 * Only the wind draws one, and only when `show` (`drawsGustLines`) says the
 * report ranks by the gust; otherwise the lines come back untouched.
 *
 * Here rather than in the component because the node-env suite cannot render
 * the chart, so a pairing decided inside it would be untestable.
 */
export function withGustLines(
  lines: readonly ChartLine[],
  metric: ChartMetric,
  show: boolean,
): readonly ChartLine[] {
  if (!show || metric !== 'wind') return lines
  return lines.flatMap((line) => [
    line,
    {
      ...line,
      key: gustLineKey(line.key),
      label: gustLineLabel(line.label),
      field: 'wind_gust_mph' as const,
      dashed: true,
      parentKey: line.key,
    },
  ])
}

/**
 * The key a line is focused, dimmed and ordered by: its wind line's for a gust
 * line, its own for every other.
 */
export function lineGroup(line: ChartLine): string {
  return line.parentKey ?? line.key
}

/** One line's value at the hovered hour, as the tooltip lists it. */
export interface TooltipEntry {
  key: string
  value: number
  line: ChartLine
}

/**
 * The tooltip's rows: the focused line first, the rest by nearness to the
 * cursor (or highest first with no cursor), and a gust row directly under its
 * own wind line's, wherever that lands (#584). Ordered by the wind line's
 * value, or the gust's when the wind has none at that hour.
 */
export function orderTooltipItems(
  items: readonly TooltipEntry[],
  focusedKey: string | null,
  cursorValue: number | null,
): TooltipEntry[] {
  const groups = new Map<string, TooltipEntry[]>()
  for (const it of items) {
    const group = lineGroup(it.line)
    const members = groups.get(group)
    if (members) members.push(it)
    else groups.set(group, [it])
  }
  const lead = (members: TooltipEntry[]) =>
    members.find((m) => m.line.parentKey == null) ?? members[0]
  const ordered = [...groups.entries()].sort(([ka, a], [kb, b]) => {
    if (ka === focusedKey) return -1
    if (kb === focusedKey) return 1
    const va = lead(a).value
    const vb = lead(b).value
    if (cursorValue == null) return vb - va
    return Math.abs(va - cursorValue) - Math.abs(vb - cursorValue)
  })
  return ordered.flatMap(([, members]) =>
    [...members].sort((a, b) => Number(a.line.parentKey != null) - Number(b.line.parentKey != null)),
  )
}

/** A gust line's Recharts key: its wind line's, which no other key ends like. */
export function gustLineKey(key: string): string {
  return `${key}|gust`
}

/** A gust line's name in the tooltip: `Mount Rainier (gust)`. */
export function gustLineLabel(label: string): string {
  return `${label} (gust)`
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
// holds the rows. `chartCandidates` in useChartCompare is a fresh array whenever the
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
      wind_gust_mph: remap(row.series.wind_gust_mph),
      freeze_ft: remap(row.series.freeze_ft),
      snowfall_in: remap(row.series.snowfall_in),
      aqi: remap(row.series.aqi),
      // Present only on a report that fetched the cloud column (#117), and
      // spread for the reason the bearings below are.
      ...(row.series.cloud_deck_ft ? { cloud_deck_ft: remap(row.series.cloud_deck_ft) } : {}),
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
   * Colour is the only channel a line carries, so every line has one no other
   * line is wearing; the one exception is a gust line, which wears its wind
   * line's colour dashed (`withGustLines`), because the two are one place. With no comparison up that is the
   * destination's colour; under one the ranking model's lines keep it and
   * every other (destination, model) pair takes its own from the session
   * allocator (`allocateColors` in `chartColors.ts`).
   */
  color: string
  /**
   * The series this line reads when it is not its metric's own: the gust
   * line under the wind (#584). Absent on every other line.
   */
  field?: keyof HourlySeries
  /** Drawn dashed: the gust beside its wind line, and nothing else. */
  dashed?: boolean
  /**
   * The line this one belongs to, so hovering either dims and lifts the pair
   * together and the tooltip lists one directly under the other.
   */
  parentKey?: string
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
  return `${rank}. ${modelNamed(name, modelLabel)}`
}

/**
 * A destination named with the model its line came from: `Mount Rainier
 * (NOAA GFS)`. The hover box's name without the rank, for the chart-only
 * legend: its chips already stand in ranking order, and a chip truncates at a
 * fixed width, so a rank would spend that width on what the position says.
 * `comparedLineLabel` composes through this so the two cannot drift apart.
 */
export function modelNamed(name: string, modelLabel: string): string {
  return `${name}${modelSuffix(modelLabel)}`
}

/**
 * The model half of `modelNamed`, on its own. The legend chip draws it in a
 * span that never shrinks beside a name that truncates, because the model is
 * the part of the label that tells two chips of one destination apart.
 */
export function modelSuffix(modelLabel: string): string {
  return ` (${modelLabel})`
}

export function valueAt(
  row: SeriesHolder & { field?: keyof HourlySeries },
  metric: ChartMetric,
  i: number,
): number | null {
  const arr = row.series ? row.series[row.field ?? SERIES_FIELD[metric]] : undefined
  const v = arr ? arr[i] : null
  return v == null ? null : v
}

/**
 * One plotted hour, as the tooltip prints it.
 *
 * A point on this chart is a single hour's value, which is the number the
 * table's per-hour columns are the average, floor and peak OF — so the digits
 * come from the shared formatter rather than from a count spelled here (#395).
 * The tooltip and the cell beside it are read in the same glance.
 */
/**
 * A tooltip's value: the axis's format, except a cloud deck at either edge of
 * the walk, which prints as the bound it is (`cloudDeckMark`) rather than as a
 * level's height. Ungrouped, like the numbers beside it. The axis keeps the
 * plain format, because a tick is a round number on a scale, not a reading.
 */
export function formatTooltipValue(v: number, metric: ChartMetric): string {
  return (metric === 'cloud_deck' ? cloudDeckMark(v, false) : null) ?? formatMetricValue(v, metric)
}

export function formatMetricValue(v: number, metric: ChartMetric): string {
  if (metric === 'precip' || metric === 'snowfall') return formatPrecipRate(v)
  // Whole units: an AQI is an integer index, and a freezing level or a cloud
  // deck in feet carries no decimal the model could support.
  if (metric === 'aqi' || metric === 'freeze' || metric === 'cloud_deck') return v.toFixed(0)
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
  rows: readonly (SeriesHolder & { field?: keyof HourlySeries })[],
  metric: ChartMetric,
): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const row of rows) {
    const arr = row.series ? row.series[row.field ?? SERIES_FIELD[metric]] : undefined
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

// Map a pixel X within the plot area to an instant (left = tMin, right = tMax),
// the x mirror of pixelToValue below. A touch tap reaches the chart's click
// handler with no hover before it, so Recharts has no active label to hand
// over and the only place the tap names is the pixel it landed on.
export function pixelToTime(
  x: number,
  plotLeft: number,
  plotWidth: number,
  tMin: number,
  tMax: number,
): number {
  if (plotWidth <= 0) return tMin
  const frac = Math.max(0, Math.min(1, (x - plotLeft) / plotWidth))
  return tMin + frac * (tMax - tMin)
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
