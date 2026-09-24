import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { type TableViewInputs, useTableView } from './useTableView'
import type { FireProximity } from './useFireProximity'
import { analyzedSnapshot, fireWarning, forecastModel, resultRow } from '../testSupport/fixtures'
import { geoKey } from '../utils/points'
import { MODEL_KEY, WILDFIRE_KEY } from '../utils/tableColumns'
import { type ViewPrefs, readViewPrefs } from '../utils/viewPrefs'

const NEAR = resultRow({ name: 'Near', latitude: 47.1, longitude: -121.1 })
const FAR = resultRow({ name: 'Far', latitude: 47.2, longitude: -121.2 })
const CLEAR = resultRow({ name: 'Clear', latitude: 47.3, longitude: -121.3 })
const ROWS = [CLEAR, FAR, NEAR]
const FIRE: FireProximity = {
  status: 'ready',
  warnings: new Map([
    [geoKey(NEAR.latitude, NEAR.longitude), fireWarning({ miles: 2 })],
    [geoKey(FAR.latitude, FAR.longitude), fireWarning({ miles: 8 })],
  ]),
  uncovered: new Set(),
}
const MODELS = [forecastModel({ id: 'gfs_seamless', label: 'NOAA GFS' })]
const REPORT = analyzedSnapshot()
const NOTHING_STORED: ViewPrefs = { modeChosen: null, columns: null, modelColumn: null, columnOrder: null }
const NO_PENDING: TableViewInputs['pending'] = []
const NO_PENDING_ROWS: TableViewInputs['pendingRows'] = []
const NO_SHOWN: TableViewInputs['shownModels'] = []
const NO_RESULTS: TableViewInputs['compareResults'] = {}
const NO_ENDS: TableViewInputs['compareReachEnds'] = {}
const BY_NAME: TableViewInputs['detailSort'] = { key: 'name', dir: 'asc' }

function inputs(over: Partial<TableViewInputs> = {}): TableViewInputs {
  return {
    storedView: NOTHING_STORED,
    results: ROWS,
    detailSort: BY_NAME,
    sortBy: 'precip_total_in',
    pointSample: false,
    analyzed: REPORT,
    models: MODELS,
    forecastModel: 'gfs_seamless',
    comparingRows: false,
    shownModels: NO_SHOWN,
    compareResults: NO_RESULTS,
    compareReachEnds: NO_ENDS,
    pending: NO_PENDING,
    pendingRows: NO_PENDING_ROWS,
    fire: FIRE,
    ...over,
  }
}

const keys = (cols: readonly { key: string }[]) => cols.map((c) => c.key)

beforeEach(() => localStorage.clear())

