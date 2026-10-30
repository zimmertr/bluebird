import { describe, expect, it } from 'vitest'
import { type ReportCsvInputs, reportCsv } from './exportCsv'
import { closureWarning, fireWarning, pendingDestination, resultRow } from '../testSupport/fixtures'
import { normalizeWindow } from './forecastWindow'
import { geoKey } from './points'
import { UNAVAILABLE } from './unavailableCell'
import {
  CLOSURE_COL,
  MODEL_COL,
  WILDFIRE_COL,
  displayedColumns,
} from './tableColumns'

const ROW = resultRow({ name: 'Near' })
const COLUMNS = displayedColumns(false, 'precip_total_in')
const WARNINGS = new Map([[geoKey(ROW.latitude, ROW.longitude), fireWarning({ miles: 2 })]])
const CLOSURES = new Map([[geoKey(ROW.latitude, ROW.longitude), closureWarning()]])
const ROWS = [ROW]
const NO_UNCOVERED: ReadonlySet<string> = new Set()
const NO_PENDING: ReportCsvInputs['pending'] = []
const NO_ENDS: ReportCsvInputs['modelEnds'] = []

function inputs(over: Partial<ReportCsvInputs> = {}): ReportCsvInputs {
  return {
    rows: ROWS,
    columns: COLUMNS,
    fireStatus: 'ready',
    fireWarnings: WARNINGS,
    fireUncovered: NO_UNCOVERED,
    closureStatus: 'ready',
    closureWarnings: CLOSURES,
    closureUncovered: NO_UNCOVERED,
    window: null,
    pending: NO_PENDING,
    modelLabel: null,
    modelEnds: NO_ENDS,
    ...over,
  }
}

// The file opens with a byte-order mark, which the slice drops.
const header = (csv: string) => csv.split('\r\n')[0].slice(1).split(',')

describe('reportCsv', () => {
  // Every file has one header: every metric, Model, and both flag columns,
  // whatever the table shows or the checks have answered.
  it('writes every column whatever the checks and the table say', () => {
    const full = header(reportCsv(inputs()))
    expect(full).toEqual(expect.arrayContaining([WILDFIRE_COL.label, CLOSURE_COL.label, MODEL_COL.label]))
    expect(header(reportCsv(inputs({ fireStatus: 'loading', closureStatus: 'unavailable' })))).toEqual(full)
  })

  // A check that has not answered writes N/A, never a blank that reads as clear.
  it('writes N/A in a flag column whose check has not answered', () => {
    const rows = reportCsv(inputs({ fireStatus: 'loading', closureStatus: 'unavailable' })).split('\r\n').slice(1, 1 + ROWS.length)
    for (const row of rows) expect(row.endsWith(`,${UNAVAILABLE},${UNAVAILABLE}`)).toBe(true)
  })

  // Before the first analysis the file is the pending rows alone.
  it('carries pending destinations as rows', () => {
    const csv = reportCsv(inputs({ rows: [], pending: [pendingDestination({ name: 'Probe Peak' })] }))
    expect(csv).toContain('Probe Peak')
  })

  // A Current analysis records start === end; the file writes the sampled
  // hour. How the window line reads is buildResultsCsv's, and its own test's.
  it('names the analyzed window, resolved as a fetch resolves it', () => {
    const at = Date.UTC(2026, 6, 20, 6, 34)
    const point = reportCsv(inputs({ window: { startMs: at, endMs: at } }))
    expect(point).toBe(reportCsv(inputs({ window: normalizeWindow(at, at) })))
    expect(point).not.toBe(reportCsv(inputs()))
  })
})
