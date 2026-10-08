import { DestinationResult, SortBy } from '../types'
import { AGGREGATE, MetricFamily, familyOf, metricLabel, windowAggregate } from '../metrics'
import { CLOSURE_KEY, ColDef, LEAD_KEYS, MODEL_KEY, WILDFIRE_KEY } from './tableColumns'
import { ModelRow } from './modelCompare'
import { extremeHourMs, windyUrl } from './windy'
import { isUnavailableKey, unavailableCellText } from './unavailableCell'

/**
 * A marker popup's body, derived from the columns the results table is showing
 * (#370).
 *
 * The popup used to hold its own hard-coded row list, so a Current lookup read
 * "total", "avg", "min" and "max" over four copies of one number, and a
 * date-range report showed six of the sixteen values the table had. Both
 * surfaces now read one list: `tableColumns` in `useTableView`, which already
 * carries the point-sample collapse, the ranked family, the Columns picker and
 * the reader's own column order.
 *
 * It is a pure module for the reason `calendar.ts` and `listbox.ts` are: Vitest
 * runs node-env with no DOM here, so anything left inside the component is
 * untestable by construction.
 */

/** One measurement in a group. */
export type PopupValue = {
  /**
   * How the value was reduced, or `null` where the column carries no
   * aggregate — a point-sample collapse, or the elevation.
   */
  aggregate: string | null
  /** The formatted number, as the table's cell prints it. */
  text: string
  /**
   * The column's unit where the group's columns disagree on one (a window
   * total in inches beside rates in inches per hour), so the heading cannot
   * carry it. Null where the heading does.
   */
  unit: string | null
  /** Where the number links, matching the table cell's Windy link. */
  href: string | null
}

/**
 * One label and its values.
 *
 * A group is a metric family, or a lone identity column that is a number
 * rather than a name (the elevation). `single` is what decides the shape: one
 * value is a line of its own in the grid, and two or more spread across the
 * aggregate columns (`popupGrid`).
 */
export type PopupGroup = {
  label: string
  values: PopupValue[]
  single: boolean
}

/** What the band above the popup's rule says about the destination itself. */
export type PopupIdentity = {
  /** Title-cased, matching the table's Type column. */
  type: string | null
  /** Which model answered this row, only while a comparison is up. */
  model: string | null
}

/**
 * The value a column reads on a row, formatted exactly as the table's cell
 * formats it.
 *
 * One metric can be empty for a reason that is not the weather — the model
 * publishes no freezing level. It keeps the table's N/A mark rather than the
 * dash a genuinely missing hour gets, and carries no link: a mark saying a
 * number was never available has nothing for Windy to show.
 */
function cellText(col: ColDef, row: DestinationResult): { text: string; linkable: boolean } {
  const raw = row[col.key as keyof DestinationResult]
  if (isUnavailableKey(col.key as string)) {
    const note = unavailableCellText(raw)
    if (note !== null) return { text: note, linkable: false }
  }
  // A null never reaches a formatter, which is `resultsCsv.ts`'s rule for the
  // same reason: `Number(null).toFixed(1)` is "0.0" and `Number(undefined)` is
  // "NaN", and both are a number the forecast never gave. The dash is what the
  // table's own cell draws. The link stays, matching the table, which links a
  // cell by its column rather than by whether the hour had a value.
  if (raw == null) return { text: '—', linkable: true }
  return { text: col.format ? col.format(raw) : String(raw), linkable: true }
}

/**
 * The heading a family's values sit under.
 *
 * The unit goes on the heading when every visible column in the group reports
 * in the same one, and on each value when they do not. Precipitation and
 * snowfall split: each window total is inches and the other three columns are
 * a rate, so a shared unit on the heading would be wrong for three values out
 * of four (TJ, 2026-09-14; snowfall since #678).
 */
function groupUnit(cols: ColDef[]): string | null {
  const units = cols.map((c) => c.unit ?? '')
  return units.every((u) => u === units[0]) ? units[0] : null
}

/**
 * The popup's groups, in the order the table shows their columns.
 *
 * Family order is first appearance, so an AQI ranking puts AQI at the top of
 * the card exactly as `orderColumns` puts it at the left of the table. Within
 * a family the aggregates keep the columns' own order, which is the reader's
 * if they have dragged one.
 *
 * Three column kinds never become a group. `name` is the popup's title.
 * `type` and the model ride in the band above the rule, where TJ moved them.
 * And the two flag columns, wildfire and closure, stay out entirely: the popup
 * says each in amber at the top, because each is a safety flag rather than a
 * measurement, and saying it twice on one card would be the drift this file
 * exists to stop.
 */
