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

  it('bumps the fire sequence when a field is published, not when it is discarded', () => {
    const { result } = renderHook(() => useAnalysisReport())
    act(() => result.current.publishCandidates([{ latitude: 1, longitude: 2 }]))
    expect(result.current).toMatchObject({ fireField: [{ latitude: 1, longitude: 2 }], fireSeq: 1 })
    act(() => result.current.discard())
    expect(result.current).toMatchObject({ fireField: null, fireSeq: 1 })
  })

  // #560: a run that does not commit changes nothing. The same objects come
  // back, not equal copies, so a surface keyed on them sees no change.
  it('puts the committed report back, exactly, over the partial rows of a run that did not commit', () => {
    const { result } = renderHook(() => useAnalysisReport())
    const committedField = [{ latitude: 1, longitude: 2 }]
    act(() => {
      result.current.publishCandidates(committedField)
      result.current.commit(DATA, ROWS, VIEW)
    })
    const partial = { results: [resultRow({ name: 'C', latitude: 40 })], total_queried: 9, total_matched: 9 }
    act(() => {
      result.current.publishCandidates([{ latitude: 40, longitude: -120 }])
      result.current.commitArriving(partial, partial.results, { ...VIEW, polygonKey: 'ring B' })
    })
    expect(result.current.response).toBe(partial)
    act(() => result.current.discard())
    expect(result.current.response).toBe(DATA)
    expect(result.current.universe).toBe(ROWS)
    expect(result.current.analyzed).toBe(VIEW)
    expect(result.current.fireField).toBe(committedField)
    expect(result.current).toMatchObject({ arriving: false, analysisSeq: 1 })
  })

  // #560: the map closes its popups on this, so it moves only when partial
  // rows were on screen to be opened over.
  it('counts a discard only when the run had shown partial rows', () => {
    const { result } = renderHook(() => useAnalysisReport())
    act(() => result.current.commit(DATA, ROWS, VIEW))
    act(() => result.current.discard())
    expect(result.current.discardSeq).toBe(0)
    act(() => result.current.commitArriving(DATA, ROWS.slice(0, 1), VIEW))
    act(() => result.current.discard())
    expect(result.current.discardSeq).toBe(1)
    act(() => result.current.discard())
    expect(result.current.discardSeq).toBe(1)
    act(() => result.current.commitArriving(DATA, ROWS.slice(0, 1), VIEW))
    act(() => result.current.commit(DATA, ROWS, VIEW))
    act(() => result.current.discard())
    expect(result.current).toMatchObject({ discardSeq: 1, analysisSeq: 2 })
  })

  it('returns to no report when the first run does not commit', () => {
    const { result } = renderHook(() => useAnalysisReport())
    act(() => result.current.commitArriving(DATA, ROWS, VIEW))
    act(() => result.current.discard())
    expect(result.current).toMatchObject({ response: null, universe: null, analyzed: null, arriving: false, analysisSeq: 0 })
  })

  it('puts back nothing from before a clear', () => {
    const { result } = renderHook(() => useAnalysisReport())
    act(() => result.current.commit(DATA, ROWS, VIEW))
    act(() => result.current.clear())
    act(() => result.current.commitArriving(DATA, ROWS, VIEW))
    act(() => result.current.discard())
    expect(result.current).toMatchObject({ response: null, universe: null, analyzed: null })
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
