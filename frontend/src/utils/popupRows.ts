import { DestinationResult, SortBy } from '../types'
import { AGGREGATE, MetricFamily, aggregateToken, familyOf, metricLabel, windowAggregate } from '../metrics'
import { CLOSURE_KEY, ColDef, ELEVATION_COL, LEAD_KEYS, MODEL_KEY, WILDFIRE_KEY } from './tableColumns'
import { ModelRow } from './modelCompare'
import { extremeHourMs, windyUrl } from './windy'
import { isUnavailableKey, unavailableCellText } from './unavailableCell'
import { isCloudDeckMark } from './cloudDeckMark'

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
   * The column's unit where the label cannot carry it. Null where it does,
   * which is every family today: precipitation's and snowfall's labels name
   * the rate, and their window total stands in the Total column without one.
   */
  unit: string | null
  /** Where the number links, matching the table cell's Windy link. */
  href: string | null
  /**
   * Whether this is the number the report ranks by, which the grid marks so
   * the card says why its destination stands where it does.
   */
  ranked: boolean
}

/**
 * One label and its values.
 *
 * A group is a metric family. `single` is what decides the shape: one value is
 * a line of its own in the grid, and two or more spread across the aggregate
 * columns (`popupGrid`).
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
  /**
   * The elevation with its unit, as `12,281 ft`, or null where the reader hid
   * the column or the place has none. It sits on the type's line rather than
   * in the grid because it is a fact about the place, not a forecast (TJ,
   * 2026-10-08).
   */
  elevation: string | null
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
 * The unit a family's label names.
 *
 * Every visible column's, when they agree. Precipitation and snowfall do not:
 * each window total is inches and the other three columns are a rate. Their
 * label names the rate, `Precipitation (in/hr)`, and the total stands in the
 * Total column with no unit, which a reader takes from the column (TJ,
 * 2026-10-08: "We can probably trust users to interpret this"). Only where
 * the rates themselves disagree does each value keep its own, and no family
 * does that today.
 */
function groupUnit(cols: ColDef[]): string | null {
  const units = cols.map((c) => c.unit ?? '')
  if (units.every((u) => u === units[0])) return units[0]
  const rates = cols.filter((c) => aggregateToken(c.key as SortBy) !== 'total').map((c) => c.unit ?? '')
  return rates.length > 0 && rates.every((u) => u === rates[0]) ? rates[0] : null
}

/**
 * The popup's groups, alphabetical by label.
 *
 * Which families appear follows the table's columns, but not their order: the
 * card lists them A to Z whatever the ranking or the reader's column order
 * (TJ, 2026-10-08, replacing the first-appearance order of #370, which put
 * the ranked family first), so a reader finds a family in the same place on
 * every card. Within a family the aggregates are the grid's fixed columns.
 *
 * Four column kinds never become a group. `name` is the popup's title.
 * `type`, the elevation and the model ride in the band above the rule, where
 * TJ moved them.
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
    /** The key the report ranks by, whose cell the grid marks. */
    rankedBy?: SortBy | null
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
      key === ELEVATION_COL.key ||
      key === WILDFIRE_KEY ||
      key === CLOSURE_KEY ||
      key === MODEL_KEY
    )
      continue
    const bucket = LEAD_KEYS.has(key) ? key : familyOf(key)
    groups.set(bucket, [...(groups.get(bucket) ?? []), col])
  }

  const rowModel = (row as ModelRow).modelId ?? context.modelId
  const rankedFamily = context.rankedBy ? familyOf(context.rankedBy) : null
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
        // The ranked key's own cell. A family showing one number is marked
        // whole: a Current lookup collapses every family to its Avg column,
        // so a ranking on Max has no cell of its own there, and its one
        // number is the one the ranking read.
        ranked: col.key === context.rankedBy || (cols.length === 1 && bucket === rankedFamily),
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
  // Alphabetical by label, whatever the ranking or the table's column order
  // (TJ, 2026-10-08), so a family stands in the same place on every card.
  return out.sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }))
}

