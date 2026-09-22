import { DestinationResult, SortBy } from '../types'
import { MetricFamily, familyOf, metricLabel, windowAggregate } from '../metrics'
import { ColDef, LEAD_KEYS, MODEL_KEY, WILDFIRE_KEY } from './tableColumns'
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
 * surfaces now read one list: `tableColumns` in `App.tsx`, which already
 * carries the point-sample collapse, the ranked family, the Columns picker and
 * the reader's own column order.
 *
 * It is a pure module for the reason `calendar.ts` and `listbox.ts` are: Vitest
 * runs node-env with no DOM here, so anything left inside the component is
 * untestable by construction.
 */

/** One measurement on a group's values line. */
export type PopupValue = {
  /**
   * How the value was reduced, or `null` where the column carries no
   * aggregate — a point-sample collapse, or the elevation.
   */
  aggregate: string | null
  /** The formatted number, with its own unit appended only in a mixed group. */
  text: string
  /** Where the number links, matching the table cell's Windy link. */
  href: string | null
}

/**
 * One heading and the values under it.
 *
 * A group is a metric family, or a lone identity column that is a number
 * rather than a name (the elevation). `single` is what decides the shape: one
 * value reads as "label: value" on one line, and two or more take a heading
 * line with the values indented under it.
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
 * Two metrics can be empty for a reason that is not the weather — the model
 * publishes no freezing level, or the destination is outside the snow grid.
 * Both keep the table's N/A mark rather than the dash a genuinely missing hour
 * gets, and neither carries a link: a mark saying a number was never available
 * has nothing for Windy to show.
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
 * in the same one, and on each value when they do not. Precipitation is the
 * only family that splits: its window total is inches and its other three
 * columns are a rate, so a shared unit on the heading would be wrong for three
 * values out of four (TJ, 2026-09-14).
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
 * And the wildfire column stays out entirely: the popup says that in amber at
 * the top, because it is a safety flag rather than a measurement, and saying it
 * twice on one card would be the drift this file exists to stop.
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
    if (key === 'name' || key === 'type' || key === WILDFIRE_KEY || key === MODEL_KEY) continue
    const bucket = LEAD_KEYS.has(key) ? key : familyOf(key)
    groups.set(bucket, [...(groups.get(bucket) ?? []), col])
  }

  const rowModel = (row as ModelRow).modelId ?? context.modelId
  const out: PopupGroup[] = []
  for (const [bucket, cols] of groups) {
    const shared = groupUnit(cols)
    const values: PopupValue[] = cols.map((col) => {
      const { text, linkable } = cellText(col, row)
      // A mixed group spells the unit on the value, because the heading cannot.
      const unit = shared === null && col.unit ? ` ${col.unit}` : ''
      return {
        aggregate: cols.length > 1 ? windowAggregate(col.key as SortBy) : null,
        text: `${text}${unit}`,
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
