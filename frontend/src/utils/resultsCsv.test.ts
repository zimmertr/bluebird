import { describe, expect, it } from 'vitest'
import { buildResultsCsv, csvFilename } from './resultsCsv'
import { DATA_SOURCES } from './dataSources'
import { COLUMNS, WILDFIRE_COL, displayedColumns, withModelColumn } from './tableColumns'
import { FireWarning, fireKey } from './fireProximity'
import { DestinationResult } from '../types'

// Inline like the other suites: a full row with every field, so a test can
// override only the field it is about.
function row(over: Partial<DestinationResult> = {}): DestinationResult {
  return {
    name: 'Mount Rainier',
    type: 'peak',
    latitude: 46.8523,
    longitude: -121.7603,
    elevation_ft: 14411,
    osm_id: 'node/1',
    precip_total_in: 0.024,
    precip_avg_in_hr: 0.001,
    precip_min_in_hr: 0,
    precip_max_in_hr: 0.0034,
    temp_min_f: 21.4,
    temp_max_f: 38.2,
    temp_avg_f: 29.8,
    wind_min_mph: 4.1,
    wind_max_mph: 22.7,
    wind_avg_mph: 12.3,
    freeze_min_ft: null,
    freeze_max_ft: null,
    freeze_avg_ft: null,
    aqi_avg: 31,
    aqi_min: 44,
    aqi_max: 44,
    ...over,
  }
}

const NO_FIRES = new Map<string, FireWarning>()

/** The document as rows, with the BOM and the trailing terminator taken off. */
function lines(csv: string): string[] {
  return csv.replace(/^﻿/, '').replace(/\r\n$/, '').split('\r\n')
}

/** One row split on commas. Only safe for fixtures with no quoted cells. */
function cells(line: string): string[] {
  return line.split(',')
}

const WINDOW_COLUMNS = displayedColumns(false, 'precip_total_in')

describe('the file a spreadsheet opens', () => {
  it('leads with a byte-order mark so Excel reads the headers as UTF-8', () => {
    // Without it the degree sign and the separator in every header mojibake.
    expect(buildResultsCsv([row()], WINDOW_COLUMNS, NO_FIRES).charCodeAt(0)).toBe(0xfeff)
  })

  it('separates rows with CRLF and terminates the last one', () => {
    const csv = buildResultsCsv([row(), row({ name: 'Glacier Peak' })], WINDOW_COLUMNS, NO_FIRES)
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(csv).not.toMatch(/[^\r]\n/)
    // Header, two data rows, then the blank row and three credit lines.
    expect(lines(csv)).toHaveLength(7)
  })

  it('puts the headers in the first row, where a spreadsheet looks for them', () => {
    const header = cells(lines(buildResultsCsv([row()], WINDOW_COLUMNS, NO_FIRES))[0])
    expect(header[0]).toBe('Rank')
    expect(header[1]).toBe('Name')
    expect(header).toContain('Elevation (ft)')
  })

  // A header row beginning with "#" is silently swallowed by every reader that
  // defaults to "#" as a comment character, taking the column names with it.
  it('never begins a line with a comment character', () => {
    const csv = buildResultsCsv([row({ name: '# not a comment' })], WINDOW_COLUMNS, NO_FIRES)
    for (const line of lines(csv)) expect(line.startsWith('#')).toBe(false)
  })
})

