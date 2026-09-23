import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalyzeRequest, DestinationResult } from '../types'
import { discoverCandidates, readErrorBody, runAnalysisPipeline, type PipelineOptions } from './analysisPipeline'
import { AnalysisRefusalError, runClientAnalysis } from './clientAnalyze'
import { FALLBACK_WINDOW_LIMITS } from './forecastWindow'
import { FORECAST_REUSE_MS, type HeldForecasts } from './forecastReuse'
import { fakeResponse, resultRow } from '../testSupport/fixtures'

// The ranking itself is clientAnalyze.ts's, pinned by its own suite. Here it is
// a spy, so each test sees exactly what the pipeline hands it and returns.
vi.mock('./clientAnalyze', async (actual) => ({
  ...(await actual<typeof import('./clientAnalyze')>()),
  runClientAnalysis: vi.fn(),
}))
const ranked = vi.mocked(runClientAnalysis)

const HOUR = 3_600_000
const NOW = Date.parse('2026-07-20T12:00:00Z')
const RING = { type: 'Polygon' as const, coordinates: [[[-121.9, 47.4], [-121.7, 47.4], [-121.7, 47.55], [-121.9, 47.4]]] }
const REQUEST: AnalyzeRequest = {
  polygon: RING,
  destination_types: ['peak'],
  start_datetime: '2026-07-21T00:00:00Z',
  end_datetime: '2026-07-21T02:00:00Z',
  forecast_model: 'gfs_seamless',
  limit: 1,
}
const CANDIDATE = { name: 'Probe', type: 'peak', latitude: 47.45, longitude: -121.8, elevation_ft: 5000, osm_id: 'node/1' }
const ROWS: DestinationResult[] = [
  resultRow({ name: 'A', latitude: 47.45, longitude: -121.8 }),
  resultRow({ name: 'B', latitude: 47.5, longitude: -121.75 }),
]
const signal = new AbortController().signal
let posted: unknown[] = []

function stubDestinations(payload: unknown, status = 200) {
  posted = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      posted.push(JSON.parse(String(init.body)))
      return fakeResponse(payload, status)
    }),
  )
}

function options(over: Partial<PipelineOptions> = {}): PipelineOptions {
  return {
    signal,
    held: null,
    maxDestinations: 1500,
    windowLimits: FALLBACK_WINDOW_LIMITS,
    aqiForecastDays: 5,
    now: () => NOW,
    onDiscovered: () => {},
    onPartial: () => {},
    onProgress: () => {},
    onPace: () => {},
    ...over,
  }
}

beforeEach(() => {
  ranked.mockReset()
  ranked.mockResolvedValue({ response: { results: ROWS.slice(0, 1), total_queried: 2, total_matched: 2, times: [1] }, universe: ROWS })
})
afterEach(() => vi.unstubAllGlobals())

describe('readErrorBody', () => {
  it('reads a string detail, a validation array, and the refusal fields', async () => {
    expect(await readErrorBody(fakeResponse({ detail: 'Too big.' }, 400))).toEqual({ message: 'Too big.', refusal: null })
    expect((await readErrorBody(fakeResponse({ detail: [{ msg: 'a' }, { msg: 'b' }] }, 422))).message).toBe('a; b')
    const refusal = await readErrorBody(fakeResponse({ detail: 'Over.', found: 2000 }, 400))
    expect(refusal.refusal).toMatchObject({ found: 2000 })
  })

  it('falls back to the status when the body says nothing', async () => {
    expect((await readErrorBody(new Response('not json', { status: 502 }))).message).toBe('HTTP 502')
  })
})

describe('discoverCandidates', () => {
  it('sends the discovery knobs with their defaults, and custom rows only when there are some', async () => {
    stubDestinations({ destinations: [CANDIDATE], total: 1, total_found: 9, truncated: true, snow_analysis_date: '2026-07-19' })
    const found = await discoverCandidates(REQUEST, signal)
    expect(posted[0]).toMatchObject({ include_unnamed_peaks: false, top_by_elevation: false })
    expect(posted[0]).not.toHaveProperty('custom_destinations')
    expect(found).toEqual({ candidates: [CANDIDATE], totalFound: 9, truncated: true, snowAnalysisDate: '2026-07-19' })

    const custom = [{ name: 'Mine', latitude: 47, longitude: -121 }]
    await discoverCandidates({ ...REQUEST, custom_destinations: custom }, signal)
    expect(posted[1]).toMatchObject({ custom_destinations: custom })
  })

  it('throws a refusal for a structured 400, and a plain error otherwise', async () => {
    stubDestinations({ detail: 'Over the cap.', found: 2000 }, 400)
    await expect(discoverCandidates(REQUEST, signal)).rejects.toBeInstanceOf(AnalysisRefusalError)
    stubDestinations({ detail: 'Bad ring.' }, 400)
    const plain = discoverCandidates(REQUEST, signal)
    await expect(plain).rejects.toThrow('Bad ring.')
    await expect(plain).rejects.not.toBeInstanceOf(AnalysisRefusalError)
  })

  it('resolves a custom list without a ring, and reports no date when none came', async () => {
    const custom = [{ name: 'Mine', latitude: 47, longitude: -121 }]
    stubDestinations({ destinations: [{ ...CANDIDATE, name: 'Mine' }], total: 1 })
    const found = await discoverCandidates({ ...REQUEST, polygon: undefined, custom_destinations: custom }, signal)
    expect(found.candidates.map((c) => c.name)).toEqual(['Mine'])
    expect(found).toMatchObject({ totalFound: null, truncated: false, snowAnalysisDate: null })
  })
})

