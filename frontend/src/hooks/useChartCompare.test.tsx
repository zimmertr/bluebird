import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { type ChartCompareInputs, useChartCompare } from './useChartCompare'
import { analyzedSnapshot, forecastModel, pendingDestination, resultRow } from '../testSupport/fixtures'
import { chartKey } from '../utils/chartData'
import { FALLBACK_WINDOW_LIMITS } from '../utils/forecastWindow'
import { type ModelRow, pairKey } from '../utils/modelCompare'
import { paceWaitLine } from '../utils/pacing'

// The fetch is its own hook with its own tests. Here it records what it was
// fed and answers the models it was asked to show, less the hidden ones.
type CompareInputs = Parameters<typeof import('./useModelCompare').useModelCompare>[0]
const fed: CompareInputs[] = []
let paceRemainingS: number | null = null
vi.mock('./useModelCompare', () => ({
  useModelCompare: (inputs: CompareInputs) => {
    fed.push(inputs)
    const ids = [inputs.analyzed?.forecastModel ?? '', ...inputs.picked].filter(
      (id) => id && !inputs.hidden?.has(id),
    )
    return {
      active: ids.length > 1,
      compared: [],
      shown: ids.map((id) => ({ id, label: id })),
      lines: [],
      endLines: [],
      reachEnds: [],
      results: {},
      paceRemainingS,
    }
  },
}))

const MODELS = [forecastModel({ id: 'gfs_seamless' }), forecastModel({ id: 'icon_seamless', label: 'DWD ICON' })]
const ROWS = [resultRow({ name: 'A' }), resultRow({ name: 'B', latitude: 47.5, longitude: -121.5 })]
const REPORT = analyzedSnapshot({ forecastModel: 'gfs_seamless', compareModels: ['icon_seamless'] })
const TIMES = [0, 3_600_000]
const NONE: ChartCompareInputs['pending'] = []
const ICON = ['icon_seamless']
const NO_MODELS: string[] = []

function inputs(over: Partial<ChartCompareInputs> = {}): ChartCompareInputs {
  return {
    results: ROWS,
    pending: NONE,
    sortBy: 'precip_total_in',
    analyzed: REPORT,
    analysisSeq: 1,
    models: MODELS,
    forecastModel: 'gfs_seamless',
    comparedModels: ICON,
    times: TIMES,
    windowLimits: FALLBACK_WINDOW_LIMITS,
    chartShowing: true,
    ...over,
  }
}

const last = () => fed[fed.length - 1]

beforeEach(() => {
  fed.length = 0
  paceRemainingS = null
})

describe('useChartCompare', () => {
  // The ranking model's line is the destination's own colour, so a chart with
  // nothing compared draws as it always did. A compared model's line has a
  // colour of its own, and the table row for it wears the same one.
  it('seeds the ranking pair with the destination colour and colours each compared pair', () => {
    const { result } = renderHook(() => useChartCompare(inputs()))
    const row = ROWS[0]
    const own = result.current.chart.colorFor(row)
    const colors = last().colors
    expect(colors[pairKey('gfs_seamless', chartKey(row))]).toBe(own)
    const icon = colors[pairKey('icon_seamless', chartKey(row))]
    expect(icon).toBeDefined()
    expect(icon).not.toBe(own)
    expect(result.current.rowChartColor(row)).toBe(own)
    expect(result.current.rowChartColor({ ...row, modelId: 'icon_seamless' } as ModelRow)).toBe(icon)
    expect(result.current.comparingRows).toBe(true)
  })

  it('prunes a hidden model once the panel deselects it', () => {
    let compared = ICON
    const { result, rerender } = renderHook(() => useChartCompare(inputs({ comparedModels: compared })))
    act(() => result.current.toggleHiddenModel('icon_seamless'))
    expect([...result.current.hiddenModels]).toEqual(['icon_seamless'])
    expect(last().hidden?.has('icon_seamless')).toBe(true)
    compared = NO_MODELS
    rerender()
    expect(result.current.hiddenModels.size).toBe(0)
  })

  // The wait shows under the results bar only when the chart cannot say it.
  it('says the comparison wait only where the chart does not', () => {
    paceRemainingS = 30
    expect(renderHook(() => useChartCompare(inputs())).result.current.compareWait).toBeNull()
    const hidden = renderHook(() => useChartCompare(inputs({ chartShowing: false })))
    expect(hidden.result.current.compareWait).toBe(paceWaitLine(30))
  })

  it('tracks a pending destination until an analysis covers it', () => {
    const pending = [pendingDestination({ name: 'New' })]
    const { result } = renderHook(() => useChartCompare(inputs({ pending })))
    expect(result.current.pendingRows.map((r) => r.name)).toEqual(['New'])
  })

  // The perf fix: the row colour was keyed on the whole selection object,
  // which is new every render, so the memoized table got a new callback on
  // every render. Keyed on `colorFor` it holds.
  it('keeps the row colour and the model toggle stable across a render that changes nothing', () => {
    const { result, rerender } = renderHook(() => useChartCompare(inputs()))
    const before = result.current
    rerender()
    expect(result.current.rowChartColor).toBe(before.rowChartColor)
    expect(result.current.toggleHiddenModel).toBe(before.toggleHiddenModel)
    expect(result.current.pendingRows).toBe(before.pendingRows)
  })
})
