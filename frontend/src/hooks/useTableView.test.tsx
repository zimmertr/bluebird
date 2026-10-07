import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { type TableViewInputs, useTableView } from './useTableView'
import type { FireProximity } from './useFireProximity'
import type { ClosureProximity } from './useClosureProximity'
import {
  analyzedSnapshot,
  closureWarning,
  fireWarning,
  forecastModel,
  resultRow,
  weatherResult,
} from '../testSupport/fixtures'
import { chartKey } from '../utils/chartData'
import { type ModelRow, pairKey } from '../utils/modelCompare'
import { geoKey } from '../utils/points'
import { rankText } from '../utils/resultsCells'
import { CLOSURE_KEY, MODEL_KEY, WILDFIRE_KEY } from '../utils/tableColumns'
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
// Two rows inside two different closures, named so their alphabetical order
// is the reverse of the rows' own, and one cleared row.
const CLOSURE: ClosureProximity = {
  status: 'ready',
  warnings: new Map([
    [geoKey(NEAR.latitude, NEAR.longitude), closureWarning({ name: 'Zigzag Closure' })],
    [geoKey(FAR.latitude, FAR.longitude), closureWarning({ name: 'Eagle Creek Closure' })],
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
// The ranking's own order: what the table holds while nobody clicked a header.
const RANKED: TableViewInputs['detailSort'] = { key: 'precip_total_in', dir: 'asc' }

function inputs(over: Partial<TableViewInputs> = {}): TableViewInputs {
  return {
    storedView: NOTHING_STORED,
    results: ROWS,
    detailSort: BY_NAME,
    sortBy: 'precip_total_in',
    sortDesc: false,
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
    closure: CLOSURE,
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

  // A header sort reorders the rows, and each keeps the rank the ranking gave
  // it, the number its marker wears (#579). The same rows come back while
  // nothing they are made from changes, so the memoized table does not redraw.
  it('keeps the ranking rank on each row through a header sort, on the same objects', () => {
    const { result, rerender } = renderHook((p: TableViewInputs) => useTableView(p), {
      initialProps: inputs({ detailSort: { key: 'name', dir: 'desc' } }),
    })
    const first = result.current.tableRows
    expect(first.map((r) => [r.name, rankText(r, 0)])).toEqual([
      ['Near', '3'],
      ['Far', '2'],
      ['Clear', '1'],
    ])
    rerender(inputs({ detailSort: { key: 'name', dir: 'desc' } }))
    expect(result.current.tableRows[0]).toBe(first[0])
  })

  // The Elevation column sorts by the number its cell shows (decision 0116): a
  // place with no recorded elevation sorts by the terrain height it was read
  // at, and only a row with neither lands last.
  it('sorts the Elevation column by the height shown, terrain height included', () => {
    const rows = [
      resultRow({ name: 'Placed', latitude: 47.4, longitude: -121.4, elevation_ft: 9000 }),
      resultRow({ name: 'Terrain', latitude: 47.5, longitude: -121.5, elevation_ft: null, terrain_ft: 7119 }),
      resultRow({ name: 'Blank', latitude: 47.6, longitude: -121.6, elevation_ft: null }),
    ]
    const { result, rerender } = renderHook((p: TableViewInputs) => useTableView(p), {
      initialProps: inputs({ results: rows, detailSort: { key: 'elevation_ft', dir: 'asc' } }),
    })
    expect(result.current.tableRows.map((r) => r.name)).toEqual(['Terrain', 'Placed', 'Blank'])
    rerender(inputs({ results: rows, detailSort: { key: 'elevation_ft', dir: 'desc' } }))
    expect(result.current.tableRows.map((r) => r.name)).toEqual(['Placed', 'Terrain', 'Blank'])
  })

  // The Closure key is virtual too, and sorts by the order's name, with a
  // cleared row last in both directions.
  it('sorts the Closure column by name with cleared rows last', () => {
    const { result, rerender } = renderHook((p: TableViewInputs) => useTableView(p), {
      initialProps: inputs({ detailSort: { key: CLOSURE_KEY, dir: 'asc' } }),
    })
    expect(result.current.tableRows.map((r) => r.name)).toEqual(['Far', 'Near', 'Clear'])
    rerender(inputs({ detailSort: { key: CLOSURE_KEY, dir: 'desc' } }))
    expect(result.current.tableRows.map((r) => r.name)).toEqual(['Near', 'Far', 'Clear'])
  })

  it('shows the Closure column last and by default, lists it in the picker, and hides it on untick', () => {
    const { result } = renderHook(() => useTableView(inputs()))
    expect(keys(result.current.tableColumns).slice(-2)).toEqual([WILDFIRE_KEY, CLOSURE_KEY])
    expect(keys(result.current.allColumns)).toContain(CLOSURE_KEY)
    expect(result.current.pickerVisibleKeys.has(CLOSURE_KEY)).toBe(true)
    const without = new Set(result.current.pickerVisibleKeys)
    without.delete(CLOSURE_KEY)
    act(() => result.current.handleVisibilityChange(without))
    expect(keys(result.current.tableColumns)).not.toContain(CLOSURE_KEY)
    expect(keys(result.current.tableColumns)).toContain(WILDFIRE_KEY)
    expect(readViewPrefs().columns?.has(CLOSURE_KEY)).toBe(false)
  })

  it('labels the analyzed model rather than the panel one', () => {
    const models = [...MODELS, forecastModel({ id: 'icon_seamless', label: 'DWD ICON' })]
    const { result } = renderHook(() => useTableView(inputs({ models, forecastModel: 'icon_seamless' })))
    expect(result.current.analysisModelLabel).toBe('NOAA GFS')
    expect(result.current.partialNote).toBeNull()
  })

  // A chip promotion moves the panel's ranking model ahead of the report. The
  // rows stay the report's until the next Analyze: the analyzed model's rows
  // lead each group, and the model promoted out of the comparison has none.
  it('keeps the analyzed model rows after the panel ranking moves to another model', () => {
    const models = [
      ...MODELS,
      forecastModel({ id: 'ecmwf_ifs025', label: 'ECMWF IFS' }),
      forecastModel({ id: 'jma_seamless', label: 'JMA GSM' }),
    ]
    const shown = [
      { id: 'gfs_seamless', label: 'NOAA GFS', note: null },
      { id: 'jma_seamless', label: 'JMA GSM', note: null },
    ]
    const fetched = Object.fromEntries(ROWS.map((r) => [pairKey('jma_seamless', chartKey(r)), weatherResult()]))
    const { result } = renderHook(() =>
      useTableView(
        inputs({
          models,
          forecastModel: 'ecmwf_ifs025',
          comparingRows: true,
          shownModels: shown,
          compareResults: fetched,
          detailSort: RANKED,
        }),
      ),
    )
    const labels = result.current.tableRows.map((r) => (r as ModelRow).modelLabel)
    expect(labels.filter((l) => l === 'NOAA GFS')).toHaveLength(ROWS.length)
    expect(labels.filter((l) => l === 'JMA GSM')).toHaveLength(ROWS.length)
    expect(labels).not.toContain('ECMWF IFS')
  })

  // Under the ranking's own order a comparison reads one place at a time,
  // the report's row first, as `modelRowsFor` hands them over. A header click
  // is what sorts across places.
  it('keeps compared rows grouped by destination until a header click', () => {
    const models = [...MODELS, forecastModel({ id: 'jma_seamless', label: 'JMA GSM' })]
    const shown = [
      { id: 'gfs_seamless', label: 'NOAA GFS', note: null },
      { id: 'jma_seamless', label: 'JMA GSM', note: null },
    ]
    // Ranked lowest first by precipitation, with JMA wetter than every GFS
    // row, so a sort on the ranking key would put all of GFS ahead of all of
    // JMA.
    const ranked = [
      resultRow({ name: 'A', latitude: 47.1, longitude: -121.1, precip_total_in: 0.1 }),
      resultRow({ name: 'B', latitude: 47.2, longitude: -121.2, precip_total_in: 0.2 }),
    ]
    const fetched = Object.fromEntries(
      ranked.map((r) => [pairKey('jma_seamless', chartKey(r)), weatherResult({ precip_total_in: 1 })]),
    )
    const base = inputs({
      results: ranked,
      models,
      comparingRows: true,
      shownModels: shown,
      compareResults: fetched,
      detailSort: RANKED,
    })
    const read = (rows: readonly unknown[]) =>
      rows.map((r) => `${(r as ModelRow).name} ${(r as ModelRow).modelLabel}`)
    const { result, rerender } = renderHook((p: TableViewInputs) => useTableView(p), {
      initialProps: base,
    })
    expect(read(result.current.tableRows)).toEqual(['A NOAA GFS', 'A JMA GSM', 'B NOAA GFS', 'B JMA GSM'])
    rerender({ ...base, detailSort: { key: 'precip_total_in', dir: 'desc' } })
    expect(read(result.current.tableRows)).toEqual(['A JMA GSM', 'B JMA GSM', 'B NOAA GFS', 'A NOAA GFS'])
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
