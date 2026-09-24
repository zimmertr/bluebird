// The results table as a file (#125).
//
// The file always carries the full column set from the mode (point sample or
// window); the screen narrows via the column visibility picker. Nothing here
// fetches or re-derives: the caller hands over the rows already in display
// order and the columns for the file (the full analyzed set), and this turns
// them into text. That split is deliberate. What the table shows and what the
// file carries are answered in exactly one place (`useTableView`), and a formatter
// that recomputed either would be a second answer that could disagree.
//
// It is also deliberately DOM-free. Vitest runs this repo in the node
// environment with no jsdom, so a module reaching for Blob or document could
// not be unit-tested at all; the download itself is `downloadCsv` in exportCsv.ts.

import { DestinationResult } from '../types'
import { ColDef, MODEL_KEY, WILDFIRE_COL, WILDFIRE_KEY } from './tableColumns'
import { isPartialRow, PARTIAL_COVERAGE_NOTE, type ModelEnd, type ModelRow } from './modelCompare'
import { DATA_SOURCES } from './dataSources'
import { FireWarning } from './fireProximity'
import type { ResolvedWindow } from './forecastWindow'
import { geoKey } from './points'
import { isSnowDepthKey, snowCellText } from './snowCeiling'

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
 * Distance to the nearest active wildfire. The table draws the same column
 * under the same header (WILDFIRE_COL, so screen and file cannot disagree on
 * the name); it is appended here rather than riding in `columns` because its
 * value lives in the fire lookup's map, not on the row, and because its
 * presence is a statement of its own — see buildResultsCsv below.
 */
const FIRE_HEADER = WILDFIRE_COL.label

/**
 * The two ends of the analyzed forecast window (#444).
 *
 * Labels in a metadata block below the data, not column headers: a value that
 * is the same on every row is something the file says about itself rather than
 * a measurement of any one destination (TJ, 2026-09-17). The credits block
 * below is already that part of the file, so the window stands with it.
 *
 * Here rather than in metrics.ts because they name no metric: they say WHEN
 * the numbers above them apply, which is the one thing the file could not say
 * before. The filename carries the download time, not the window, so a file
 * opened later or passed to somebody else described days nothing in it named.
 */
const WINDOW_START_LABEL = 'Forecast start'
const WINDOW_END_LABEL = 'Forecast end'

/**
 * Where one compared model's forecast ends, when that is inside the window
 * (#493). The row above's noun with the model named after it, so a spreadsheet
 * reads it as the same kind of value and can compute the hours the model's
 * aggregates cover. The `*` that points at the footnote sits on the Model cell
 * rather than on those aggregates (#508): a mark inside a number would turn
 * the cell into text and stop the column sorting and averaging.
 */
const modelEndLabel = (modelLabel: string) => `${WINDOW_END_LABEL} (${modelLabel})`

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
 * The null check comes first so a missing value is the column's own empty cell
 * rather than the dash the table draws or the "NaN" a formatter would produce.
 * That empty cell is blank for almost every column, because blank is what a
 * spreadsheet reads as "no value" and anything else becomes text in a numeric
 * column and poisons every average computed over it. The freezing level is the
 * exception and declares its own mark (`csvNull`): its blank would not mean
 * "no value measured" but "this model measures no such thing", which is a
 * claim about the file's own columns and has to survive being read detached
 * from the app.
 */
function cell(row: DestinationResult, col: ColDef, modelFallback?: string | null): string {
  // The wildfire column never reaches here (this module appends it with its
  // own cell), but its key is virtual and must not index a row.
  if (col.key === WILDFIRE_KEY) return ''
  // The model column's key is virtual too, and its value rides beside the row
  // rather than on it. A file carries it whenever the screen does, because a
  // file of eight rows per destination that did not say which was which would
  // be unreadable detached from the app.
  // A model that ends inside the window carries the table's mark here, on the
  // one text cell of the row that names it, so every number stays a number.
  if (col.key === MODEL_KEY) {
    const label = (row as ModelRow).modelLabel ?? modelFallback ?? ''
    return isPartialRow(row) ? `${label}*` : label
  }
  const raw = row[col.key]
  if (raw == null) return col.csvNull ?? ''
  // A depth at the source file's ceiling says so here too, ungrouped like
  // every other number in the file. The bare ceiling in a spreadsheet reads as
  // a measurement, which is the one thing it is not.
  const clipped = isSnowDepthKey(col.key as string) ? snowCellText(raw, false) : null
  if (clipped !== null) return clipped
  const project = col.csv ?? col.format
  return project ? project(raw) : String(raw)
}