/**
 * The type, the elevation and the model, for the band under the title.
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
  const elevationCol = columns.find((c) => c.key === ELEVATION_COL.key)
  return {
    type: typeCol ? (typeCol.format ? typeCol.format(row.type) : row.type) : null,
    model: modelShown ? ((row as ModelRow).modelLabel ?? modelFallbackLabel ?? null) : null,
    elevation:
      elevationCol && row.elevation_ft != null
        ? `${elevationCol.format ? elevationCol.format(row.elevation_ft) : row.elevation_ft} ${ELEVATION_UNIT}`
        : null,
  }
}

/** The elevation column's unit, which its label spells as `Elevation (ft)`. */
const ELEVATION_UNIT = 'ft'

/** A number in the grid, and whether it is the one the report ranks by. */
export type PopupGridCell = { text: string; href: string | null; ranked: boolean }

/** A value in the grid, or an aggregate the reader's columns leave out. */
export type PopupCell = PopupGridCell | null

/**
 * One line of the popup's grid (TJ, 2026-10-08).
 *
 * - `value`: one number for the line, standing across the Min, Max and Avg
 *   columns. Every family over a Current lookup, a family narrowed to one
 *   column, and a cloud deck that held at one bound all window.
 * - `aggregates`: one cell per column, the window total last.
 */
export type PopupGridRow =
  | { kind: 'value'; label: string; cell: PopupGridCell }
  | { kind: 'aggregates'; label: string; cells: PopupCell[] }

/** The popup's body as a grid: aggregate column headings, then the lines. */
export type PopupGrid = { columns: string[]; rows: PopupGridRow[] }

/**
 * The aggregates that become columns, in one order for every family. A grid
 * cannot keep each family's own column order the way the stacked lines did,
 * so it takes the order most families already have, and an AQI ranking's Avg
 * moves from first to last (TJ chose the grid, 2026-10-08). The window total
 * is the last column, filled for precipitation and snowfall alone (TJ,
 * 2026-10-08, rather than a line of its own above their rates).
 */
const GRID_AGGREGATES: readonly string[] = [
  AGGREGATE.minimum,
  AGGREGATE.maximum,
  AGGREGATE.average,
  AGGREGATE.total,
]

/**
 * The groups laid out as a grid: a row per family, a column per aggregate
 * (TJ, 2026-10-08, replacing the stacked heading-and-values lines at every
 * width). A column appears only when some family shows that aggregate, so a
 * reader who hid every Avg gets no Avg column, and a Current lookup, where
 * each family is one number, gets none: every line is then a label and its
 * value.
 */
export function popupGrid(groups: readonly PopupGroup[]): PopupGrid {
  const shown = new Set(
    groups.filter((g) => !g.single).flatMap((g) => g.values.map((v) => v.aggregate ?? '')),
  )
  const columns = GRID_AGGREGATES.filter((a) => shown.has(a))
  const cellOf = (v: PopupValue): PopupGridCell => ({
    text: v.unit ? `${v.text} ${v.unit}` : v.text,
    href: v.href,
    ranked: v.ranked,
  })
  const rows: PopupGridRow[] = []
  for (const g of groups) {
    if (g.single) {
      rows.push({ kind: 'value', label: g.label, cell: cellOf(g.values[0]) })
      continue
    }
    const cells = columns.map((a) => {
      const v = g.values.find((x) => x.aggregate === a)
      return v ? cellOf(v) : null
    })
    // A deck that held at one edge of the walk all window prints the same
    // bound in Min, Max and Avg, and says it once across them. Three of them
    // side by side were wider than the card, and wrapped every label
    // (measured 2026-10-08). The deck has no total, so nothing is lost. The
    // one cell stays marked when the ranking read any of the three.
    const spread = cells.filter((_, i) => columns[i] !== AGGREGATE.total)
    const first = spread[0]
    if (
      first &&
      spread.length > 1 &&
      isCloudDeckMark(first.text) &&
      spread.every((c) => c?.text === first.text)
    ) {
      rows.push({ kind: 'value', label: g.label, cell: { ...first, ranked: spread.some((c) => c?.ranked) } })
      continue
    }
    rows.push({ kind: 'aggregates', label: g.label, cells })
  }
  return { columns, rows }
}