describe('what the file carries', () => {
  it('numbers the rows from one, in the order it was given', () => {
    const csv = buildResultsCsv(
      [row({ name: 'First' }), row({ name: 'Second' }), row({ name: 'Third' })],
      WINDOW_COLUMNS,
      NO_FIRES,
    )
    const body = lines(csv).slice(1, 4)
    expect(body.map((l) => cells(l)[0])).toEqual(['1', '2', '3'])
    expect(body.map((l) => cells(l)[1])).toEqual(['First', 'Second', 'Third'])
  })

  // The module is handed rows already in display order and must not have an
  // opinion of its own; App owns the sort so the file matches the screen.
  it('does not reorder the rows it is given', () => {
    const csv = buildResultsCsv(
      [row({ name: 'Zebra', precip_total_in: 9 }), row({ name: 'Alpha', precip_total_in: 0 })],
      WINDOW_COLUMNS,
      NO_FIRES,
    )
    expect(cells(lines(csv)[1])[1]).toBe('Zebra')
  })

  it('withholds the coordinates and the identifier the table never shows', () => {
    const csv = buildResultsCsv([row()], WINDOW_COLUMNS, NO_FIRES)
    expect(csv).not.toContain('46.8523')
    expect(csv).not.toContain('-121.7603')
    expect(csv).not.toContain('node/1')
  })

  // The table draws pending (un-analyzed) rows above the ranked ones with "—"
  // for a rank; the file mirrors that as leading rows with an EMPTY Rank cell,
  // so a spreadsheet reads "no value" instead of text in a numeric column.
  // Before the first analysis this is the whole file.
  it('carries pending rows first, with an empty rank and blank metrics', () => {
    const pendingRow = {
      name: 'Somewhere New',
      type: 'custom',
      elevation_ft: null,
      latitude: 47,
      longitude: -121,
    } as DestinationResult
    const csv = buildResultsCsv([row({ name: 'Ranked' })], WINDOW_COLUMNS, NO_FIRES, [pendingRow])
    const body = lines(csv).slice(1)
    expect(cells(body[0])[0]).toBe('')
    expect(cells(body[0])[1]).toBe('Somewhere New')
    expect(cells(body[0])).toHaveLength(WINDOW_COLUMNS.length + 2)
    expect(cells(body[1])[0]).toBe('1')
    expect(cells(body[1])[1]).toBe('Ranked')
  })

  // A point sample covers one hour, so its triplets collapse to one column per
  // metric. Header and body must collapse together or every cell shifts.
  it('follows a point sample down to one column per metric', () => {
    const point = displayedColumns(true, 'precip_total_in')
    const csv = buildResultsCsv([row()], point, NO_FIRES)
    const [header, body] = lines(csv)
    expect(cells(header)).toHaveLength(point.length + 2)
    expect(cells(body)).toHaveLength(point.length + 2)
    expect(cells(header).length).toBeLessThan(WINDOW_COLUMNS.length + 2)
  })
})

describe('values a spreadsheet can compute over', () => {
  // toLocaleString() would put a thousands separator inside a comma-separated
  // cell, which survives quoting but lands as text in a numeric column.
  it('writes elevation as a bare number, not the grouped one on screen', () => {
    const csv = buildResultsCsv([row({ elevation_ft: 14411 })], WINDOW_COLUMNS, NO_FIRES)
    expect(csv).toContain('14411')
    expect(csv).not.toContain('14,411')
  })

  // Same case as elevation, and for the same reason: a freezing level is a
  // height in feet, grouped on screen and bare in the file.
  it('writes the freezing level as a bare number too', () => {
    const csv = buildResultsCsv(
      [row({ freeze_min_ft: 9843, freeze_max_ft: 10171, freeze_avg_ft: 10007 })],
      WINDOW_COLUMNS,
      NO_FIRES,
    )
    expect(csv).toContain('9843')
    expect(csv).not.toContain('10,171')
  })

  // The one column whose empty cell is not blank, and the same rule the
  // wildfire column's N/A follows: a blank asserts something. Everywhere else
  // it asserts "no value measured", which is true of a forecast that fell
  // short; here it would assert that the freezing level was measured and came
  // back empty, when the truth is that the chosen model publishes no such
  // variable at all. The file is read detached from the app, with nothing
  // around it to say which, so it carries the mark the screen shows.
  it('writes the screen mark for a freezing level the model does not publish', () => {
    const csv = buildResultsCsv([row()], WINDOW_COLUMNS, NO_FIRES)
    const freezeColumns = WINDOW_COLUMNS.filter((c) => c.key.startsWith('freeze_'))

    expect(freezeColumns).toHaveLength(3)
    expect(cells(lines(csv)[1]).filter((c) => c === 'N/A')).toHaveLength(3)
  })

  // A row the model DID answer writes numbers, so the mark above can only ever
  // mean the absence it names.
  it('writes no mark where the model answered', () => {
    const csv = buildResultsCsv(
      [row({ freeze_min_ft: 9843, freeze_max_ft: 10171, freeze_avg_ft: 10007 })],
      WINDOW_COLUMNS,
      NO_FIRES,
    )
    expect(csv).not.toContain('N/A')
  })

  it('keeps the precision the table displays rather than the float behind it', () => {
    const csv = buildResultsCsv([row({ precip_total_in: 0.1 + 0.2 })], WINDOW_COLUMNS, NO_FIRES)
    expect(csv).toContain('0.300')
    expect(csv).not.toContain('0.30000000000000004')
  })

  // The table draws a dash for a missing value. A dash in a numeric column is
  // text, and poisons every average computed over it.
  it('leaves a missing value empty rather than drawing the table dash', () => {
    const csv = buildResultsCsv(
      [row({ aqi_avg: null, aqi_max: null, elevation_ft: null })],
      WINDOW_COLUMNS,
      NO_FIRES,
    )
    expect(csv).not.toContain('—')
    expect(csv).not.toContain('NaN')
    expect(csv).not.toContain('null')
    expect(lines(csv)[1]).toMatch(/,,/)
  })
})

