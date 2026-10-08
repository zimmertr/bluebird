import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalyzeRequest, DestinationResult, GeoPolygon } from '../types'
import {
  DISCOVERY_UNAVAILABLE_MESSAGE,
  UNDESCRIBED_FAILURE_MESSAGE,
  discoverCandidates,
  readErrorBody,
  runAnalysisPipeline,
  type PipelineOptions,
} from './analysisPipeline'
import { AnalysisRefusalError, runClientAnalysis } from './clientAnalyze'
import { FALLBACK_WINDOW_LIMITS } from './forecastWindow'
import { FORECAST_REUSE_MS, type HeldForecasts } from './forecastReuse'
import { geoKey } from './points'
import { discoverFromTiles, tileDiscoverable } from './tileDiscovery'
import { discovered, fakeResponse, resultRow } from '../testSupport/fixtures'

// The ranking itself is clientAnalyze.ts's, pinned by its own suite. Here it is
// a spy, so each test sees exactly what the pipeline hands it and returns.
vi.mock('./clientAnalyze', async (actual) => ({
  ...(await actual<typeof import('./clientAnalyze')>()),
  runClientAnalysis: vi.fn(),
}))
const ranked = vi.mocked(runClientAnalysis)

// The tiles' discovery is tileDiscovery.ts's, pinned by its own suite; here
// what it answers is scripted, and the live tile fetcher is a stub.
vi.mock('./tileDiscovery', async (actual) => ({
  ...(await actual<typeof import('./tileDiscovery')>()),
  discoverFromTiles: vi.fn(async () => null),
  tileDiscoverable: vi.fn(() => true),
}))
vi.mock('./peakTiles', async (actual) => ({
  ...(await actual<typeof import('./peakTiles')>()),
  tileTemplate: vi.fn(async () => 'https://tiles.test/{z}/{x}/{y}.pbf'),
  fetchTileWith: vi.fn(() => async () => new Uint8Array()),
}))
const fromTiles = vi.mocked(discoverFromTiles)
const discoverable = vi.mocked(tileDiscoverable)

const HOUR = 3_600_000
const NOW = Date.parse('2026-07-20T12:00:00Z')
const RING: GeoPolygon = { type: 'Polygon', coordinates: [[[-121.9, 47.4], [-121.7, 47.4], [-121.7, 47.55], [-121.9, 47.4]]] }
const REQUEST: AnalyzeRequest = {
  polygon: RING,
  destination_types: ['peak'],
  start_datetime: '2026-07-21T00:00:00Z',
  end_datetime: '2026-07-21T02:00:00Z',
  forecast_model: 'gfs_seamless',
  limit: 1,
}
const CANDIDATE = discovered()
const ROWS: DestinationResult[] = [
  resultRow({ name: 'A', latitude: 47.45, longitude: -121.8 }),
  resultRow({ name: 'B', latitude: 47.5, longitude: -121.75 }),
]
const signal = new AbortController().signal
interface PostedBody {
  destination_types?: string[]
  custom_destinations?: Record<string, unknown>[]
  elevation_lookup?: boolean
}
let posted: PostedBody[] = []

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
  ranked.mockResolvedValue({ response: { results: ROWS.slice(0, 1), total_queried: 2, total_matched: 2, times: [1] }, universe: ROWS, aqiFailed: new Set(), columns: new Map(), late: null })
})
afterEach(() => vi.unstubAllGlobals())

describe('readErrorBody', () => {
  it('reads a string detail, a validation array, and the refusal fields', async () => {
    expect(await readErrorBody(fakeResponse({ detail: 'Too big.' }, 400))).toEqual({ message: 'Too big.', refusal: null })
    expect((await readErrorBody(fakeResponse({ detail: [{ msg: 'a' }, { msg: 'b' }] }, 422))).message).toBe('a; b')
    const refusal = await readErrorBody(fakeResponse({ detail: 'Over.', found: 2000 }, 400))
    expect(refusal.refusal).toMatchObject({ found: 2000 })
  })

  // A body the pod did not write says nothing; the reader still gets one of
  // the pod's own sentences rather than "HTTP 502" (#579).
  it('says the map service is unavailable for a 502 or 504 with nothing in it', async () => {
    expect((await readErrorBody(fakeResponse({ raw: 'not json' }, 502))).message).toBe(
      'OpenStreetMap is not available. Try again later.',
    )
    expect((await readErrorBody(fakeResponse({ raw: '<html>' }, 504))).message).toBe(DISCOVERY_UNAVAILABLE_MESSAGE)
  })

  it('says something went wrong for any other status with nothing in it', async () => {
    expect((await readErrorBody(fakeResponse({ raw: 'not json' }, 500))).message).toBe(
      'Something went wrong. Try again later.',
    )
    expect((await readErrorBody(fakeResponse({}, 503))).message).toBe(UNDESCRIBED_FAILURE_MESSAGE)
  })
})

