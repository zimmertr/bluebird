import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { type GridLayerInputs, useGridLayer } from './useGridLayer'
import type { ForecastGridInputs } from './useForecastGrid'
import { analyzedSnapshot, forecastModel, resultRow } from '../testSupport/fixtures'
import { FALLBACK_WINDOW_LIMITS } from '../utils/forecastWindow'
import { GRID_REACH_DEFAULT_FRAC } from '../utils/forecastGrid'

// The fetch is its own hook with its own tests. Here it only records what it
// was fed, and answers a status the test sets.
const fed: ForecastGridInputs[] = []
let status: 'idle' | 'loading' | 'ready' | 'failed' = 'idle'
vi.mock('./useForecastGrid', () => ({
  useForecastGrid: (inputs: ForecastGridInputs) => {
    fed.push(inputs)
    return { status, spec: null, cells: [], pitchKm: inputs.pitchKm, complete: false, paceRemainingS: null }
  },
}))

const MODELS = [
  forecastModel({ id: 'gfs_seamless', finestGridKm: 3 }),
  forecastModel({ id: 'ecmwf_ifs025', finestGridKm: 25 }),
]
const FIELD = [resultRow()]
const TIMES = [0, 3_600_000]
const REPORT = analyzedSnapshot({ forecastModel: 'gfs_seamless' })
const ARCHIVE = analyzedSnapshot({ windowSource: 'archive' })

function inputs(over: Partial<GridLayerInputs> = {}): GridLayerInputs {
  return {
    restored: null,
    showGrid: true,
    analyzed: REPORT,
    universe: FIELD,
    forecastModel: 'gfs_seamless',
    forecastModels: MODELS,
    forecastTimes: TIMES,
    analysisSeq: 1,
    windowLimits: FALLBACK_WINDOW_LIMITS,
    aqiForecastDays: 5,
    ...over,
  }
}

const last = () => fed[fed.length - 1]

beforeEach(() => {
  fed.length = 0
  status = 'idle'
})

describe('useGridLayer', () => {
  it('opens on the smooth style and the default coverage, or on what a link carried', () => {
    const fresh = renderHook(() => useGridLayer(inputs())).result.current
    expect([fresh.gridStyle, fresh.gridReachFrac]).toEqual(['smooth', GRID_REACH_DEFAULT_FRAC])
    const link = { gridStyle: 'blocks' as const, gridReachFrac: 0.9 }
    const linked = renderHook(() => useGridLayer(inputs({ restored: link }))).result.current
    expect([linked.gridStyle, linked.gridReachFrac]).toEqual(['blocks', 0.9])
  })

  // The panel can move while a report is on screen; the grid must keep
  // painting what the markers were analyzed with.
  it('feeds the fetch the analyzed model and pitch, whatever the panel picks', () => {
    let panel = 'gfs_seamless'
    const { result, rerender } = renderHook(() => useGridLayer(inputs({ forecastModel: panel })))
    panel = 'ecmwf_ifs025'
    rerender()
    expect(last()).toMatchObject({ model: 'gfs_seamless', pitchKm: 3, enabled: true, window: REPORT.window })
    // Before any report, only the slider's quote reads the panel's model.
    expect(result.current.gridReachPitchKm).toBe(3)
    const before = renderHook(() =>
      useGridLayer(inputs({ analyzed: null, universe: null, forecastModel: 'ecmwf_ifs025' })),
    )
    expect(before.result.current.gridReachPitchKm).toBe(25)
    // With no report there is no field or window to fetch for.
    expect(last()).toMatchObject({ field: null, window: null })
  })

  // A drag previews live and fetches only on release.
  it('shows the drag at once and commits it only on release', () => {
    const { result } = renderHook(() => useGridLayer(inputs()))
    act(() => result.current.setGridReachDraft(0.8))
    expect(last()).toMatchObject({ reachFrac: GRID_REACH_DEFAULT_FRAC, displayReachFrac: 0.8 })
    act(() => result.current.commitGridReach())
    expect(result.current.gridReachDraft).toBeNull()
    expect(last()).toMatchObject({ reachFrac: 0.8, displayReachFrac: 0.8 })
  })

  // An archive report names no model to sample at (#123). The reader's
  // preference survives; the layer is out of play.
  it('keeps the layer out of play over an archive report, and off when unchecked', () => {
    const archive = renderHook(() => useGridLayer(inputs({ analyzed: ARCHIVE }))).result.current
    expect([archive.gridAvailable, archive.gridOn, last().enabled]).toEqual([false, false, false])
    const off = renderHook(() => useGridLayer(inputs({ showGrid: false }))).result.current
    expect([off.gridAvailable, off.gridOn]).toEqual([true, false])
  })

  it('cues the legend while loading and says when it failed, only while on', () => {
    status = 'loading'
    expect(renderHook(() => useGridLayer(inputs())).result.current.gridCued).toBe(true)
    status = 'failed'
    expect(renderHook(() => useGridLayer(inputs())).result.current.gridFailed).toBe(true)
    expect(renderHook(() => useGridLayer(inputs({ showGrid: false }))).result.current.gridFailed).toBe(false)
  })

  it('keeps its setters and the release stable across a render that changes nothing', () => {
    const { result, rerender } = renderHook(() => useGridLayer(inputs()))
    const before = result.current
    rerender()
    expect(result.current.setGridStyle).toBe(before.setGridStyle)
    expect(result.current.setGridReachDraft).toBe(before.setGridReachDraft)
    expect(result.current.commitGridReach).toBe(before.commitGridReach)
  })
})