describe('quoting', () => {
  it('quotes a name containing the delimiter', () => {
    const csv = buildResultsCsv([row({ name: 'Camp Muir, WA' })], WINDOW_COLUMNS, NO_FIRES)
    expect(csv).toContain('"Camp Muir, WA"')
  })

  it('doubles an embedded quote', () => {
    const csv = buildResultsCsv([row({ name: 'The "Tooth"' })], WINDOW_COLUMNS, NO_FIRES)
    expect(csv).toContain('"The ""Tooth"""')
  })

  it('quotes a name carrying a line break rather than splitting the row', () => {
    const csv = buildResultsCsv([row({ name: 'Two\nLines' })], WINDOW_COLUMNS, NO_FIRES)
    expect(csv).toContain('"Two\nLines"')
    // Header and one data row; the trailer is the blank row and three credits.
    expect(lines(csv)).toHaveLength(6)
  })

  it('leaves a name needing no quotes unquoted', () => {
    expect(buildResultsCsv([row()], WINDOW_COLUMNS, NO_FIRES)).toContain('1,Mount Rainier,')
  })

  // A name is not always written by the person who opens the file: it can
  // arrive through a shared link or a public OSM edit, and a spreadsheet runs
  // a leading formula character on open. The apostrophe is the spreadsheet
  // convention for "this is text" (#254).
  describe('formula characters', () => {
    it.each([
      ['=', '=Ruth Mountain'],
      ['+', '+Lookout Point'],
      ['@', '@Camp Site'],
    ])('prefixes an apostrophe to a name leading with %s', (_lead, name) => {
      const csv = buildResultsCsv([row({ name })], WINDOW_COLUMNS, NO_FIRES)
      expect(csv).toContain(`'${name}`)
      expect(csv).not.toContain(`,${name}`)
    })

    it('guards a leading tab, which spreadsheets also read as a formula lead', () => {
      const csv = buildResultsCsv([row({ name: '\tIndented' })], WINDOW_COLUMNS, NO_FIRES)
      expect(csv).toContain("'\tIndented")
    })

    it('guards a leading carriage return and still quotes it as a line break', () => {
      const csv = buildResultsCsv([row({ name: '\rReturn' })], WINDOW_COLUMNS, NO_FIRES)
      expect(csv).toContain('"\'\rReturn"')
    })

    // A destination with no name falls back to its coordinates, so every
    // southern-hemisphere coordinate row starts with "-". A prefix there would
    // corrupt the one field that identifies the row.
    it('leaves a leading minus untouched, because coordinate names carry one', () => {
      const csv = buildResultsCsv([row({ name: '-45.123, 170.456' })], WINDOW_COLUMNS, NO_FIRES)
      expect(csv).toContain('"-45.123, 170.456"')
      expect(csv).not.toContain("'-45.123")
    })

    it('leaves a formula character that is not in the lead alone', () => {
      const csv = buildResultsCsv([row({ name: 'Hidden Lake @ Dusk' })], WINDOW_COLUMNS, NO_FIRES)
      expect(csv).toContain(',Hidden Lake @ Dusk,')
      expect(csv).not.toContain("'Hidden")
    })
  })
})

