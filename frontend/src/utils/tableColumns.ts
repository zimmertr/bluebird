import { DestinationResult, SortBy } from '../types'
import { AGGREGATE, FAMILY_KEYS, familyOf, metricLabel } from '../metrics'
import { FREEZE_UNAVAILABLE } from './freezingLevel'

/**
 * One column of the results table.
 *
 * `format` renders a cell on screen; `csv` renders the same value into a file,
 * and exists only where the two genuinely differ. They differ for exactly one
 * reason: a display formatter is free to write for a human reading a row, and a
 * file has to be parseable. Elevation is the case — `toLocaleString()` puts a
 * thousands separator inside a comma-separated cell. Everything else formats
 * through `toFixed`, which is already safe, so it has no `csv` and the exporter
 * falls back to `format`. Nulls never reach either one: `resultsCsv.ts` writes
 * `csvNull` before it would call a formatter, where the table writes a dash.
 *
 * `csvNull` is that empty cell's text, and it is empty for every column but
 * the freezing level's three. A blank is how a spreadsheet spells "no value",
 * which is the truth for a number the forecast simply lacks; a freezing level
 * is missing because the MODEL carries no such variable, which is a different
 * statement and the one the screen already makes with its mark.
 */
export type ColDef = {
  key: keyof DestinationResult | typeof WILDFIRE_KEY | typeof MODEL_KEY
  label: string
  format?: (v: unknown) => string
  csv?: (v: unknown) => string
  csvNull?: string
  windyLayer?: string
}

/**
 * The wildfire-proximity column (#256). Its key is virtual: the value lives in
 * useFireProximity's warning map rather than on the row, so every consumer
 * branches on the key before indexing a DestinationResult. It is not in
 * COLUMNS because its cells come from the fire lookup's state rather than the
 * report — App appends it to every table, the CSV appends it only once the
 * check answered — and it is not in the Columns picker because it is a safety
 * flag rather than a metric preference. The label is shared by the table and
 * the CSV so the two surfaces cannot name the same numbers differently.
 */
export const WILDFIRE_KEY = 'wildfire_mi'
export const WILDFIRE_COL: ColDef = { key: WILDFIRE_KEY, label: 'Wildfire (mi)' }

/**
 * Which model a row's numbers came from, when more than one is selected.
 *
 * Virtual like the wildfire column, and for the same reason: the value is
 * something the browser knows about a row it is displaying rather than a field
 * the API answered with, so every consumer branches on the key before indexing
 * a `DestinationResult`. It rides on `ModelRow` (`modelCompare.ts`).
 *
 * Appears only while a comparison is up. With one model selected every row
 * would carry the same name, which is a column that says nothing and costs the
 * width of its widest label — and that label is a model name, the longest
 * strings the panel has.
 */
export const MODEL_KEY = 'model'
export const MODEL_COL: ColDef = { key: MODEL_KEY, label: 'Model' }

/** The column a detail sort is keyed on, and which way it runs. */
export type SortKey = ColDef['key']
export type SortDir = 'asc' | 'desc'

// Identity columns that always lead the table, ahead of any metric group.
// Exported because the Model column is inserted directly after them: it says
// which answer a row is, so it belongs with what identifies a row rather than
// among the numbers it qualifies.
export const LEAD_KEYS: ReadonlySet<string> = new Set(['name', 'type', 'elevation_ft'])

/**
 * Every column a window-mode analysis can show, in canonical order.
 *
 * Headers name the metric and then how it was reduced over the window, split by
 * metrics.ts's separator so the eye doesn't have to find the seam. The rate
 * columns override the unit: precipitation is inches over a whole window but
 * inches per hour when averaged or peaked.
 *
 * This lives here rather than in ResultsTable because the table is no longer
 * the only surface that needs it: the CSV export writes the same columns, and a
 * second copy of the list is a second answer to "what does the report contain".
 */