// A polygon run reads the basemap's tiles first (#675): what they answer
// rides to the pod as custom rows, the pod discovers the trailheads alone, and the rows come back with the kinds and ids the tiles
// gave them. When the tiles cannot answer, the run takes the map server's
// path as before.
describe('a polygon run and the tiles', () => {
  const ALPHA = discovered({ name: 'Alpha', type: 'peak', latitude: 47.45, longitude: -121.8, elevation_ft: 8000, osm_id: 'node/1' })
  const TARN = discovered({ name: 'Tarn', type: 'lake', latitude: 47.5, longitude: -121.75, elevation_ft: null, osm_id: 'way/2' })
  const asCustom = (d: typeof ALPHA) => ({ ...d, type: 'custom', osm_id: null })
  const found = () => {
    const seen: Awaited<ReturnType<typeof discoverCandidates>>[] = []
    ranked.mockResolvedValue({ response: { results: [], total_queried: 0, total_matched: 0 }, universe: [], aqiFailed: new Set<string>(), columns: new Map(), late: null })
    return { seen, onDiscovered: (f: (typeof seen)[number]) => seen.push(f) }
  }

  beforeEach(() => {
    fromTiles.mockReset()
    fromTiles.mockResolvedValue(null)
    discoverable.mockReset()
    discoverable.mockReturnValue(true)
  })

  it('sends the pod the tile rows and the trailheads to find, and puts the kinds and ids back', async () => {
    fromTiles.mockResolvedValue([ALPHA, TARN])
    const trailhead = discovered({ name: 'Gate', type: 'trailhead', latitude: 47.46, longitude: -121.79, elevation_ft: 3000, osm_id: 'node/9' })
    stubDestinations({ destinations: [trailhead, asCustom(ALPHA), asCustom(TARN)], total: 3 })
    const { seen, onDiscovered } = found()
    await runAnalysisPipeline({ ...REQUEST, destination_types: ['peak', 'lake', 'trailhead'] }, options({ onDiscovered }))
    expect(posted[0]).toMatchObject({
      destination_types: ['trailhead'],
      elevation_lookup: false,
      custom_destinations: [
        { name: 'Alpha', latitude: 47.45, longitude: -121.8, elevation_ft: 8000 },
        { name: 'Tarn', latitude: 47.5, longitude: -121.75 },
      ],
    })
    expect(posted[0].custom_destinations?.[1]).not.toHaveProperty('elevation_ft')
    expect(seen[0].candidates).toEqual([trailhead, ALPHA, TARN])
    expect(seen[0]).toMatchObject({ totalFound: null, truncated: false })
  })

  it('asks the pod for no kind at all when the tiles answered every one', async () => {
    fromTiles.mockResolvedValue([ALPHA])
    stubDestinations({ destinations: [asCustom(ALPHA)], total: 1 })
    const { onDiscovered } = found()
    await runAnalysisPipeline({ ...REQUEST, destination_types: ['peak', 'lake'] }, options({ onDiscovered }))
    expect(posted[0]).toMatchObject({ destination_types: [], elevation_lookup: false })
    expect(fromTiles.mock.calls[0].slice(0, 3)).toEqual([RING.coordinates[0], ['peak', 'lake'], false])
  })

  it('carries the reader\'s own list beside the tile rows, with what the lookup learned', async () => {
    fromTiles.mockResolvedValue([ALPHA])
    stubDestinations({ destinations: [asCustom(ALPHA), discovered({ name: 'Mine', type: 'custom', latitude: 47, longitude: -121, elevation_ft: 6000, osm_id: null })], total: 2 })
    const { seen, onDiscovered } = found()
    const identity = new Map([[geoKey(47, -121), { elevation_ft: 6000, osm_id: 'node/77' }]])
    await runAnalysisPipeline(
      { ...REQUEST, custom_destinations: [{ name: 'Mine', latitude: 47, longitude: -121 }] },
      options({ onDiscovered, identity: { latest: () => identity }, knownTypes: { [geoKey(47, -121)]: 'peak' } }),
    )
    expect(posted[0].custom_destinations).toEqual([
      { name: 'Alpha', latitude: 47.45, longitude: -121.8, elevation_ft: 8000 },
      { name: 'Mine', latitude: 47, longitude: -121, elevation_ft: 6000 },
    ])
    expect(seen[0].candidates[1]).toMatchObject({ name: 'Mine', type: 'peak', elevation_ft: 6000, osm_id: 'node/77' })
  })

  it('takes the map server\'s path when the tiles cannot answer the ring', async () => {
    stubDestinations({ destinations: [CANDIDATE], total: 1 })
    const { onDiscovered } = found()
    await runAnalysisPipeline(REQUEST, options({ onDiscovered }))
    expect(posted[0]).toMatchObject({ destination_types: ['peak'] })
    expect(posted[0]).not.toHaveProperty('elevation_lookup')
    expect(posted[0]).not.toHaveProperty('custom_destinations')

    discoverable.mockReturnValue(false)
    fromTiles.mockResolvedValue([ALPHA])
    await runAnalysisPipeline(REQUEST, options({ onDiscovered }))
    expect(fromTiles).toHaveBeenCalledTimes(1)
    expect(posted[1]).toMatchObject({ destination_types: ['peak'] })
  })

  it('applies the cap before the call, as the pod would to the union', async () => {
    const many = Array.from({ length: 3 }, (_, i) => discovered({ name: `P${i}`, latitude: 47.4 + i / 100, longitude: -121.8, elevation_ft: 1000 * (i + 1), osm_id: `node/${i}` }))
    fromTiles.mockResolvedValue(many)
    stubDestinations({ destinations: [], total: 0 })
    const { seen, onDiscovered } = found()
    await expect(runAnalysisPipeline(REQUEST, options({ onDiscovered, maxDestinations: 2 }))).rejects.toBeInstanceOf(AnalysisRefusalError)
    expect(posted).toEqual([])

    stubDestinations({ destinations: [], total: 0 })
    await runAnalysisPipeline({ ...REQUEST, top_by_elevation: true }, options({ onDiscovered, maxDestinations: 2 }))
    expect(posted[0].custom_destinations?.map((c) => c.name)).toEqual(['P2', 'P1'])
    expect(seen[0]).toMatchObject({ totalFound: 3, truncated: true })
  })
})