describe('the wildfire column', () => {
  const near = new Map<string, FireWarning>([
    [fireKey(46.8523, -121.7603), { miles: 5.28, name: 'Sourdough Fire' }],
  ])

  it('reports the distance for a flagged row', () => {
    const csv = buildResultsCsv([row()], WINDOW_COLUMNS, near)
    expect(lines(csv)[1].endsWith(',5.3')).toBe(true)
  })

  // Presence in the map IS the threshold: useFireProximity only admits
  // warnings within FIRE_WARN_MILES, so this must not re-test it.
  it('leaves the cell empty for a row the check cleared', () => {
    const csv = buildResultsCsv([row({ latitude: 40, longitude: -120 })], WINDOW_COLUMNS, near)
    expect(lines(csv)[1].endsWith(',')).toBe(true)
  })

  // The third state of a fire cell (#256): outside the dataset's US-only
  // coverage a destination was never checked, and a blank there would assert
  // a clear check. The N/A per row keeps the covered rows' real answers
  // beside it, and matches the table's cell for the same state.
  it('writes N/A for a destination outside the fire coverage', () => {
    const robson = row({ name: 'Mount Robson', latitude: 53.1106, longitude: -119.2317 })
    const uncovered = new Set([fireKey(53.1106, -119.2317)])
    const csv = buildResultsCsv([row(), robson], WINDOW_COLUMNS, near, [], uncovered)
    const body = lines(csv).slice(1, 3)
    expect(body[0].endsWith(',5.3')).toBe(true)
    expect(body[1].endsWith(',N/A')).toBe(true)
  })

  it('still omits the whole column when the lookup itself never ran', () => {
    const uncovered = new Set([fireKey(53.1106, -119.2317)])
    const csv = buildResultsCsv([row()], WINDOW_COLUMNS, null, [], uncovered)
    // The row ends where the metric columns end, so no cell carries the fire
    // check's answer at all. Counted rather than searched for the mark, which
    // the freezing-level columns write for a reason of their own.
    expect(cells(lines(csv)[1])).toHaveLength(WINDOW_COLUMNS.length + 1)
    expect(cells(lines(csv)[0])).not.toContain(WILDFIRE_COL.label)
  })

  // The header is the table's own (WILDFIRE_COL), so the file and the screen
  // cannot name the column differently.
  it('keeps the column when the check ran and found nothing', () => {
    const header = cells(lines(buildResultsCsv([row()], WINDOW_COLUMNS, NO_FIRES))[0])
    expect(header[header.length - 1]).toBe(WILDFIRE_COL.label)
    expect(WILDFIRE_COL.label).toBe('Wildfire (mi)')
  })

  // The distinction the null carries. A column of blanks in a file nobody can
  // see the app beside is not missing data, it is a claim that every row was
  // checked and cleared. Withholding the column claims nothing.
  describe('when the lookup produced no trustworthy answer', () => {
    it('leaves the column out of the header entirely', () => {
      const header = cells(lines(buildResultsCsv([row()], WINDOW_COLUMNS, null))[0])
      expect(header).not.toContain(WILDFIRE_COL.label)
      expect(header[header.length - 1]).toBe(WINDOW_COLUMNS[WINDOW_COLUMNS.length - 1].label)
    })

    it('gives every row one fewer cell, so nothing reads as an empty distance', () => {
      const withCheck = lines(buildResultsCsv([row()], WINDOW_COLUMNS, NO_FIRES))
      const without = lines(buildResultsCsv([row()], WINDOW_COLUMNS, null))
      expect(cells(without[0])).toHaveLength(cells(withCheck[0]).length - 1)
      expect(cells(without[1])).toHaveLength(cells(withCheck[1]).length - 1)
      expect(without[1].endsWith(',')).toBe(false)
    })

    it('changes nothing else about the file', () => {
      const csv = buildResultsCsv([row(), row({ name: 'Glacier Peak' })], WINDOW_COLUMNS, null)
      expect(csv.charCodeAt(0)).toBe(0xfeff)
      expect(cells(lines(csv)[0])[0]).toBe('Rank')
      // Header, two data rows, the blank row, and two credits: no NIFC line,
      // because a file with no wildfire column must not credit its supplier.
      expect(lines(csv)).toHaveLength(6)
    })
  })
})

// CC BY 4.0 wants the credit to travel with every copy of the material, and a
// ranked table of OSM places is an ODbL derived product; a file is a copy the
// on-screen credits do not follow (#258).
describe('the supplier credits', () => {
  const openMeteo = DATA_SOURCES.find((s) => s.name === 'Open-Meteo')!
  const osm = DATA_SOURCES.find((s) => s.name === 'OpenStreetMap')!
  const nifc = DATA_SOURCES.find((s) => s.name === 'NIFC')!

  it('follow the data behind exactly one blank row, so the table stays a table', () => {
    const all = lines(buildResultsCsv([row()], WINDOW_COLUMNS, NO_FIRES))
    expect(all[1]).toContain('Mount Rainier')
    expect(all[2]).toBe('')
    expect(all[3]).toContain('Open-Meteo')
    expect(all.filter((l) => l === '')).toHaveLength(1)
  })

  it('compose each line from DATA_SOURCES rather than a second literal copy', () => {
    const csv = buildResultsCsv([row()], WINDOW_COLUMNS, NO_FIRES)
    expect(csv).toContain(
      `"Weather data by ${openMeteo.name}, ${openMeteo.license} (${openMeteo.licenseHref})"`,
    )
    expect(csv).toContain(
      `"Destination data © ${osm.name} contributors, ${osm.license} (${osm.licenseHref})"`,
    )
  })

  it('credit the fire supplier exactly when the file carries the fire column', () => {
    expect(buildResultsCsv([row()], WINDOW_COLUMNS, NO_FIRES)).toContain(
      `"Wildfire data by ${nifc.name}, ${nifc.license} (${nifc.licenseHref})"`,
    )
    expect(buildResultsCsv([row()], WINDOW_COLUMNS, null)).not.toContain('NIFC')
  })

  it('stand even in a file with no data rows', () => {
    const all = lines(buildResultsCsv([], WINDOW_COLUMNS, null))
    expect(all[1]).toBe('')
    expect(all[2]).toContain('Open-Meteo')
    expect(all[3]).toContain('OpenStreetMap')
  })
})

