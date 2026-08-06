// The results table as a file (#125).
//
// The file always carries the full column set from the mode (point sample or
// window); the screen narrows via the column visibility picker. Nothing here
// fetches or re-derives: the caller hands over the rows already in display
// order and the columns for the file (the full analyzed set), and this turns
// them into text. That split is deliberate. What the table shows and what the
// file carries are answered in exactly one place (App.tsx), and a formatter
// that recomputed either would be a second answer that could disagree.
//
// It is also deliberately DOM-free. Vitest runs this repo in the node
// environment with no jsdom, so a module reaching for Blob or document could
// not be unit-tested at all; the download itself is seven lines in App.tsx.

import { DestinationResult } from '../types'
import { ColDef } from './tableColumns'
import { FireWarning, fireKey } from './fireProximity'

/**
 * The leading position column, named rather than numbered.
 *
 * The table draws this header as "#", which a file cannot: a header row
 * beginning with "#" is silently swallowed by every reader that treats it as a
 * comment (pandas' `comment='#'`, R's `read.csv` `comment.char`), taking the
 * column names with it and promoting the first destination to the header.
 */
const RANK_HEADER = 'Rank'

/**
 * Distance to the nearest active wildfire, which the table carries as the ⚠️
 * beside a name and its tooltip. A file has nowhere to hover, so the number
 * that the tooltip spells out becomes a column of its own.
 *
 * "Nearby" rather than plain "Distance" because the column is not a distance
 * to everything: it is populated only within the warning radius, and blank
 * beyond it. A header reading "Wildfire Distance" invites the blank cells to be
 * read as an unknown or a zero, when what they mean is "no active fire is
 * near". The word carries the threshold that the numbers alone cannot.
 */
const FIRE_HEADER = 'Nearby Wildfire (mi)'

/**
 * Byte-order mark.
 *
 * Excel on Windows reads a BOM-less file as the system code page, which turns
 * the degree sign and the separator metrics.ts puts in every header into
 * mojibake. Sheets, LibreOffice and every CSV library skip a leading BOM.
 */
const BOM = '﻿'

/** RFC 4180 says CRLF, and it is what Excel writes. Readers accept either. */
const CRLF = '\r\n'

/**
 * Quote a cell only where the format requires it, and escape by doubling.
 *
 * A cell that BEGINS with "=", "+", "@", a tab or a carriage return first gains
 * a leading apostrophe. Excel, Sheets and LibreOffice all read those leads as a
 * live formula, and a destination name is not always written by the person who
 * opens the file: it can arrive through a shared link or a public OSM edit, so
 * an unprefixed lead hands a stranger a command that runs on open (#254). The
 * apostrophe is the spreadsheet convention for "this is text", which is the
 * least the defense can alter.
 *
 * A bare leading "-" is deliberately NOT prefixed. It is not a formula lead on
 * its own in any of the three, and a destination with no name falls back to its
 * coordinates, so every southern-hemisphere coordinate row starts with "-"; a
 * prefix there would corrupt the one field that identifies the row.
 */
function escapeCell(value: string): string {
  const guarded = /^[=+@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded
}

/**
 * One cell, as text.
 *
 * The null check comes first so a missing value is an empty cell rather than
 * the dash the table draws or the "NaN" a formatter would produce. A blank cell
 * is what a spreadsheet reads as "no value"; anything else becomes text in a
 * numeric column and poisons every average computed over it.
 */
function cell(row: DestinationResult, col: ColDef): string {
  const raw = row[col.key]
  if (raw == null) return ''
  const project = col.csv ?? col.format
  return project ? project(raw) : String(raw)
}

/**
 * Miles to the nearest active fire, an empty cell, or N/A.
 *
 * No threshold test: useFireProximity only admits warnings within
 * FIRE_WARN_MILES, so presence in the map is the condition. An empty cell here
 * means the check ran and found nothing within that radius, which is only true
 * because the caller withholds the map entirely when it did not run. N/A is
 * the third state (#256): the destination sits outside the fire dataset's
 * US-only coverage, so it was never checked, and a blank there would assert
 * a clear check the data cannot make.
 */
function fireCell(
  row: DestinationResult,
  warnings: ReadonlyMap<string, FireWarning>,
  uncovered: ReadonlySet<string>,
): string {
  const key = fireKey(row.latitude, row.longitude)
  if (uncovered.has(key)) return 'N/A'
  const warning = warnings.get(key)
  return warning ? warning.miles.toFixed(1) : ''
}

/**
 * The displayed report as CSV text.
 *
 * `rows` must already be in display order and `columns` must already be the set
 * the table is drawing, both of which the caller has on hand.
 *
 * `fireWarnings` is `null` when the wildfire lookup has no trustworthy answer:
 * still in flight, or failed. The column is then **left out of the file
 * entirely** rather than written empty. The distinction is the whole point. On
 * screen an empty flag column is self-correcting, because the ⚠️ appears a
 * second later and the reader watches it happen; a file is read once, detached
 * from the app, with nothing around it to say the check never ran. A column of
 * blanks in that setting is not missing data, it is an assertion that every
 * destination was checked and none is near a fire. An absent column asserts
 * nothing, which is the honest thing to say when nothing is known.
 */
export function buildResultsCsv(
  rows: readonly DestinationResult[],
  columns: readonly ColDef[],
  fireWarnings: ReadonlyMap<string, FireWarning> | null,
  pendingRows: readonly DestinationResult[] = [],
  fireUncovered: ReadonlySet<string> = new Set(),
): string {
  const header = [RANK_HEADER, ...columns.map((c) => c.label)]
  if (fireWarnings) header.push(FIRE_HEADER)
  // Pending rows first with an empty Rank, mirroring the table, which draws
  // un-analyzed destinations above the ranked ones with "—" in the # column.
  // Empty rather than a dash for the same reason null metrics become empty
  // cells: a spreadsheet reads blank as "no value" and text as data.
  const pendingBody = pendingRows.map((row) => {
    const cells = ['', ...columns.map((c) => cell(row, c))]
    if (fireWarnings) cells.push('')
    return cells
  })
  const body = rows.map((row, i) => {
    const cells = [String(i + 1), ...columns.map((c) => cell(row, c))]
    if (fireWarnings) cells.push(fireCell(row, fireWarnings, fireUncovered))
    return cells
  })
  return (
    BOM + [header, ...pendingBody, ...body].map((r) => r.map(escapeCell).join(',')).join(CRLF) + CRLF
  )
}

/**
 * A filename stamped with local wall-clock time.
 *
 * Local rather than UTC because the stamp answers "which download is this",
 * and the user reads it against the clock on their own wall. Sortable order
 * within a day, and no character any filesystem objects to.
 */
export function csvFilename(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return `bluebird-results-${date}-${pad(now.getHours())}${pad(now.getMinutes())}.csv`
}
