import { SortBy } from '../types'
import { metricLabel } from '../metrics'
import { METRIC_CONFIG } from './colors'

// Identity columns that always lead the table, ahead of any metric group.
const LEAD_KEYS = new Set(['name', 'elevation_ft'])

/**
 * Order the table's columns so the ranked metric's group comes right after the
 * identity columns — an AQI ranking leads with both AQI columns straight after
 * "#, Name, Elevation (ft)" — while the remaining groups keep their canonical
 * relative order. (No metric names in this comment: the metrics.test.ts source
 * lint scans comments too.)
 */
export function orderColumns<T extends { key: string }>(columns: T[], sortBy: SortBy): T[] {
  const group = new Set<string>(METRIC_CONFIG[sortBy].group)
  const lead = columns.filter((c) => LEAD_KEYS.has(c.key))
  const ranked = columns.filter((c) => !LEAD_KEYS.has(c.key) && group.has(c.key))
  const rest = columns.filter((c) => !LEAD_KEYS.has(c.key) && !group.has(c.key))
  return [...lead, ...ranked, ...rest]
}

// A point-sample analysis ('now' or 'at') covers a single hour, so its
// avg/min/max triplets are the same number three times — collapse each metric
// group to one representative column and drop the window-total/aggregate
// labels from the headers.
const POINT_LABELS: Record<string, string> = {
  precip_avg_in_hr: metricLabel('precip', undefined, 'in/hr'),
  temp_avg_f: metricLabel('temp'),
  wind_avg_mph: metricLabel('wind'),
  aqi_avg: metricLabel('aqi'),
}

/**
 * Reduce the full window-mode column set to the single-value columns a
 * point-sample analysis shows: identity columns plus one column per metric,
 * relabeled without the aggregate qualifier.
 */
export function pointModeColumns<T extends { key: string; label: string }>(columns: T[]): T[] {
  return columns
    .filter((c) => LEAD_KEYS.has(c.key) || c.key in POINT_LABELS)
    .map((c) => (c.key in POINT_LABELS ? { ...c, label: POINT_LABELS[c.key] } : c))
}