describe('csvFilename', () => {
  it('stamps local wall-clock time, zero padded and sortable', () => {
    expect(csvFilename(new Date(2026, 6, 30, 14, 32))).toBe('bluebird-forecast-results-2026-07-30-1432.csv')
    expect(csvFilename(new Date(2026, 0, 5, 9, 4))).toBe('bluebird-forecast-results-2026-01-05-0904.csv')
  })
})

// House style for anything a user reads, and the headers are read in every
// spreadsheet this file is opened in. Checked against the built document
// rather than the source so a label reaching it through COLUMNS is covered too.
describe('house style', () => {
  it('uses no em or en dashes in any header', () => {
    const header = lines(buildResultsCsv([row()], COLUMNS, NO_FIRES))[0]
    expect(header).not.toMatch(/[—–]/)
  })
})

// The file is handed the same rows as the table — one per destination per
// model — so it has to say which model each row is, and it must not renumber
// one destination's rows as though they were several places.
describe('a comparison in the file', () => {
  const MODEL_COLUMNS = withModelColumn(WINDOW_COLUMNS, true)
  const modelRow = (label: string, rank: number, over: Partial<DestinationResult> = {}) =>
    ({ ...row(over), modelId: label, modelLabel: label, rank }) as DestinationResult

  it('writes the model each row came from', () => {
    const csv = buildResultsCsv(
      [modelRow('NOAA GFS', 1), modelRow('ECMWF IFS', 1)],
      MODEL_COLUMNS,
      NO_FIRES,
    )
    // Slice to the data rows: the file carries an attribution block below them.
    const rows = lines(csv).slice(1, 3).map(cells)
    const at = ['Rank', ...MODEL_COLUMNS.map((c) => c.label)].indexOf('Model')
    expect(at).toBeGreaterThan(0)
    expect(rows.map((r) => r[at])).toEqual(['NOAA GFS', 'ECMWF IFS'])
  })

  it('repeats a destination rank down its own rows rather than counting lines', () => {
    const csv = buildResultsCsv(
      [
        modelRow('NOAA GFS', 1),
        modelRow('ECMWF IFS', 1),
        modelRow('NOAA GFS', 2, { name: 'Glacier Peak' }),
      ],
      MODEL_COLUMNS,
      NO_FIRES,
    )
    expect(lines(csv).slice(1, 4).map((l) => cells(l)[0])).toEqual(['1', '1', '2'])
  })

  // The column is in the Columns picker, so a reader can show it on a report
  // with no comparison at all. Then every row came from the analysis model.
  it('falls back to the analysis model for rows no comparison tagged', () => {
    const csv = buildResultsCsv([row()], MODEL_COLUMNS, NO_FIRES, [], new Set(), 'NOAA GFS')
    const at = ['Rank', ...MODEL_COLUMNS.map((c) => c.label)].indexOf('Model')
    expect(cells(lines(csv)[1])[at]).toBe('NOAA GFS')
  })

  // A pending row has no forecast at all, so no model answered it.
  it('leaves the model blank on a row awaiting its first analysis', () => {
    const csv = buildResultsCsv(
      [],
      MODEL_COLUMNS,
      NO_FIRES,
      [row({ name: 'Camp Muir' })],
      new Set(),
      'NOAA GFS',
    )
    const at = ['Rank', ...MODEL_COLUMNS.map((c) => c.label)].indexOf('Model')
    expect(cells(lines(csv)[1])[at]).toBe('')
  })
})
