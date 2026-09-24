import { describe, expect, it } from 'vitest'
import { type ReportCsvInputs, reportCsv } from './exportCsv'
import { fireWarning, pendingDestination, resultRow } from '../testSupport/fixtures'
import { geoKey } from './points'
import { MODEL_COL, WILDFIRE_COL, WILDFIRE_KEY, displayedColumns } from './tableColumns'

const ROW = resultRow({ name: 'Near' })
const COLUMNS = displayedColumns(false, 'precip_total_in')
const WARNINGS = new Map([[geoKey(ROW.latitude, ROW.longitude), fireWarning({ miles: 2 })]])
const ROWS = [ROW]
const NO_UNCOVERED: ReadonlySet<string> = new Set()
const NO_PENDING: ReportCsvInputs['pending'] = []
const NO_ENDS: ReportCsvInputs['modelEnds'] = []
const ALL_VISIBLE = new Set([...COLUMNS.map((c) => c.key as string), WILDFIRE_KEY])

function inputs(over: Partial<ReportCsvInputs> = {}): ReportCsvInputs {
  return {
    rows: ROWS,
    columns: COLUMNS,
    modelColumnOn: false,
    columnOrder: null,
    visibleKeys: ALL_VISIBLE,
    fireStatus: 'ready',
    fireWarnings: WARNINGS,
    fireUncovered: NO_UNCOVERED,
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
  // A file is read away from the app, so a wildfire column there says the
  // check ran. It goes over only when the check answered and the column shows.
  it('carries the wildfire column only when the check is ready and the column is shown', () => {
    expect(header(reportCsv(inputs()))).toContain(WILDFIRE_COL.label)
    expect(header(reportCsv(inputs({ fireStatus: 'loading' })))).not.toContain(WILDFIRE_COL.label)
    const hidden = new Set(ALL_VISIBLE)
    hidden.delete(WILDFIRE_KEY)
    expect(header(reportCsv(inputs({ visibleKeys: hidden })))).not.toContain(WILDFIRE_COL.label)
  })

  it('writes the columns in the order on screen, with the Model column when it is drawn', () => {
    const [first, second] = COLUMNS
    const moved = header(reportCsv(inputs({ columnOrder: [second.key, first.key] })))
    expect(moved.indexOf(second.label)).toBeLessThan(moved.indexOf(first.label))
    expect(header(reportCsv(inputs()))).not.toContain(MODEL_COL.label)
    expect(header(reportCsv(inputs({ modelColumnOn: true })))).toContain(MODEL_COL.label)
  })

  // Before the first analysis the file is the pending rows alone.
  it('carries pending destinations as rows', () => {
    const csv = reportCsv(inputs({ rows: [], pending: [pendingDestination({ name: 'Probe Peak' })] }))
    expect(csv).toContain('Probe Peak')
  })

  // A Current analysis records start === end; the file writes the sampled hour.
  it('names the analyzed window', () => {
    const at = Date.UTC(2026, 6, 20, 6)
    const csv = reportCsv(inputs({ window: { startMs: at, endMs: at + 12 * 3_600_000 } }))
    expect(csv.split('\r\n').length).toBeGreaterThan(reportCsv(inputs()).split('\r\n').length)
  })
})