describe('useTableView', () => {
  // The order the reader dragged comes back on a reload, and a new ranking
  // throws it away. An effect keyed on the ranking also runs on mount, which
  // is the case the skip exists for.
  it('keeps a stored order on mount and drops it when the ranking changes', () => {
    const { result } = renderHook(() => useTableView(inputs()))
    const auto = keys(result.current.allColumns)
    const dragged = [auto[1], auto[0], ...auto.slice(2)]
    const stored = { ...NOTHING_STORED, columnOrder: dragged }
    const { result: view, rerender } = renderHook((p: TableViewInputs) => useTableView(p), {
      initialProps: inputs({ storedView: stored }),
    })
    expect(keys(view.current.allColumns)).toEqual(dragged)
    expect(readViewPrefs().columnOrder).toEqual(dragged)
    rerender(inputs({ storedView: stored, sortBy: 'temp_avg_f' }))
    expect(readViewPrefs().columnOrder).toBeNull()
    expect(keys(view.current.allColumns)).not.toEqual(dragged)
  })

  it('moves a column within the full list and stores the move', () => {
    const { result } = renderHook(() => useTableView(inputs()))
    const [first, second] = keys(result.current.tableColumns)
    act(() => result.current.handleColumnMove(second, first))
    expect(keys(result.current.tableColumns).slice(0, 2)).toEqual([second, first])
    expect(readViewPrefs().columnOrder?.slice(0, 2)).toEqual([second, first])
  })

  // A point-sample flip relabels the metric columns under the same keys, so
  // their widths reopen; the identity columns keep theirs.
  it('keeps only the identity widths across a point-sample flip', () => {
    const { result, rerender } = renderHook((p: TableViewInputs) => useTableView(p), {
      initialProps: inputs(),
    })
    act(() => result.current.setTableColWidths({ name: 200, elevation_ft: 90, temp_avg_f: 120 }))
    rerender(inputs({ pointSample: true }))
    expect(result.current.tableColWidths).toEqual({ name: 200, elevation_ft: 90 })
  })

  // Unanswered, the Model column follows the model count. Once the reader
  // unticks it, it stays off whatever the count does.
  it('follows the model count for the Model column until the reader answers', () => {
    const { result, rerender } = renderHook((p: TableViewInputs) => useTableView(p), {
      initialProps: inputs(),
    })
    expect(result.current.pickerVisibleKeys.has(MODEL_KEY)).toBe(false)
    rerender(inputs({ comparingRows: true }))
    expect(result.current.pickerVisibleKeys.has(MODEL_KEY)).toBe(true)
    expect(keys(result.current.tableColumns)).toContain(MODEL_KEY)
    const without = new Set(result.current.pickerVisibleKeys)
    without.delete(MODEL_KEY)
    act(() => result.current.handleVisibilityChange(without))
    expect(keys(result.current.tableColumns)).not.toContain(MODEL_KEY)
    expect(readViewPrefs().modelColumn).toBe(false)
  })

  it('hides a column the picker unticks, and stores the choice', () => {
    const { result } = renderHook(() => useTableView(inputs()))
    const without = new Set(result.current.pickerVisibleKeys)
    without.delete(WILDFIRE_KEY)
    act(() => result.current.handleVisibilityChange(without))
    expect(keys(result.current.tableColumns)).not.toContain(WILDFIRE_KEY)
    expect(readViewPrefs().columns?.has(WILDFIRE_KEY)).toBe(false)
  })

  // The wildfire key is virtual: its value is the warning's mileage, and a
  // clear row has none, so it lands last in both directions.
  it('sorts the wildfire column by mileage with clear rows last', () => {
    const { result, rerender } = renderHook((p: TableViewInputs) => useTableView(p), {
      initialProps: inputs({ detailSort: { key: WILDFIRE_KEY, dir: 'asc' } }),
    })
    expect(result.current.tableRows.map((r) => r.name)).toEqual(['Near', 'Far', 'Clear'])
    rerender(inputs({ detailSort: { key: WILDFIRE_KEY, dir: 'desc' } }))
    expect(result.current.tableRows.map((r) => r.name)).toEqual(['Far', 'Near', 'Clear'])
  })

  it('labels the analyzed model rather than the panel one', () => {
    const models = [...MODELS, forecastModel({ id: 'icon_seamless', label: 'DWD ICON' })]
    const { result } = renderHook(() => useTableView(inputs({ models, forecastModel: 'icon_seamless' })))
    expect(result.current.analysisModelLabel).toBe('NOAA GFS')
    expect(result.current.partialNote).toBeNull()
  })

  // The memoized table compares its props by reference, so a render that
  // changes nothing must hand it the same values and callbacks.
  it('keeps every value and callback across a render that changes nothing', () => {
    const { result, rerender } = renderHook((p: TableViewInputs) => useTableView(p), {
      initialProps: inputs(),
    })
    const before = result.current
    rerender(inputs())
    const after = result.current
    for (const name of [
      'tableRows',
      'tableColumns',
      'allColumns',
      'pickerVisibleKeys',
      'tableColWidths',
      'setTableColWidths',
      'legend',
      'handleColumnMove',
      'handleVisibilityChange',
      'handleDownloadCsv',
    ] as const) {
      expect(after[name], name).toBe(before[name])
    }
  })
})
