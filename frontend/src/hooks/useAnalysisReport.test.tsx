import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useAnalysisReport } from './useAnalysisReport'
import { analyzedView } from '../utils/analysisSnapshot'
import { FALLBACK_WINDOW_LIMITS } from '../utils/forecastWindow'
import { discoveryKeys } from '../utils/present'
import { resultRow } from '../testSupport/fixtures'

const ROWS = [resultRow({ name: 'A' }), resultRow({ name: 'B', latitude: 47 })]
const DATA = { results: ROWS.slice(0, 1), total_queried: 2, total_matched: 2 }
const VIEW = analyzedView(
  {
    destination_types: [],
    start_datetime: '2026-07-21T00:00:00Z',
    end_datetime: '2026-07-21T02:00:00Z',
    forecast_model: 'gfs_seamless',
    limit: 1,
  },
  'days',
  { discovery: discoveryKeys(null, [], false), compareModels: [], snowAnalysisDate: null },
  Date.parse('2026-07-20T12:00:00Z'),
  FALLBACK_WINDOW_LIMITS,
)

describe('useAnalysisReport', () => {
  it('commits a report and counts it', () => {
    const { result } = renderHook(() => useAnalysisReport())
    act(() => result.current.commit(DATA, ROWS, VIEW))
    expect(result.current).toMatchObject({ response: DATA, universe: ROWS, analyzed: VIEW, arriving: false, analysisSeq: 1 })
  })

  it('marks a partial field as arriving and does not count it as a report', () => {
    const { result } = renderHook(() => useAnalysisReport())
    act(() => result.current.commitArriving(DATA, ROWS.slice(0, 1), VIEW))
    expect(result.current).toMatchObject({ arriving: true, analysisSeq: 0, universe: ROWS.slice(0, 1) })
    act(() => result.current.settle())
    expect(result.current.arriving).toBe(false)
    expect(result.current.response).toBe(DATA)
  })

  it('bumps the fire sequence when a field is published, not when it is dropped', () => {
    const { result } = renderHook(() => useAnalysisReport())
    act(() => result.current.publishCandidates([{ latitude: 1, longitude: 2 }]))
    expect(result.current).toMatchObject({ fireField: [{ latitude: 1, longitude: 2 }], fireSeq: 1 })
    act(() => result.current.dropCandidates())
    expect(result.current).toMatchObject({ fireField: null, fireSeq: 1 })
  })

  it('clears the report and keeps the counters', () => {
    const { result } = renderHook(() => useAnalysisReport())
    act(() => {
      result.current.commit(DATA, ROWS, VIEW)
      result.current.publishCandidates([{ latitude: 1, longitude: 2 }])
    })
    act(() => result.current.clear())
    expect(result.current).toMatchObject({
      response: null, universe: null, analyzed: null, arriving: false, fireField: null, analysisSeq: 1, fireSeq: 1,
    })
  })
})