/**
 * Miles to the nearest active fire, an empty cell, or N/A.
 *
 * No threshold test: useFireProximity only admits warnings within
 * FIRE_WARN_MILES, so presence in the map is the condition. An empty cell
 * means the check ran and cleared the row (the table renders the same state
 * as its dash), which is only true because the caller withholds the map
 * entirely when the check did not run. `N/A` is the row that was never
 * checked (#256): outside the fire dataset's US-only coverage, where a blank
 * would assert a clear check the data cannot make. The one divergence from
 * fireCellText is the bare number: text beside it would turn every warned
 * cell into a string.
 */
function fireCell(
  row: DestinationResult,
  warnings: ReadonlyMap<string, FireWarning>,
  uncovered: ReadonlySet<string>,
): string {
  const key = geoKey(row.latitude, row.longitude)
  if (uncovered.has(key)) return 'N/A'
  const warning = warnings.get(key)
  return warning ? warning.miles.toFixed(1) : ''
}

/**
 * One supplier's credit, as the two cells every row below the data wears.
 *
 * The license URI stands in its own cell rather than in parentheses at the end
 * of the sentence. A license asks for the URI beside the data, and a cell
 * holding nothing but a URL is a link a spreadsheet makes clickable, where the
 * same URL inside a sentence is text a reader has to retype (TJ, 2026-09-17).
 * It is also the shape the forecast-window rows above it wear, so everything
 * the file says about itself reads as one label and one value.
 *
 * Only the lead-in phrase lives here; the name, license and license URI come
 * from the one list the privacy pages render and NOTICES.md transcribes, so a
 * relicense or a link change cannot leave the export crediting the old terms.
 * The throw is for a test to hit, not a user: a renamed entry breaks the
 * lookup at build-and-test time rather than silently dropping a credit.
 */
function credit(lead: string, sourceName: string, suffix = ''): string[] {
  const s = DATA_SOURCES.find((d) => d.name === sourceName)
  if (!s?.license || !s.licenseHref) throw new Error(`no licensed data source named ${sourceName}`)
  return [`${lead} ${s.name}${suffix}, ${s.license}`, s.licenseHref]
}

/**
 * The supplier credits the licenses require to travel with the data (#258).
 *
 * CC BY 4.0 section 3(a)(1)(C) asks for the credit with every copy of the
 * material, and a ranked table of OpenStreetMap places is a derived product
 * under ODbL: the screen carrying the credits does not cover a file read
 * detached from it. They land BELOW the data, behind one blank row, so a
 * spreadsheet still reads the first row as the column titles and the numbers
 * as a table. Two cells per line, the words and then the license URI, which is
 * the shape the forecast-window rows above them wear; the comma inside the
 * words is quoted away by escapeCell like any other cell.
 *
 * Only suppliers the file actually used appear: NIFC is credited exactly when
 * the wildfire column is present, and CAMS is absent because its figures reach
 * the file through Open-Meteo, which is the credit its arrangement asks for.
 */
function creditRows(fireColumn: boolean): string[][] {
  const rows = [
    credit('Weather data by', 'Open-Meteo'),
    credit('Destination data ©', 'OpenStreetMap', ' contributors'),
  ]
  if (fireColumn) rows.push(credit('Wildfire data by', 'NIFC'))
  return rows
}

/**
 * An instant as local ISO 8601 with its UTC offset, to the minute.
 *
 * `2026-09-18T00:00-07:00`. ISO 8601 because a spreadsheet parses it as a date
 * rather than as text, and the offset because the same wall-clock hour means a
 * different instant in every zone: a file crosses zones the way it crosses
 * machines. Seconds are dropped because a window is chosen to the hour and a
 * point sample is floored to one, so a seconds field could only ever read `:00`
 * and invite a precision the numbers do not have.
 *
 * `timeZone` is injectable so the suite does not pass or fail on the zone the
 * machine running it is set to; the app leaves it undefined, which is the
 * reader's own zone and the same clock the window caption on screen is read
 * against.
 *
 * The offset is measured rather than read off a name: the zone's own wall clock
 * for that instant, minus the instant itself, which is the definition of an
 * offset and is what makes a DST day come out with two different ones.
 */
