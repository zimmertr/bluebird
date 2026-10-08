import type { DestinationResult } from '../types'
import { cellStyle, scaleFor } from './colors'
import type { ColDef } from './tableColumns'
import type { ModelRow } from './modelCompare'
import {
  FIRE_UNAVAILABLE_NOTE,
  FIRE_UNCOVERED_NOTE,
  type FireProximityStatus,
  type FireWarning,
  fireCellText,
  fireWarningText,
} from './fireProximity'
import {
  CLOSURE_UNAVAILABLE_NOTE,
  CLOSURE_UNCOVERED_NOTE,
  type ClosureProximityStatus,
  type ClosureWarning,
  closureCellText,
  closureWarningText,
} from './closureProximity'
import { FREEZE_UNAVAILABLE_NOTE, isFreezeKey } from './freezingLevel'
import { isUnavailableKey, unavailableCellText } from './unavailableCell'
import { extremeHourMs, windyUrl } from './windy'
import { isPeakKind } from './geocode'
import type { PendingDestination } from './customList'
import { geoKey } from './points'

// What a results-table cell SAYS, apart from how it is drawn. The row
// component in ResultsTableRow.tsx is the markup; every decision about which
// text, which hover sentence, which colour and which link a cell carries is
// here, where the node-env suite can reach it without rendering a table.

/** The wildfire cell's text, and the hover sentence an unlinked one carries. */
export function fireCell(
  status: FireProximityStatus,
  warning: FireWarning | undefined,
  uncovered: boolean,
): { text: string; note: string | null } {
  // A failed check marks every row N/A, the same mark as an uncovered row,
  // because both mean "no answer for this row"; the note is what tells the
  // two causes apart.
  const note =
    status === 'unavailable'
      ? FIRE_UNAVAILABLE_NOTE
      : status === 'ready' && warning
        ? fireWarningText(warning)
        : status === 'ready' && uncovered
          ? FIRE_UNCOVERED_NOTE
          : null
  const text = status === 'unavailable' ? 'N/A' : fireCellText(warning, uncovered)
  return { text, note }
}

/**
 * The Closure column's text and hover sentence: `fireCell`'s rules for the
 * closure check, so the two flag columns read their three states one way.
 */
export function closureCell(
  status: ClosureProximityStatus,
  warning: ClosureWarning | undefined,
  uncovered: boolean,
): { text: string; note: string | null } {
  const note =
    status === 'unavailable'
      ? CLOSURE_UNAVAILABLE_NOTE
      : status === 'ready' && warning
        ? closureWarningText(warning)
        : status === 'ready' && uncovered
          ? CLOSURE_UNCOVERED_NOTE
          : null
  const text = status === 'unavailable' ? 'N/A' : closureCellText(warning, uncovered)
  return { text, note }
}

/**
 * The Model column: which model answered this row. A row no comparison tagged
 * reads the model the analysis itself ran, because a dash there would say the
 * row came from nowhere.
 */
export function modelCellText(row: DestinationResult, fallback: string | null | undefined): string {
  return (row as ModelRow).modelLabel ?? fallback ?? '—'
}

/**
 * A metric that declined to answer for a reason that is not the weather: the
 * model publishes no freezing level. Null when the cell has a number to print.
 *
 * The hover text names the cause because it is one a reader can act on: the
 * model is a control in the panel (TJ, 2026-09-22).
 */
export function unavailableCell(key: string, raw: unknown): { text: string; cause?: string } | null {
  const text = isUnavailableKey(key) ? unavailableCellText(raw) : null
  if (text === null) return null
  return { text, cause: isFreezeKey(key) ? FREEZE_UNAVAILABLE_NOTE : undefined }
}

/**
 * The printed value: the column's own format, or the dash a missing hour gets.
 * A null never reaches a formatter, `popupRows.ts`'s rule and for its reason:
 * snowfall's is precipitation's, which would print a null as zeros, a number
 * the forecast never gave (#678).
 */
export function cellText(col: ColDef, raw: unknown): string {
  if (raw == null) return '—'
  return col.format ? col.format(raw) : String(raw)
}

/**
 * The inline colour of a ranked family's cell, or undefined for every other
 * column. Each coloured cell scores the number printed in it against the scale
 * its own column is measured on, so the spread across a family's columns is
 * what the colour shows.
 */
export function cellColor(
  key: string,
  raw: unknown,
  coloredGroup: ReadonlySet<string>,
  pointSample: boolean,
): { backgroundColor: string; color: string } | undefined {
  const scale = coloredGroup.has(key) ? scaleFor(key, pointSample) : null
  return scale && raw != null ? cellStyle(raw as number, scale) : undefined
}

/**
 * Where a metric cell's Windy link goes: this row's model and the hour this
 * cell's number came from. A compared row names its own model, which is the
 * whole point of the Model column beside it. `layer` is the column's Windy
 * layer, which the caller has checked the column has.
 */
export function windyCellUrl(
  row: DestinationResult,
  key: string,
  layer: string,
  modelId: string | null | undefined,
  times: readonly number[] | undefined,
): string {
  const at = extremeHourMs(key, row.series, row.series_times ?? times ?? [])
  return windyUrl({
    latitude: row.latitude,
    longitude: row.longitude,
    layer,
    modelId: (row as ModelRow).modelId ?? modelId,
    atMs: at,
  })
}

/**
 * The destination's place in the ranking, which every table row carries
 * (`useTableView` stamps it before a header sort, and a comparison's rows
 * repeat it down each destination's group). The position is only the fallback
 * for a row handed in without one.
 */
export function rankText(row: DestinationResult, index: number): string {
  return String((row as ModelRow).rank ?? index + 1)
}

/**
 * One React key per displayed row, the same for a destination wherever a sort
 * puts it. Keyed by position, a sort would hand every row a new key, and React
 * would rebuild the whole body where it can move the rows it already has. A
 * comparison repeats a destination once per model, so the model joins the
 * key; a second row at one coordinate and model gets a counter, so no two keys
 * are ever the same.
 */
export function rowKeys(rows: readonly DestinationResult[]): string[] {
  const seen = new Map<string, number>()
  return rows.map((row) => {
    const base = `${geoKey(row.latitude, row.longitude)}|${(row as ModelRow).modelId ?? ''}`
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return n === 0 ? base : `${base}#${n}`
  })
}

/**
 * A pending destination as the chart selection reads it. The chart keys on the
 * coordinate, so a pending row's box pre-selects the line an analysis will
 * later draw for it.
 */
export function pendingChartRow(d: PendingDestination): DestinationResult {
  return { name: d.name, latitude: d.latitude, longitude: d.longitude } as DestinationResult
}

/** A pending destination as the external map link reads it. */
export function pendingLinkRow(d: PendingDestination): DestinationResult {
  return {
    name: d.name,
    type: isPeakKind(d.kind ?? '') ? 'peak' : 'custom',
    osm_id: d.osmId ?? null,
    latitude: d.latitude,
    longitude: d.longitude,
  } as DestinationResult
}
