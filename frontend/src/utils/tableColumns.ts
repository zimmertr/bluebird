import { SortBy } from '../types'
import { METRIC_CONFIG } from './colors'

// Identity columns that always lead the table, ahead of any metric group.
const LEAD_KEYS = new Set(['name', 'elevation_ft'])

/**
 * Order the table's columns so the ranked metric's group comes right after the
 * identity columns — an AQI ranking reads "#, Name, Elev (ft), AQI Avg,
 * AQI Max, …" — while the remaining groups keep their canonical relative order.
 */
export function orderColumns<T extends { key: string }>(columns: T[], sortBy: SortBy): T[] {
  const group = new Set<string>(METRIC_CONFIG[sortBy].group)
  const lead = columns.filter((c) => LEAD_KEYS.has(c.key))
  const ranked = columns.filter((c) => !LEAD_KEYS.has(c.key) && group.has(c.key))
  const rest = columns.filter((c) => !LEAD_KEYS.has(c.key) && !group.has(c.key))
  return [...lead, ...ranked, ...rest]
}