export function isoLocalMinute(ms: number, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    // h23 rather than hour12:false, which reports midnight as hour 24 on some
    // engines and would write an hour no ISO 8601 reader accepts.
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms))
  const at = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const [year, month, day, hour, minute] = [
    at('year'),
    at('month'),
    at('day'),
    at('hour'),
    at('minute'),
  ]
  const wall = Date.UTC(year, month - 1, day, hour, minute, at('second'))
  // Whole seconds on both sides, or a window carrying milliseconds would push
  // the offset off a whole minute.
  const offsetMin = Math.round((wall - Math.floor(ms / 1000) * 1000) / 60_000)
  const pad = (n: number) => String(Math.abs(n)).padStart(2, '0')
  const sign = offsetMin < 0 ? '-' : '+'
  const offset = `${sign}${pad(Math.trunc(offsetMin / 60))}:${pad(offsetMin % 60)}`
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}${offset}`
}

/**
 * Everything beyond the rows, the columns and the fire answer.
 *
 * An object rather than four more positional arguments: the call site read
 * `[], new Set(), 'NOAA GFS'` before the window joined it, which is three
 * values whose meaning is their position alone and which a fifth would have
 * made unreadable. The three that carried a default keep it, so a caller that
 * only has rows and columns still passes nothing.
 */
export interface CsvOptions {
  /**
   * The window the ranked rows describe, resolved (a point sample is an hour,
   * never `start === end`), or null before any analysis has committed. Null
   * writes no metadata block at all.
   */
  window?: ResolvedWindow | null
  /**
   * Destinations awaiting their first analysis. They carry identity columns
   * only: no rank and no metrics, because no forecast covers them.
   */
  pendingRows?: readonly DestinationResult[]
  /** Rows the fire check could not reach, by geoKey (#256). */
  fireUncovered?: ReadonlySet<string>
  /**
   * What the Model column reads for a row no comparison tagged: the model the
   * analysis itself ran. The column can be shown with one model selected, and
   * an empty cell there would say the row came from nowhere. Pending rows are
   * deliberately left out of it, having no forecast at all.
   */
  modelLabel?: string | null
  /**
   * The compared models that end inside the window, in the picker's order.
   * Each gets its own row after the window's end, even two that end together:
   * one row per model is what a reader looking up that model expects to find.
   */
  modelEnds?: readonly ModelEnd[]
  /** The zone the window rows are written in; the reader's own by default. */
  timeZone?: string
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
 * Below the data the file speaks about itself: the forecast window behind one
 * blank row, the partial-coverage footnote behind another when a row carries
 * the mark, then the supplier credits behind another (see creditRows above
 * for why those are in the file at all). The columns are therefore exactly the
 * ones a reader already knows, and a row copied out of the file carries no
 * repeated value pretending to be a measurement.
 */
export function buildResultsCsv(
  rows: readonly DestinationResult[],
  columns: readonly ColDef[],
  fireWarnings: ReadonlyMap<string, FireWarning> | null,
  options: CsvOptions = {},
): string {
  const {
    window = null,
    pendingRows = [],
    fireUncovered = new Set<string>(),
    modelLabel = null,
    modelEnds = [],
    timeZone,
  } = options
  const header = [RANK_HEADER, ...columns.map((c) => c.label)]
  if (fireWarnings) header.push(FIRE_HEADER)
  // The window as two label/value rows behind their own blank row, or nothing
  // at all. Nothing is what a file with no committed analysis writes: every
  // row in it is pending, no forecast covers any of them, and a label over an
  // empty cell would be the file asking a question rather than answering one.
  // The footnote follows the marks, and the marks ride the Model column: a
  // file without that column, or without a marked row, has nothing for the
  // note to explain.
  const marked = columns.some((c) => c.key === MODEL_KEY) && rows.some(isPartialRow)
  const windowRows = window
    ? [
        [''],
        [WINDOW_START_LABEL, isoLocalMinute(window.startMs, timeZone)],
        [WINDOW_END_LABEL, isoLocalMinute(window.endMs, timeZone)],
        ...modelEnds.map((m) => [modelEndLabel(m.label), isoLocalMinute(m.endMs, timeZone)]),
        // Behind its own blank row, so the note reads apart from the dates.
        ...(marked ? [[''], [PARTIAL_COVERAGE_NOTE]] : []),
      ]
    : []
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
    // The destination's rank, not the row's position. A comparison writes one
    // row per model, so counting positions numbered one destination's rows as
    // though they were several places — the defect the table's # column had.
    const rank = (row as ModelRow).rank ?? i + 1
    const cells = [String(rank), ...columns.map((c) => cell(row, c, modelLabel))]
    if (fireWarnings) cells.push(fireCell(row, fireWarnings, fireUncovered))
    return cells
  })
  const doc = [
    header,
    ...pendingBody,
    ...body,
    ...windowRows,
    [''],
    ...creditRows(fireWarnings != null),
  ]
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
  return `bluebird-forecast-results-${date}-${pad(now.getHours())}${pad(now.getMinutes())}.csv`
}
