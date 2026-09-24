import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createRef } from 'react'
import { type ResultsViewInputs, useResultsView } from './useResultsView'
import type { MapViewHandle } from '../components/MapView'
import { analyzedSnapshot, fireWarning, forecastModel, pendingDestination, resultRow } from '../testSupport/fixtures'
import { FALLBACK_WINDOW_LIMITS } from '../utils/forecastWindow'
import type { ViewPrefs } from '../utils/viewPrefs'

// The three hooks this one composes have suites of their own. What this suite
// is about is the wiring: which of them hears what, and in which order.
const fed = vi.hoisted(() => ({ layout: [] as unknown[], chart: [] as unknown[], table: [] as unknown[] }))
const COMPARE = { shown: ['shown'], results: { r: 1 }, reachEnds: { e: 2 } }
vi.mock('./useResultsLayout', () => ({
  useResultsLayout: (inputs: unknown) => {
    fed.layout.push(inputs)
    return { chartShowing: true, isDragging: false }
  },
}))
vi.mock('./useChartCompare', () => ({
  useChartCompare: (inputs: unknown) => {
    fed.chart.push(inputs)
    return { compare: COMPARE, pendingRows: ['pending row'], comparingRows: true }
  },
}))
vi.mock('./useTableView', () => ({
  useTableView: (inputs: unknown) => {
    fed.table.push(inputs)
    return { tableColumns: [] }
  },
}))

const ROW = resultRow()
const NO_PENDING: ResultsViewInputs['pending'] = []
const ONE_PENDING: ResultsViewInputs['pending'] = [pendingDestination()]
const BY_NAME: ResultsViewInputs['detailSort'] = { key: 'name', dir: 'asc' }
const STORED: ViewPrefs = { modeChosen: 'table', columns: null, modelColumn: null, columnOrder: null }
const MODELS = [forecastModel()]
const NO_MODELS: string[] = []
const TIMES = [0, 3_600_000]
const FIRE: ResultsViewInputs['fire'] = { status: 'ready', warnings: new Map([['k', fireWarning()]]), uncovered: new Set() }
const REPORT = analyzedSnapshot()

function inputs(over: Partial<ResultsViewInputs> = {}): ResultsViewInputs {
  return {
    showResults: true,
    response: null,
    results: [ROW],
    pending: NO_PENDING,
    detailSort: BY_NAME,
    storedView: STORED,
    isDesktop: true,
    bannerPx: 0,
    analysisSeq: 1,
    sortBy: 'precip_total_in',
    pointSample: true,
    analyzed: REPORT,
    models: MODELS,
    forecastModel: 'gfs_seamless',
    comparedModels: NO_MODELS,
    times: TIMES,
    windowLimits: FALLBACK_WINDOW_LIMITS,
    fire: FIRE,
    mapRef: createRef<MapViewHandle>(),
    removePlace: () => {},
    ...over,
  }
}

const last = <T,>(list: unknown[]) => list[list.length - 1] as T

beforeEach(() => {
  fed.layout.length = 0
  fed.chart.length = 0
  fed.table.length = 0
})

describe('useResultsView', () => {
  // The results area shows while a report or a named destination has
  // something to say, and only while results are on screen at all.
  it('shows the table for a report or a pending destination', () => {
    const shown = (over: Partial<ResultsViewInputs>) => renderHook(() => useResultsView(inputs(over))).result.current.showTable
    expect(shown({ response: null, pending: NO_PENDING })).toBe(false)
    expect(shown({ response: {}, pending: NO_PENDING })).toBe(true)
    expect(shown({ response: null, pending: ONE_PENDING })).toBe(true)
    expect(shown({ showResults: false, response: {} })).toBe(false)
  })

  it('feeds the layout its stored mode and whether the table shows', () => {
    renderHook(() => useResultsView(inputs({ response: {} })))
    expect(last(fed.layout)).toMatchObject({ modeChosen: 'table', showTable: true, isDesktop: true, analysisSeq: 1 })
  })

  // The chart hears whether the layout shows it, and the table hears the
  // chart's comparison: the order the three had in App.tsx.
  it('passes the layout to the chart and the comparison to the table', () => {
    renderHook(() => useResultsView(inputs()))
    expect(last(fed.chart)).toMatchObject({ chartShowing: true, times: TIMES, comparedModels: NO_MODELS })
    expect(last(fed.table)).toMatchObject({
      comparingRows: true,
      shownModels: COMPARE.shown,
      compareResults: COMPARE.results,
      compareReachEnds: COMPARE.reachEnds,
      pendingRows: ['pending row'],
      pointSample: true,
      fire: FIRE,
    })
  })

  // The table's rows are memoized, so its callbacks must keep one identity
  // for as long as what they close over does.
  it('keeps the table callbacks stable across renders', () => {
    const mapRef = createRef<MapViewHandle>()
    const removePlace = () => {}
    const { result, rerender } = renderHook(() => useResultsView(inputs({ mapRef, removePlace })))
    const first = result.current
    rerender()
    expect(result.current.onRemovePending).toBe(first.onRemovePending)
    expect(result.current.onFocusResult).toBe(first.onFocusResult)
    expect(result.current.onFocusPending).toBe(first.onFocusPending)
  })

  it('removes a pending destination and flies the map to a row', () => {
    const removePlace = vi.fn()
    const focusResult = vi.fn()
    const focusPoint = vi.fn()
    const mapRef = { current: { focusResult, focusPoint } as unknown as MapViewHandle }
    const { result } = renderHook(() => useResultsView(inputs({ mapRef, removePlace })))
    result.current.onRemovePending({ latitude: 47.5, longitude: -121.5 })
    expect(removePlace).toHaveBeenCalledWith(47.5, -121.5)
    result.current.onFocusResult(ROW)
    expect(focusResult).toHaveBeenCalledWith(ROW)
    result.current.onFocusPending({ latitude: 1, longitude: 2 })
    expect(focusPoint).toHaveBeenCalledWith({ latitude: 1, longitude: 2 })
  })
})
