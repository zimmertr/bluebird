import type { DestinationResult } from '../types'
import { type PendingDestination, pendingAsResult } from './customList'
import type { FireProximityStatus, FireWarning } from './fireProximity'
import type { ClosureProximityStatus, ClosureWarning } from './closureProximity'
import { normalizeWindow } from './forecastWindow'
import type { ModelEnd } from './model/modelCompare'
import { buildResultsCsv, csvFilename } from './results/resultsCsv'
import { type ColDef, withModelColumn } from './tableColumns'

export interface ReportCsvInputs {
  /** The table's rows, in the order on screen. */
  rows: readonly DestinationResult[]
  /** Every column a window can carry, before the Model column. */
  columns: readonly ColDef[]
  /** The wildfire check: where it stands, what it found, and what it could not cover. */
  fireStatus: FireProximityStatus
  fireWarnings: ReadonlyMap<string, FireWarning>
  fireUncovered: ReadonlySet<string>
  /** The closure check, on the same three terms (#550). */
  closureStatus: ClosureProximityStatus
  closureWarnings: ReadonlyMap<string, ClosureWarning>
  closureUncovered: ReadonlySet<string>
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
  fireStatus,
  fireWarnings,
  fireUncovered,
  closureStatus,
  closureWarnings,
  closureUncovered,
  window,
  pending,
  modelLabel,
  modelEnds,
}: ReportCsvInputs): string {
  return buildResultsCsv(
    rows,
    // Every column, in the standard order, whatever the table shows or the
    // reader dragged: a file is read by scripts, so its header is the same
    // every time. Model too, reading the analysis's own model when nothing is
    // compared.
    withModelColumn(columns, true),
    // A check that has not answered writes N/A in every row rather than a
    // blank, which would read as checked and clear.
    fireStatus === 'ready' ? fireWarnings : null,
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
      closureWarnings: closureStatus === 'ready' ? closureWarnings : null,
      closureUncovered,
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
