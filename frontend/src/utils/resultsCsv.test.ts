import { describe, expect, it } from 'vitest'
import { buildResultsCsv, csvFilename } from './resultsCsv'
import { COLUMNS, displayedColumns } from './tableColumns'
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
    precip_max_in_hr: 0.0034,
    temp_min_f: 21.4,
    temp_max_f: 38.2,
    temp_avg_f: 29.8,
    wind_min_mph: 4.1,
    wind_max_mph: 22.7,
    wind_avg_mph: 12.3,
    aqi_avg: 31,
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
    expect(lines(csv)).toHaveLength(3)
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
    const body = lines(csv).slice(1)
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
    expect(lines(csv)).toHaveLength(2)
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

  it('keeps the column when the check ran and found nothing', () => {
    const header = cells(lines(buildResultsCsv([row()], WINDOW_COLUMNS, NO_FIRES))[0])
    expect(header[header.length - 1]).toBe('Nearby Wildfire (mi)')
  })

  // The distinction the null carries. A column of blanks in a file nobody can
  // see the app beside is not missing data, it is a claim that every row was
  // checked and cleared. Withholding the column claims nothing.
  describe('when the lookup produced no trustworthy answer', () => {
    it('leaves the column out of the header entirely', () => {
      const header = cells(lines(buildResultsCsv([row()], WINDOW_COLUMNS, null))[0])
      expect(header).not.toContain('Nearby Wildfire (mi)')
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
      expect(lines(csv)).toHaveLength(3)
    })
  })
})

describe('csvFilename', () => {
  it('stamps local wall-clock time, zero padded and sortable', () => {
    expect(csvFilename(new Date(2026, 6, 30, 14, 32))).toBe('bluebird-results-2026-07-30-1432.csv')
    expect(csvFilename(new Date(2026, 0, 5, 9, 4))).toBe('bluebird-results-2026-01-05-0904.csv')
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
