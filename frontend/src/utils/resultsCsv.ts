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
import { DATA_SOURCES } from './dataSources'
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
 * Miles to the nearest active fire, or an empty cell.
 *
 * No threshold test: useFireProximity only admits warnings within
 * FIRE_WARN_MILES, so presence in the map is the condition. An empty cell here
 * means the check ran and found nothing within that radius, which is only true
 * because the caller withholds the map entirely when it did not run.
 */
function fireCell(row: DestinationResult, warnings: ReadonlyMap<string, FireWarning>): string {
  const warning = warnings.get(fireKey(row.latitude, row.longitude))
  return warning ? warning.miles.toFixed(1) : ''
}

/**
 * One supplier's credit line, composed from its DATA_SOURCES entry.
 *
 * Only the lead-in phrase lives here; the name, license and license URI come
 * from the one list the privacy pages render and NOTICES.md transcribes, so a
 * relicense or a link change cannot leave the export crediting the old terms.
 * The throw is for a test to hit, not a user: a renamed entry breaks the
 * lookup at build-and-test time rather than silently dropping a credit.
 */
function credit(lead: string, sourceName: string, suffix = ''): string {
  const s = DATA_SOURCES.find((d) => d.name === sourceName)
  if (!s?.license || !s.licenseHref) throw new Error(`no licensed data source named ${sourceName}`)
  return `${lead} ${s.name}${suffix}, ${s.license} (${s.licenseHref})`
}

/**
 * The supplier credits the licenses require to travel with the data (#258).
 *
 * CC BY 4.0 section 3(a)(1)(C) asks for the credit with every copy of the
 * material, and a ranked table of OpenStreetMap places is a derived product
 * under ODbL: the screen carrying the credits does not cover a file read
 * detached from it. They land BELOW the data, behind one blank row, so a
 * spreadsheet still reads the first row as the column titles and the numbers
 * as a table. One cell per line; the commas inside are quoted away by
 * escapeCell like any other cell.
 *
 * Only suppliers the file actually used appear: NIFC is credited exactly when
 * the wildfire column is present, and CAMS is absent because its figures reach
 * the file through Open-Meteo, which is the credit its arrangement asks for.
 */
function creditRows(fireColumn: boolean): string[][] {
  const rows = [
    [credit('Weather data by', 'Open-Meteo')],
    [credit('Destination data ©', 'OpenStreetMap', ' contributors')],
  ]
  if (fireColumn) rows.push([credit('Wildfire data by', 'NIFC')])
  return rows
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
 *
 * The file ends with the supplier credits behind one blank row; see
 * creditRows above for why they are in the file at all.
 */
export function buildResultsCsv(
  rows: readonly DestinationResult[],
  columns: readonly ColDef[],
  fireWarnings: ReadonlyMap<string, FireWarning> | null,
  pendingRows: readonly DestinationResult[] = [],
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
    if (fireWarnings) cells.push(fireCell(row, fireWarnings))
    return cells
  })
  const doc = [header, ...pendingBody, ...body, [''], ...creditRows(fireWarnings != null)]
  return BOM + doc.map((r) => r.map(escapeCell).join(',')).join(CRLF) + CRLF
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
