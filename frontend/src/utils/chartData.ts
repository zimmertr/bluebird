import { DestinationResult, HourlySeries, SortBy } from '../types'

export type ChartMetric = 'precip' | 'temp' | 'wind' | 'aqi'

const SERIES_FIELD: Record<ChartMetric, keyof HourlySeries> = {
  precip: 'precip_in',
  temp: 'temp_f',
  wind: 'wind_mph',
  aqi: 'aqi',
}

export const CHART_METRICS: { key: ChartMetric; label: string }[] = [
  { key: 'precip', label: 'Precip (in)' },
  { key: 'temp', label: 'Temp (°F)' },
  { key: 'wind', label: 'Wind (mph)' },
  { key: 'aqi', label: 'AQI (PM2.5)' },
]

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