export function popupGroups(
  row: DestinationResult,
  columns: readonly ColDef[],
  context: {
    modelId?: string | null
    times?: readonly number[]
  } = {},
): PopupGroup[] {
  // Insertion-ordered, which is what makes "first appearance" the family order
  // without a second sort to keep in step with `orderColumns`.
  const groups = new Map<string, ColDef[]>()
  for (const col of columns) {
    const key = col.key as string
    if (
      key === 'name' ||
      key === 'type' ||
      key === WILDFIRE_KEY ||
      key === CLOSURE_KEY ||
      key === MODEL_KEY
    )
      continue
    const bucket = LEAD_KEYS.has(key) ? key : familyOf(key)
    groups.set(bucket, [...(groups.get(bucket) ?? []), col])
  }

  const rowModel = (row as ModelRow).modelId ?? context.modelId
  const out: PopupGroup[] = []
  for (const [bucket, cols] of groups) {
    const shared = groupUnit(cols)
    const values: PopupValue[] = cols.map((col) => {
      const { text, linkable } = cellText(col, row)
      return {
        aggregate: cols.length > 1 ? windowAggregate(col.key as SortBy) : null,
        text,
        // A mixed group's unit rides on the value, because the heading cannot.
        unit: shared === null && col.unit ? col.unit : null,
        href:
          linkable && col.windyLayer
            ? windyUrl({
                latitude: row.latitude,
                longitude: row.longitude,
                layer: col.windyLayer,
                modelId: rowModel,
                atMs: extremeHourMs(
                  col.key as string,
                  row.series,
                  row.series_times ?? context.times ?? [],
                ),
              })
            : null,
      }
    })
    // One value keeps the column's own label, which already names the metric,
    // the aggregate where there is one, and the unit — so a report narrowed to
    // a single aggregate reads the same words as the header it came from.
    const single = cols.length === 1
    out.push({
      label: single
        ? cols[0].label
        : metricLabel(bucket as MetricFamily, undefined, shared ?? ''),
      values,
      single,
    })
  }
  return out
}

/**
 * The type and the model, for the band under the title.
 *
 * Title-cased here the way the table's Type column formats it, off the same
 * `ColDef`, so the two cannot capitalize one word differently.
 */
export function popupIdentity(
  row: DestinationResult,
  columns: readonly ColDef[],
  modelFallbackLabel?: string | null,
): PopupIdentity {
  const typeCol = columns.find((c) => c.key === 'type')
  const modelShown = columns.some((c) => c.key === MODEL_KEY)
  return {
    type: typeCol ? (typeCol.format ? typeCol.format(row.type) : row.type) : null,
    model: modelShown ? ((row as ModelRow).modelLabel ?? modelFallbackLabel ?? null) : null,
  }
}

/** A value in the grid, or an aggregate the reader's columns leave out. */
export type PopupCell = { text: string; href: string | null } | null

/**
 * One line of the popup's grid (TJ, 2026-10-08).
 *
 * - `value`: one number for the line, across the aggregate columns. The
 *   elevation always, and every family over a Current lookup.
 * - `total`: a family's window total, on its own line because it is in a unit
 *   of its own (precipitation and snowfall, inches beside inches per hour).
 * - `aggregates`: one cell per aggregate column. `nested` is the rate line
 *   under a total, whose label is the rates' unit alone; `fullLabel` is what a
 *   screen reader hears for it, since "(in/hr)" names nothing on its own.
 */
export type PopupGridRow =
  | { kind: 'value'; label: string; cell: { text: string; href: string | null } }
  | { kind: 'total'; label: string; aggregate: string; cell: { text: string; href: string | null } }
  | { kind: 'aggregates'; label: string; fullLabel: string; nested: boolean; cells: PopupCell[] }

/** The popup's body as a grid: aggregate column headings, then the lines. */
export type PopupGrid = { columns: string[]; rows: PopupGridRow[] }

/**
 * The aggregates that become columns, in one order for every family. A grid
 * cannot keep each family's own column order the way the stacked lines did,
 * so it takes the order most families already have, and an AQI ranking's Avg
 * moves from first to last (TJ chose the grid, 2026-10-08). A window total is
 * never a column: only two families have one, and its unit is not theirs.
 */
const GRID_AGGREGATES: readonly string[] = [AGGREGATE.minimum, AGGREGATE.maximum, AGGREGATE.average]

/**
 * The groups laid out as a grid: a row per family, a column per aggregate
 * (TJ, 2026-10-08, replacing the stacked heading-and-values lines at every
 * width). A column appears only when some family shows that aggregate, so a
 * reader who hid every Avg gets two columns, and a Current lookup, where each
 * family is one number, gets none: every line is then a label and its value.
 */
export function popupGrid(groups: readonly PopupGroup[]): PopupGrid {
  const shown = new Set(
    groups.filter((g) => !g.single).flatMap((g) => g.values.map((v) => v.aggregate ?? '')),
  )
  const columns = GRID_AGGREGATES.filter((a) => shown.has(a))
  const cellOf = (v: PopupValue): { text: string; href: string | null } => ({
    text: v.unit ? `${v.text} ${v.unit}` : v.text,
    href: v.href,
  })
  const rows: PopupGridRow[] = []
  for (const g of groups) {
    if (g.single) {
      rows.push({ kind: 'value', label: g.label, cell: { text: g.values[0].text, href: g.values[0].href } })
      continue
    }
    const inGrid = g.values.filter((v) => v.aggregate !== null && columns.includes(v.aggregate))
    const apart = g.values.filter((v) => !inGrid.includes(v))
    for (const v of apart) {
      rows.push({ kind: 'total', label: g.label, aggregate: v.aggregate ?? '', cell: cellOf(v) })
    }
    if (inGrid.length === 0) continue
    // Under a total the rates' unit is the line's whole label; without one the
    // family's heading names it, unless its columns disagree, when each value
    // keeps its own.
    const rateUnit = inGrid[0].unit
    const nested = apart.length > 0 && rateUnit !== null && inGrid.every((v) => v.unit === rateUnit)
    const label = nested ? `(${rateUnit})` : g.label
    const cells = columns.map((a) => {
      const v = inGrid.find((x) => x.aggregate === a)
      if (!v) return null
      return nested ? { text: v.text, href: v.href } : cellOf(v)
    })
    rows.push({ kind: 'aggregates', label, fullLabel: nested ? `${g.label} ${label}` : label, nested, cells })
  }
  return { columns, rows }
}
