import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { type PresentedReportInputs, usePresentedReport } from './usePresentedReport'
import { analyzedSnapshot, place, resultRow } from '../testSupport/fixtures'
import type { AnalyzeResponse, DestinationResult } from '../types'
import { NO_CONSTRAINTS } from '../utils/constraints'
import { geoKey } from '../utils/points'
import type { PresentationKnobs } from '../utils/present'

const PEAK = resultRow({ name: 'Mount Rainier', osm_id: 'node/1', precip_total_in: 0.1 })
const ECHO = resultRow({
  name: 'Mount Baker',
  type: 'custom',
  latitude: 48.7768,
  longitude: -121.8144,
  precip_total_in: 0.2,
})
const WET = resultRow({ name: 'Mount Adams', latitude: 46.2, longitude: -121.49, precip_total_in: 0.9 })
const FIELD = [PEAK, ECHO, WET]
const RESPONSE: AnalyzeResponse = { results: FIELD, total_queried: 3, total_matched: 3 }
const KNOBS: PresentationKnobs = { sortBy: 'precip_total_in', sortDesc: false, limit: 200, constraints: NO_CONSTRAINTS }
const VIEW = { sortBy: KNOBS.sortBy, sortDesc: KNOBS.sortDesc }
const SNAPSHOT = analyzedSnapshot()
const NONE: ReadonlySet<string> = new Set()
const NO_PLACES: PresentedReportInputs['places'] = []
const NO_ROWS: PresentedReportInputs['csvRows'] = []

function inputs(over: Partial<PresentedReportInputs> = {}): PresentedReportInputs {
  return {
    universe: FIELD,
    response: RESPONSE,
    analyzed: SNAPSHOT,
    analysisSeq: 1,
    arriving: false,
    liveKnobs: KNOBS,
    view: VIEW,
    pointSample: false,
    removedKeys: NONE,
    activeRemovedKeys: NONE,
    places: NO_PLACES,
    csvRows: NO_ROWS,
    ...over,
  }
}

const names = (rows: DestinationResult[]) => rows.map((r) => r.name)

describe('usePresentedReport', () => {
  it('ranks the held field and counts what it shows', () => {
    const { result } = renderHook(() => usePresentedReport(inputs()))
    expect(names(result.current.results)).toEqual(['Mount Rainier', 'Mount Baker', 'Mount Adams'])
    expect(result.current.rowCount).toBe('3 of 3')
    expect(result.current.emptyReason).toBeNull()
    expect(result.current.windowTitle).not.toBeNull()
  })

  it('marks the count while the field is still arriving', () => {
    const { result } = renderHook(() => usePresentedReport(inputs({ arriving: true })))
    expect(result.current.rowCount).toBe('3 of 3 so far')
  })

  // A refresh echo comes back as `custom` with no OSM id; a searched place's
  // geocoded kind is what puts the badge back. The identity is remembered
  // after a render, so it reaches the next report rather than the one on
  // screen, which is when an echo arrives.
  it('restores a searched place identity onto its echoed row', () => {
    const places = [place({ osmId: 'node/2' })]
    let universe = FIELD
    const { result, rerender } = renderHook(() => usePresentedReport(inputs({ places, universe })))
    universe = [...FIELD]
    rerender()
    const baker = result.current.results.find((r) => r.name === 'Mount Baker')
    expect(baker).toMatchObject({ type: 'peak', osm_id: 'node/2' })
  })

  it('says the rows were removed when a × emptied the table', () => {
    const removedKeys = new Set(FIELD.map((r) => geoKey(r.latitude, r.longitude)))
    const { result } = renderHook(() => usePresentedReport(inputs({ removedKeys })))
    expect(result.current.results).toEqual([])
    expect(result.current.emptyReason).toBe(
      'All rows have been removed from this analysis. Use Removed above to restore them.',
    )
  })

  it('fades the rows a live knob cut, and none on the first report', () => {
    let knobs = KNOBS
    const { result, rerender } = renderHook(() => usePresentedReport(inputs({ liveKnobs: knobs })))
    expect(result.current.leavingRowKeys.size).toBe(0)
    knobs = { ...KNOBS, limit: 1 }
    rerender()
    expect([...result.current.leavingRowKeys].sort()).toEqual(
      [ECHO, WET].map((r) => geoKey(r.latitude, r.longitude)).sort(),
    )
  })

  it('drops a detail sort when a new report lands', () => {
    let seq = 1
    const { result, rerender } = renderHook(() => usePresentedReport(inputs({ analysisSeq: seq })))
    act(() => result.current.sortDetail('name', 'desc'))
    expect(result.current.detailSort).toEqual({ key: 'name', dir: 'desc' })
    seq = 2
    rerender()
    expect(result.current.detailSort).toEqual({ key: 'precip_total_in', dir: 'asc' })
  })

  it('lists a named place as pending until an analysis covers it', () => {
    const places = [place()]
    const before = renderHook(() => usePresentedReport(inputs({ places, analyzed: null })))
    expect(before.result.current.pending).toHaveLength(1)
    const covered = analyzedSnapshot({ customKeys: new Set([geoKey(places[0].lat, places[0].lon)]) })
    const after = renderHook(() => usePresentedReport(inputs({ places, analyzed: covered })))
    expect(after.result.current.pending).toHaveLength(0)
  })
})