describe('discoverCandidates', () => {
  it('sends the discovery knobs with their defaults, and custom rows only when there are some', async () => {
    stubDestinations({ destinations: [CANDIDATE], total: 1, total_found: 9, truncated: true })
    const found = await discoverCandidates(REQUEST, signal)
    expect(posted[0]).toMatchObject({ include_unnamed_peaks: false, top_by_elevation: false })
    expect(posted[0]).not.toHaveProperty('custom_destinations')
    expect(found).toEqual({ candidates: [CANDIDATE], totalFound: 9, truncated: true })

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

})

describe('runAnalysisPipeline', () => {
  it('gives a custom row the kind the browser knows before anything reads its type (#545)', async () => {
    const lake = discovered({ name: 'Tarn', type: 'custom', elevation_ft: null, osm_id: null })
    stubDestinations({ destinations: [lake], total: 1 })
    const seen: string[] = []
    await runAnalysisPipeline(
      { ...REQUEST, polygon: undefined, custom_destinations: [{ name: 'Tarn', latitude: lake.latitude, longitude: lake.longitude }] },
      options({
        knownTypes: { [geoKey(lake.latitude, lake.longitude)]: 'lake' },
        onDiscovered: (f) => seen.push(...f.candidates.map((c) => c.type)),
      }),
    )
    expect(seen).toEqual(['lake'])
    expect(ranked.mock.calls[0][1].map((c) => c.type)).toEqual(['lake'])
  })

  // A run with no polygon discovers nothing, so its forecasts do not wait on
  // the pod's lookup of its rows (#643).
  it('starts a custom list on the rows it was sent, with the lookup still out', async () => {
    let answer!: (r: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => (answer = r))))
    const custom = [{ name: 'Mine', latitude: 47, longitude: -121 }]
    const order: string[] = []
    let handed: Promise<readonly unknown[]> | undefined
    ranked.mockImplementation(async (_r, candidates, _s, _e, cb) => {
      order.push(`ranked ${candidates.map((c) => `${c.name}:${c.elevation_ft}`).join()}`)
      handed = cb!.resolving
      return { response: { results: [], total_queried: 0, total_matched: 0 }, universe: [], aqiFailed: new Set<string>(), columns: new Map(), late: null }
    })
    await runAnalysisPipeline(
      { ...REQUEST, polygon: undefined, custom_destinations: custom },
      options({
        knownTypes: { [geoKey(47, -121)]: 'peak' },
        onDiscovered: (f) => order.push(`found ${f.candidates.length}`),
      }),
    )
    // Announced and ranked while the server has said nothing.
    expect(order).toEqual(['found 1', 'ranked Mine:null'])

    answer(
      fakeResponse({
        destinations: [discovered({ name: 'Mine', type: 'custom', latitude: 47, longitude: -121, elevation_ft: 6000 })],
        total: 1,
      }),
    )
    // The lookup's rows reach the ranking with the browser's own kinds on them.
    expect(await handed).toMatchObject([{ name: 'Mine', type: 'peak', elevation_ft: 6000 }])
  })

  // #673: the ranking lands before the lookup; what the lookup changes rides
  // on `late`, and the rows waiting on it ride on `pending`.
  it('hands the late patch on, and names the rows waiting on it', async () => {
    const custom = [{ name: 'Mine', latitude: 47, longitude: -121 }]
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        fakeResponse({
          destinations: [discovered({ name: 'Mine', type: 'custom', latitude: 47, longitude: -121, elevation_ft: 6000 })],
          total: 1,
        }),
      ),
    )
    const patched = resultRow({ name: 'Mine', latitude: 47, longitude: -121, elevation_ft: 6000 })
    ranked.mockImplementation(async (_r, _c, _s, _e, cb) => ({
      response: { results: [], total_queried: 1, total_matched: 1 },
      universe: [],
      aqiFailed: new Set<string>(),
      columns: new Map([[geoKey(47, -121), { weather: { hourly: { time: [] } } }]]),
      late: cb!.resolving!.then(() => ({ rows: [patched], columns: new Map() })),
    }))
    const out = await runAnalysisPipeline({ ...REQUEST, polygon: undefined, custom_destinations: custom }, options())
    expect([...out.pending]).toEqual([geoKey(47, -121)])
    expect(out.held.columns?.size).toBe(1)
    expect(await out.late).toEqual({ rows: [patched], columns: new Map() })
  })

  // #673: the list goes to the pod at once, with the elevations the browser's
  // own lookup has learned by now and no lookup asked for, so the call answers
  // at once. The lookup's later answers reach the report
  // through the hook, never through this call.
  it('resolves the list with what the lookup has learned, asking the pod for no lookup, without waiting', async () => {
    const custom = [{ name: 'Mine', latitude: 47, longitude: -121 }, { name: 'Other', latitude: 48, longitude: -122 }]
    const bodies: { custom_destinations: { name: string; elevation_ft?: number }[]; elevation_lookup?: boolean }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init: RequestInit) => {
        bodies.push(JSON.parse(init.body as string))
        return fakeResponse({
          destinations: custom.map((c) => discovered({ ...c, type: 'custom', elevation_ft: c.name === 'Mine' ? 6000 : null, osm_id: null })),
          total: 2,
          elevation_lookup_complete: false,
        })
      }),
    )
    const learned = new Map([[geoKey(47, -121), { elevation_ft: 6000, osm_id: 'node/1' }]])
    const identity = { latest: () => learned }
    const order: string[] = []
    ranked.mockImplementation(async (_r, candidates, _s, _e, cb) => {
      order.push(`ranked ${candidates.map((c) => String(c.elevation_ft)).join()}`)
      await cb!.resolving
      return { response: { results: [], total_queried: 0, total_matched: 0 }, universe: [], aqiFailed: new Set<string>(), columns: new Map(), late: null }
    })
    await runAnalysisPipeline({ ...REQUEST, polygon: undefined, custom_destinations: custom }, options({ identity }))
    // The field carries what was learned from the start.
    expect(order).toEqual(['ranked 6000,null'])
    expect(bodies).toHaveLength(1)
    expect(bodies[0].custom_destinations.map((c) => c.elevation_ft)).toEqual([6000, undefined])
    expect(bodies[0].elevation_lookup).toBe(false)
  })

  // The one run that asks the pod to look up: an over-cap list keeping its
  // highest cannot choose without every elevation.
  it('asks the pod to look up for an over-cap list keeping its highest', async () => {
    const custom = Array.from({ length: 3 }, (_, i) => ({ name: `Row ${i}`, latitude: 47 + i, longitude: -121 }))
    const bodies: { elevation_lookup?: boolean }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init: RequestInit) => {
        bodies.push(JSON.parse(init.body as string))
        return fakeResponse({ destinations: custom.map((c) => discovered({ ...c, type: 'custom' })), total: 3 })
      }),
    )
    ranked.mockResolvedValue({ response: { results: [], total_queried: 0, total_matched: 0 }, universe: [], aqiFailed: new Set<string>(), columns: new Map(), late: null })
    await runAnalysisPipeline(
      { ...REQUEST, polygon: undefined, custom_destinations: custom, top_by_elevation: true },
      options({ maxDestinations: 2 }),
    )
    expect(bodies[0].elevation_lookup).toBe(true)
  })

  it('names no row as waiting when the ranking already waited for the lookup', async () => {
    stubDestinations({ destinations: [CANDIDATE], total: 1 })
    const held = new Map([[geoKey(47, -121), { weather: { hourly: { time: [] } } }]])
    ranked.mockResolvedValueOnce({
      response: { results: [], total_queried: 1, total_matched: 1 },
      universe: [],
      aqiFailed: new Set<string>(),
      columns: held,
      late: null,
    })
    const out = await runAnalysisPipeline(REQUEST, options())
    expect(out.pending.size).toBe(0)
    expect(out.late).toBeNull()
    // The columns are still held for a later run's lookup.
    expect(out.held.columns).toBe(held)
  })

  it('hands a ring no lookup: discovery already answered', async () => {
    stubDestinations({ destinations: [CANDIDATE], total: 1 })
    await runAnalysisPipeline(REQUEST, options())
    expect(ranked.mock.calls[0][4]!.resolving).toBeUndefined()
  })

  it('announces the field before any forecast is ranked', async () => {
    stubDestinations({ destinations: [CANDIDATE], total: 1 })
    const order: string[] = []
    ranked.mockImplementation(async () => {
      order.push('ranked')
      return { response: { results: [], total_queried: 0, total_matched: 0 }, universe: [], aqiFailed: new Set<string>(), columns: new Map(), late: null }
    })
    await runAnalysisPipeline(REQUEST, options({ onDiscovered: (f) => order.push(`found ${f.candidates.length}`) }))
    expect(order).toEqual(['found 1', 'ranked'])
  })

  it('shapes each partial field as the report the screen shows', async () => {
    stubDestinations({ destinations: [CANDIDATE], total: 1 })
    ranked.mockImplementation(async (_r, _c, _s, _e, cb) => {
      cb!.onPartial!(ROWS, [7])
      return { response: { results: [], total_queried: 0, total_matched: 0 }, universe: [], aqiFailed: new Set<string>(), columns: new Map(), late: null }
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
      aqiFailed: new Set(['held']),
    }
    const stillFailed = new Set(['still'])
    ranked.mockResolvedValueOnce({
      response: { results: ROWS.slice(0, 1), total_queried: 2, total_matched: 2, times: [1] },
      universe: ROWS,
      aqiFailed: stillFailed,
      columns: new Map(),
      late: null,
    })
    const out = await runAnalysisPipeline(REQUEST, options({ held }))
    // The rows whose air quality failed go to the run that may ask again
    // (#580), and the ones that failed again come back to be held.
    expect(ranked.mock.calls[0][4]!.reuse).toEqual({ rows: ROWS, times: [1], aqiFailed: new Set(['held']) })
    // The clock stays on the first fetch.
    expect(out.held).toMatchObject({ rows: ROWS, times: [1], fetchedAtMs: NOW - 60_000 })
    expect(out.held.aqiFailed).toBe(stillFailed)
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

  it('refuses a window outside the limits before it asks the server anything', async () => {
    stubDestinations({ destinations: [], total: 0 })
    const late = { ...REQUEST, start_datetime: '2027-07-21T00:00:00Z', end_datetime: '2027-07-21T02:00:00Z' }
    await expect(runAnalysisPipeline(late, options())).rejects.toThrow(/forecast horizon/)
    expect(posted).toEqual([])
  })
})