export const COLUMNS: ColDef[] = [
  { key: 'name', label: 'Name' },
  // What a row *is*, which stopped being obvious the moment one polygon
  // could return peaks and lakes together. It leads with the identity
  // columns rather than sitting among the metrics, because it describes the
  // destination rather than its weather, and it is the same word the popups
  // and the OSM query use. Title-cased for display; the CSV keeps the raw
  // value, which is what an API caller and a re-import both expect.
  {
    key: 'type',
    label: 'Type',
    format: (v) => (typeof v === 'string' && v ? v[0].toUpperCase() + v.slice(1) : '—'),
    csv: (v) => (typeof v === 'string' ? v : ''),
  },
  {
    key: 'elevation_ft',
    label: 'Elevation (ft)',
    format: (v) => (v != null ? Number(v).toLocaleString() : '—'),
    csv: (v) => String(v),
  },
  { key: 'precip_total_in', label: metricLabel('precip', AGGREGATE.total), format: (v) => Number(v).toFixed(3), windyLayer: 'rain' },
  { key: 'precip_avg_in_hr', label: metricLabel('precip', AGGREGATE.average, 'in/hr'), format: (v) => Number(v).toFixed(4), windyLayer: 'rain' },
  { key: 'precip_min_in_hr', label: metricLabel('precip', AGGREGATE.minimum, 'in/hr'), format: (v) => Number(v).toFixed(4), windyLayer: 'rain' },
  { key: 'precip_max_in_hr', label: metricLabel('precip', AGGREGATE.maximum, 'in/hr'), format: (v) => Number(v).toFixed(4), windyLayer: 'rain' },
  { key: 'temp_min_f', label: metricLabel('temp', AGGREGATE.minimum), format: (v) => Number(v).toFixed(1), windyLayer: 'temp' },
  { key: 'temp_max_f', label: metricLabel('temp', AGGREGATE.maximum), format: (v) => Number(v).toFixed(1), windyLayer: 'temp' },
  { key: 'temp_avg_f', label: metricLabel('temp', AGGREGATE.average), format: (v) => Number(v).toFixed(1), windyLayer: 'temp' },
  { key: 'wind_min_mph', label: metricLabel('wind', AGGREGATE.minimum), format: (v) => Number(v).toFixed(1), windyLayer: 'wind' },
  { key: 'wind_max_mph', label: metricLabel('wind', AGGREGATE.maximum), format: (v) => Number(v).toFixed(1), windyLayer: 'wind' },
  { key: 'wind_avg_mph', label: metricLabel('wind', AGGREGATE.average), format: (v) => Number(v).toFixed(1), windyLayer: 'wind' },
  // Feet above sea level, formatted like the elevation column above it,
  // because the reading IS the comparison between the two. Null is the
  // five-model case (#295) and both surfaces draw it as N/A — the table with
  // the note in freezingLevel.ts, the file through `csvNull` — rather than the
  // dash a genuine gap gets; the dash below is the fallback for a formatter
  // called on a null anywhere else. Windy's own name for the layer is its
  // zero-degree isotherm, `deg0`.
  { key: 'freeze_min_ft', label: metricLabel('freeze', AGGREGATE.minimum), format: (v) => (v != null ? Number(v).toLocaleString() : '—'), csv: (v) => String(v), csvNull: FREEZE_UNAVAILABLE, windyLayer: 'deg0' },
  { key: 'freeze_max_ft', label: metricLabel('freeze', AGGREGATE.maximum), format: (v) => (v != null ? Number(v).toLocaleString() : '—'), csv: (v) => String(v), csvNull: FREEZE_UNAVAILABLE, windyLayer: 'deg0' },
  { key: 'freeze_avg_ft', label: metricLabel('freeze', AGGREGATE.average), format: (v) => (v != null ? Number(v).toLocaleString() : '—'), csv: (v) => String(v), csvNull: FREEZE_UNAVAILABLE, windyLayer: 'deg0' },
  { key: 'aqi_avg', label: metricLabel('aqi', AGGREGATE.average), format: (v) => (v != null ? Number(v).toFixed(0) : '—'), windyLayer: 'pm2p5' },
  { key: 'aqi_min', label: metricLabel('aqi', AGGREGATE.minimum), format: (v) => (v != null ? Number(v).toFixed(0) : '—'), windyLayer: 'pm2p5' },
  { key: 'aqi_max', label: metricLabel('aqi', AGGREGATE.maximum), format: (v) => (v != null ? Number(v).toFixed(0) : '—'), windyLayer: 'pm2p5' },
]

/**
 * Order the table's columns so the ranked metric's group comes right after the
 * identity columns — an AQI ranking leads with both AQI columns straight after
 * "#, Name, Elevation (ft)" — while the remaining groups keep their canonical
 * relative order. (No metric names in this comment: the metrics.test.ts source
 * lint scans comments too.)
 */
export function orderColumns<T extends { key: string }>(columns: T[], sortBy: SortBy): T[] {
  const group = new Set<string>(FAMILY_KEYS[familyOf(sortBy)])
  const lead = columns.filter((c) => LEAD_KEYS.has(c.key))
  const ranked = columns.filter((c) => !LEAD_KEYS.has(c.key) && group.has(c.key))
  const rest = columns.filter((c) => !LEAD_KEYS.has(c.key) && !group.has(c.key))
  return [...lead, ...ranked, ...rest]
}

// A point-sample analysis covers a single hourly stamp, so its avg/min/max
// triplets are the same number three times — collapse each metric group to one
// representative column and drop the window-total/aggregate labels from the
// headers.
const POINT_LABELS: Record<string, string> = {
  precip_avg_in_hr: metricLabel('precip', undefined, 'in/hr'),
  temp_avg_f: metricLabel('temp'),
  wind_avg_mph: metricLabel('wind'),
  freeze_avg_ft: metricLabel('freeze'),
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

/**
 * The columns the report actually shows, given how it was analyzed and what it
 * is ranked by: the point-sample collapse, then the ranked group pulled to the
 * front.
 *
 * Both compositions above were spelled out at one call site inside the table
 * until the CSV export needed the same answer. A file whose columns disagreed
 * with the screen's would be a quiet bug rather than a visible one, so the two
 * read from one function instead of from two copies of one expression.
 *
 * `pointSample` is measured, not named. This used to take the analysis mode and
 * collapse whenever it was not 'window', which worked only while two of three
 * pickers existed to mean "one hour". A calendar has no such mode: one hour is a
 * day narrowed to it (#166). So the caller counts the hourly stamps the window
 * covered (`isPointSample` in forecastWindow.ts) and passes the answer, which is
 * the honest question anyway — the columns collapse exactly when the aggregates
 * would be one value three times.
 */
export function displayedColumns(pointSample: boolean, sortBy: SortBy): ColDef[] {
  return orderColumns(pointSample ? pointModeColumns(COLUMNS) : COLUMNS, sortBy)
}

/**
 * Columns visible on screen, filtered by user visibility choices.
 * Ranked metric columns are always visible (force-shown). CSV gets the full set.
 */
export function visibleColumns(
  pointSample: boolean,
  sortBy: SortBy,
  visibleKeys?: Set<string> | null,
): ColDef[] {
  const allCols = orderColumns(pointSample ? pointModeColumns(COLUMNS) : COLUMNS, sortBy)
  if (!visibleKeys) return allCols
  const group = new Set<string>(FAMILY_KEYS[familyOf(sortBy)])
  return allCols.filter((c) => visibleKeys.has(c.key) || group.has(c.key))
}
