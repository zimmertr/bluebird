import type { DestinationResult } from '../types'
import { type PendingDestination, pendingAsResult } from './customList'
import type { FireProximityStatus, FireWarning } from './fireProximity'
import { normalizeWindow } from './forecastWindow'
import type { ModelEnd } from './modelCompare'
import { buildResultsCsv, csvFilename } from './resultsCsv'
import { type ColDef, WILDFIRE_KEY, applyColumnOrder, withModelColumn } from './tableColumns'

export interface ReportCsvInputs {
  /** The table's rows, in the order on screen. */
  rows: readonly DestinationResult[]
  /** Every column the report carries, before visibility, the Model column and the reader's order. */
  columns: readonly ColDef[]
  /** Whether the Model column is drawn. */
  modelColumnOn: boolean
  /** The order the reader dragged the columns into, or null for the automatic one. */
  columnOrder: readonly string[] | null
  /** The columns the table shows, which decides whether the wildfire column goes over. */
  visibleKeys: ReadonlySet<string>
  /** The wildfire check: where it stands, what it found, and what it could not cover. */
  fireStatus: FireProximityStatus
  fireWarnings: ReadonlyMap<string, FireWarning>
  fireUncovered: ReadonlySet<string>
  /** The committed window as the snapshot recorded it, or null before any analysis. */
  window: { startMs: number; endMs: number } | null
  /** Named destinations no analysis has covered. */
  pending: readonly PendingDestination[]
  /** The model every row came from when only one did. */
  modelLabel: string | null
  /** The compared models that end inside the window. */
  modelEnds: readonly ModelEnd[]
}

/**
 * The displayed report as CSV text (#125). Everything that decides what the
 * file contains is already resolved by the caller, so this only hands settled
 * values to the formatter.
 */
export function reportCsv({
  rows,
  columns,
  modelColumnOn,
  columnOrder,
  visibleKeys,
  fireStatus,
  fireWarnings,
  fireUncovered,
  window,
  pending,
  modelLabel,
  modelEnds,
}: ReportCsvInputs): string {
  return buildResultsCsv(
    rows,
    // The same insertion the table makes. The file is given the same rows,
    // so without it a comparison writes each destination once per model with
    // nothing saying which model each line is.
    // The same columns the table shows, in the same order: the file leaves
    // in the order that is on screen (#125), and a reader's reorder is no
    // different from a sort in that respect.
    applyColumnOrder(withModelColumn(columns, modelColumnOn), columnOrder),
    // The warnings go over only when the lookup actually produced them.
    // Anything else is `null`, which drops the wildfire column from the file
    // rather than filling it with blanks that would read as "checked, nothing
    // near". Null also when the column is hidden: a file must not carry a
    // column the screen does not show.
    fireStatus === 'ready' && visibleKeys.has(WILDFIRE_KEY) ? fireWarnings : null,
    {
      // The window the numbers in the file describe (#444), taken from the
      // analysis snapshot rather than from the panel: the calendar can have
      // moved on since the report committed, and the file must name the days
      // that were fetched. Resolved first, because the snapshot records the
      // request's raw timestamps and a Current analysis is `start === end`
      // there: the file writes the hour that was sampled, not a window of no
      // width at all.
      window: window ? normalizeWindow(window.startMs, window.endMs) : null,
      // The table draws pending (un-analyzed) rows above the ranked ones, so
      // the file carries them too: identity columns filled, Rank and every
      // metric blank. Before the first analysis this is the whole file.
      pendingRows: pending.map(pendingAsResult),
      fireUncovered,
      modelLabel,
      // The file states where each short model ends, where the screen marks
      // the cells: a spreadsheet can compute the covered hours from a date.
      modelEnds,
    },
  )
}

/**
 * Hand CSV text to the browser as a download.
 *
 * The object URL is revoked on the next frame rather than immediately:
 * click() only queues the download, and Safari has historically cancelled it
 * if the URL is released in the same task.
 */
export function downloadCsv(csv: string, now: Date): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = csvFilename(now)
  link.click()
  requestAnimationFrame(() => URL.revokeObjectURL(url))
}