describe('runAnalysisPipeline', () => {
  it('announces the field before any forecast is ranked', async () => {
    stubDestinations({ destinations: [CANDIDATE], total: 1 })
    const order: string[] = []
    ranked.mockImplementation(async () => {
      order.push('ranked')
      return { response: { results: [], total_queried: 0, total_matched: 0 }, universe: [] }
    })
    await runAnalysisPipeline(REQUEST, options({ onDiscovered: (f) => order.push(`found ${f.candidates.length}`) }))
    expect(order).toEqual(['found 1', 'ranked'])
  })

  it('shapes each partial field as the report the screen shows', async () => {
    stubDestinations({ destinations: [CANDIDATE], total: 1 })
    ranked.mockImplementation(async (_r, _c, _s, _e, cb) => {
      cb!.onPartial!(ROWS, [7])
      return { response: { results: [], total_queried: 0, total_matched: 0 }, universe: [] }
    })
    const onPartial = vi.fn()
    await runAnalysisPipeline(REQUEST, options({ onPartial }))
    expect(onPartial).toHaveBeenCalledWith(
      { results: ROWS.slice(0, 1), total_queried: 2, total_matched: 2, times: [7] },
      ROWS,
    )
  })

  it('merges the truncation discovery reported into the report', async () => {
    stubDestinations({ destinations: [CANDIDATE], total: 1, total_found: 3000, truncated: true })
    const out = await runAnalysisPipeline(REQUEST, options())
    expect(out.response).toMatchObject({ total_found: 3000, truncated: true })
    expect(out.field).toBe(ROWS)
  })

  it('reuses a held field for the same resolved window and model, and holds the result', async () => {
    stubDestinations({ destinations: [CANDIDATE], total: 1 })
    const startMs = Date.parse(REQUEST.start_datetime)
    const held: HeldForecasts = {
      rows: ROWS, times: [1], startMs, endMs: startMs + 2 * HOUR, model: 'gfs_seamless', fetchedAtMs: NOW - 60_000,
    }
    const out = await runAnalysisPipeline(REQUEST, options({ held }))
    expect(ranked.mock.calls[0][4]!.reuse).toEqual({ rows: ROWS, times: [1] })
    // The clock stays on the first fetch.
    expect(out.held).toMatchObject({ rows: ROWS, times: [1], fetchedAtMs: NOW - 60_000 })
  })

  it('fetches afresh once the held field is fifteen minutes old', async () => {
    stubDestinations({ destinations: [CANDIDATE], total: 1 })
    const startMs = Date.parse(REQUEST.start_datetime)
    const held: HeldForecasts = {
      rows: ROWS, times: [1], startMs, endMs: startMs + 2 * HOUR, model: 'gfs_seamless', fetchedAtMs: NOW - FORECAST_REUSE_MS,
    }
    const out = await runAnalysisPipeline(REQUEST, options({ held }))
    expect(ranked.mock.calls[0][4]!.reuse).toBeNull()
    expect(out.held.fetchedAtMs).toBe(NOW)
  })

  it('fetches the cloud column only when the request names it', async () => {
    stubDestinations({ destinations: [CANDIDATE], total: 1 })
    await runAnalysisPipeline(REQUEST, options())
    await runAnalysisPipeline({ ...REQUEST, sort_by: 'cloud_base_min_ft' }, options())
    expect(ranked.mock.calls.map((c) => c[4]!.cloud)).toEqual([false, true])
  })

  it('refuses a window outside the limits before it asks the server anything', async () => {
    stubDestinations({ destinations: [], total: 0 })
    const late = { ...REQUEST, start_datetime: '2027-07-21T00:00:00Z', end_datetime: '2027-07-21T02:00:00Z' }
    await expect(runAnalysisPipeline(late, options())).rejects.toThrow(/forecast horizon/)
    expect(posted).toEqual([])
  })
})
