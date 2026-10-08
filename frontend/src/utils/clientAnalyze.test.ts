import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnalyzeRequest, DestinationResult, DiscoveredDestination, GeoPolygon } from '../types'
import {
  MAX_ANALYZE_DESTINATIONS,
  alignAqi,
  alignCloud,
  analysisNoun,
  assemble,
  canonicalTimes,
  capDetail,
  customRows,
  discoveryBase,
  followTail,
  isDiscoveryRefresh,
  knownTypes,
  rankComparator,
  refreshEchoRows,
  resolveCustomOnly,
  runClientAnalysis,
  truncateTopElevation,
  withCloud,
  withKnownTypes,
  withWeather,
} from './clientAnalyze'
import { geoKey } from './points'
import { WeatherResult, fetchAqi, resetOpenMeteoState } from './openMeteo'
import vectors from '../../../backend/tests/data/weather_vectors.json'
import { fakeResponse, place, resultRow, series, WEATHER_UNITS, weatherResult } from '../testSupport/fixtures'

// ── Vector-pinned: the AQI-onto-weather-grid alignment ─────────────────────

describe('alignAqi vectors', () => {
  type AlignCase = {
    name: string
    times_ms: number[]
    aqi_series: { times: number[]; aqi: (number | null)[] } | null
    expected: (number | null)[]
  }
  for (const c of vectors.align as unknown as AlignCase[]) {
    it(c.name, () => {
      expect(alignAqi(c.times_ms, c.aqi_series)).toEqual(c.expected)
    })
  }
})

// ── resolveCustomOnly (the custom-only path's one server call) ─────────────

function discovered(name: string, lat = 47.5, lon = -121.9): DiscoveredDestination {
  return { name, type: 'peak', latitude: lat, longitude: lon, elevation_ft: null, osm_id: 'node/1' }
}

function resolved(name: string, elevationFt: number): DiscoveredDestination {
  return {
    name,
    type: 'custom',
    latitude: 47.5,
    longitude: -121.9,
    elevation_ft: elevationFt,
    osm_id: 'node/1',
  }
}

describe('resolveCustomOnly', () => {
  const ROWS = [{ name: 'McClellan Butte', latitude: 47.5, longitude: -121.9 }]

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stubFetch(impl: () => unknown) {
    const spy = vi.fn((_url: string, _init: RequestInit) => impl())
    vi.stubGlobal('fetch', spy)
    return spy
  }

  function sentBody(spy: ReturnType<typeof stubFetch>) {
    return JSON.parse(String(spy.mock.calls[0][1].body))
  }

  it('returns the elevations the server resolved', async () => {
    stubFetch(() => ({
      ok: true,
      json: async () => ({ destinations: [resolved('McClellan Butte', 5165)], total: 1 }),
    }))
    const out = await resolveCustomOnly(ROWS)
    expect(out.destinations.map((d) => d.elevation_ft)).toEqual([5165])
    expect(out.destinations[0].osm_id).toBe('node/1')
  })

  it('asks for a resolve, never a discovery, and says whether the pod may look up', async () => {
    const spy = stubFetch(() => ({
      ok: true,
      json: async () => ({ destinations: [resolved('McClellan Butte', 5165)], total: 1 }),
    }))
    await resolveCustomOnly(ROWS)
    const body = sentBody(spy)
    expect(body.destination_types).toEqual([])
    expect(body.custom_destinations).toHaveLength(1)
    expect(body.elevation_lookup).toBe(true)
    await resolveCustomOnly(ROWS, undefined, false)
    expect(JSON.parse(String(spy.mock.calls[1][1].body)).elevation_lookup).toBe(false)
    // The band and the cap stay client-side on this path, so sending them
    // would hand the server a say it is not being asked for.
    expect(body.polygon).toBeUndefined()
    expect(body.min_elevation_ft).toBeUndefined()
  })

  it('falls back to unresolved rows when the server refuses', async () => {
    stubFetch(() => ({ ok: false, status: 503, json: async () => ({}) }))
    const out = await resolveCustomOnly(ROWS)
    expect(out.destinations.map((d) => d.name)).toEqual(['McClellan Butte'])
    expect(out.destinations[0].elevation_ft).toBeNull()
  })

  it('falls back to unresolved rows when the request cannot be made', async () => {
    stubFetch(() => {
      throw new TypeError('Failed to fetch')
    })
    const out = await resolveCustomOnly(ROWS)
    expect(out.destinations[0].elevation_ft).toBeNull()
  })

  it('falls back when the server answers with a different number of rows', async () => {
    stubFetch(() => ({ ok: true, json: async () => ({ destinations: [], total: 0 }) }))
    const out = await resolveCustomOnly(ROWS)
    expect(out.destinations.map((d) => d.name)).toEqual(['McClellan Butte'])
  })

  it('propagates an abort instead of reporting resolved-nothing', async () => {
    const controller = new AbortController()
    stubFetch(() => {
      controller.abort()
      throw new DOMException('Aborted', 'AbortError')
    })
    await expect(resolveCustomOnly(ROWS, controller.signal)).rejects.toThrow()
  })

  it('makes no call at all for an empty list', async () => {
    const spy = stubFetch(() => ({ ok: true, json: async () => ({ destinations: [] }) }))
    expect(await resolveCustomOnly([])).toEqual({ destinations: [], lookupComplete: true })
    expect(spy).not.toHaveBeenCalled()
  })

  // The pins-only refresh used to skip the call, because elevation was the
  // only question and a searched place already carries Nominatim's answer.
  // Snow depth lifted the skip (#449) and left in #678; the skip did not come
  // back, because the pod still merges the list and answers it in
  // milliseconds when no lookup is asked for.
  it('still asks when every row already knows its elevation', async () => {
    const spy = stubFetch(() => ({
      ok: true,
      json: async () => ({ destinations: [resolved('Pinned', 6000)], total: 1 }),
    }))
    const out = await resolveCustomOnly([
      { name: 'Pinned', latitude: 47.5, longitude: -121.9, elevation_ft: 6000 },
    ])
    expect(spy).toHaveBeenCalledTimes(1)
    expect(out.destinations[0].elevation_ft).toBe(6000)
  })

  it('still asks when only some rows know their elevation', async () => {
    const spy = stubFetch(() => ({
      ok: true,
      json: async () => ({
        destinations: [resolved('Pinned', 6000), resolved('Pasted', 5165)],
        total: 2,
      }),
    }))
    await resolveCustomOnly([
      { name: 'Pinned', latitude: 47.5, longitude: -121.9, elevation_ft: 6000 },
      { name: 'Pasted', latitude: 47.4, longitude: -121.6 },
    ])
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

// ── rankComparator (port of _sort_key) ─────────────────────────────────────

// One AQI reading across all three aggregates, so a ranking by any of them
// answers the same way.
function row(name: string, aqi: number | null): DestinationResult {
  return resultRow({
    name,
    latitude: 0,
    longitude: 0,
    aqi_avg: aqi,
    aqi_min: aqi,
    aqi_max: aqi,
    series: null,
  })
}

describe('rankComparator', () => {
  it('sorts nulls last ascending', () => {
    const rows = [row('none', null), row('low', 10), row('high', 90)]
    rows.sort(rankComparator('aqi_avg', false))
    expect(rows.map((r) => r.name)).toEqual(['low', 'high', 'none'])
  })

  it('sorts nulls last descending too — a null never wins a ranking', () => {
    const rows = [row('none', null), row('low', 10), row('high', 90)]
    rows.sort(rankComparator('aqi_avg', true))
    expect(rows.map((r) => r.name)).toEqual(['high', 'low', 'none'])
  })

  it('is stable for ties', () => {
    const rows = [row('first', 10), row('second', 10)]
    rows.sort(rankComparator('aqi_avg', false))
    expect(rows.map((r) => r.name)).toEqual(['first', 'second'])
  })

  // The aggregate keys #291 made rankable go through the same comparator; a
  // key is just a field name, so one representative check per new member.
  it('ranks by the aggregate members added in #291', () => {
    const rows = [row('a', 1), row('b', 2), row('c', 3)]
    rows[0].wind_min_mph = 8
    rows[1].wind_min_mph = 0
    rows[2].wind_min_mph = 3
    rows.sort(rankComparator('wind_min_mph', false))
    expect(rows.map((r) => r.name)).toEqual(['b', 'c', 'a'])

    rows[0].precip_avg_in_hr = 0.1
    rows[1].precip_avg_in_hr = 0.3
    rows[2].precip_avg_in_hr = 0.2
    rows.sort(rankComparator('precip_avg_in_hr', true))
    expect(rows.map((r) => r.name)).toEqual(['c', 'a', 'b'])
  })

  // A null snowfall is a window the model left blank (HRRR past its reach),
  // so it sorts last either way, like every other nullable key (#678).
  it('ranks snowfall with nulls last in both directions', () => {
    const rows = [row('blank', null), row('dry', null), row('dump', null)]
    rows[0].snowfall_total_in = null
    rows[1].snowfall_total_in = 0
    rows[2].snowfall_total_in = 14
    rows.sort(rankComparator('snowfall_total_in', false))
    expect(rows.map((r) => r.name)).toEqual(['dry', 'dump', 'blank'])
    rows.sort(rankComparator('snowfall_total_in', true))
    expect(rows.map((r) => r.name)).toEqual(['dump', 'dry', 'blank'])
  })
})

// ── assemble (port of _assemble) ───────────────────────────────────────────

// Two hours, because the AQI alignment below is measured against this grid: one
// reading lands on the first stamp and the second hour has to read null.
const WX: WeatherResult = weatherResult({
  precip_total_in: 0.3,
  precip_avg_in_hr: 0.15,
  precip_max_in_hr: 0.2,
  temp_min_f: 50,
  temp_max_f: 52,
  temp_avg_f: 51,
  wind_min_mph: 5,
  wind_max_mph: 7,
  wind_avg_mph: 6,
  freeze_min_ft: 9000,
  freeze_max_ft: 9500,
  freeze_avg_ft: 9250,
  snowfall_total_in: 1.2,
  snowfall_avg_in_hr: 0.6,
  snowfall_min_in_hr: 0.5,
  snowfall_max_in_hr: 0.7,
  series: {
    times: [1784592000000, 1784595600000],
    precip_in: [0.1, 0.2],
    temp_f: [50, 52],
    wind_mph: [5, 7],
    freeze_ft: [9000, 9500],
    snowfall_in: [0.5, 0.7],
  },
})

describe('assemble', () => {
  it('drops rows whose weather came back null and keeps alignment', () => {
    const dests = [discovered('Gone'), discovered('Kept')]
    const { results, times } = assemble(dests, [null, WX], [null, null])
    expect(results.map((r) => r.name)).toEqual(['Kept'])
    expect(times).toEqual(WX.series!.times)
    expect(results[0].aqi_avg).toBeNull()
    expect(results[0].series?.aqi).toEqual([null, null])
  })

  it('aligns AQI onto the weather grid inside each row', () => {
    const aqi = {
      aqi_avg: 60,
      aqi_min: 80,
      aqi_max: 80,
      series: { times: [1784592000000], aqi: [60] },
    }
    const { results } = assemble([discovered('A')], [WX], [aqi])
    expect(results[0].aqi_avg).toBe(60)
    expect(results[0].series?.aqi).toEqual([60, null])
  })

  // Snowfall is Open-Meteo's like every aggregate above (#678), where the snow
  // depth it replaced rode on the discovered row.
  it('copies the snowfall off the weather answer', () => {
    const { results } = assemble([discovered('Snowy')], [WX], [null])
    expect(results[0].snowfall_total_in).toBe(1.2)
    expect(results[0].snowfall_max_in_hr).toBe(0.7)
    expect(results[0].series?.snowfall_in).toEqual([0.5, 0.7])
  })

  it('canonicalTimes takes the first row carrying a series', () => {
    expect(canonicalTimes([null, WX])).toEqual(WX.series!.times)
    expect(canonicalTimes([null, null])).toEqual([])
  })
})

// ── capDetail + noun (ports of _cap_detail/_noun) ──────────────────────────

describe('capDetail', () => {
  it('states what is wrong and stops', () => {
    // TJ removed the remedy prose (2026-08-22): no advice sentence, no
    // computed elevation floor. The message is the problem, nothing else.
    expect(capDetail(1201, 'peak')).toBe(
      'This search covers 1,201 peaks. The analysis limit is 1,500 destinations.',
    )
  })

  it('formats counts with separators and names the unit like the backend', () => {
    expect(capDetail(1601, 'peak')).toContain('1,601 peaks')
    expect(capDetail(1601, 'peak')).toContain('1,500 destinations')
  })
})

// ── The explicit top-N cut (port of _truncate_top_elevation) ───────────────

describe('truncateTopElevation', () => {
  it('keeps the highest and drops unknowns first', () => {
    const kept = truncateTopElevation(
      [
        { elevation_ft: null, name: 'unknown' },
        { elevation_ft: 1000, name: 'low' },
        { elevation_ft: 5000, name: 'high' },
        { elevation_ft: 3000, name: 'mid' },
      ],
      2,
    )
    expect(kept.map((d) => d.name)).toEqual(['high', 'mid'])
  })
})

describe('analysisNoun', () => {
  const base = { start_datetime: '', end_datetime: '', limit: 10 }
  it('uses the discovery noun for pure polygon runs', () => {
    expect(analysisNoun({ ...base, destination_types: ['peak'] } as AnalyzeRequest)).toBe('peak')
  })
  it('a union is a mixed set of destinations', () => {
    expect(
      analysisNoun({
        ...base,
        destination_types: ['peak'],
        custom_destinations: [{ name: 'X', latitude: 0, longitude: 0 }],
      } as AnalyzeRequest),
    ).toBe('destination')
  })
})

// ── runClientAnalysis end-to-end (fetch mocked) ────────────────────────────

const REQUEST: AnalyzeRequest = {
  destination_types: [],
  forecast_model: 'ecmwf_ifs025',
  start_datetime: '2026-07-21T00:00:00Z',
  end_datetime: '2026-07-21T02:00:00Z',
  limit: 2,
  sort_by: 'precip_total_in',
  sort_desc: false,
}

function weatherBody(precips: number[]) {
  return precips.map((p) => ({
    hourly_units: WEATHER_UNITS,
    hourly: {
      time: ['2026-07-21T00:00', '2026-07-21T01:00'],
      precipitation: [p, p],
      temperature_2m: [50, 52],
      wind_speed_10m: [5, 7],
    },
  }))
}

// Hostname compare rather than a substring: routes the mock exactly and keeps
// CodeQL's URL-sanitization rule quiet. One body per batched location.
function stubOpenMeteo(precips: number[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const isWeather = new URL(url).hostname === 'api.open-meteo.com'
      const count = new URL(url).searchParams.get('latitude')!.split(',').length
      return {
        ok: true,
        status: 200,
        json: async () =>
          isWeather
            ? weatherBody(precips.slice(0, count))
            : Array.from({ length: count }, () => ({ hourly: { time: [], us_aqi: [] } })),
      }
    }),
  )
}

// Three candidates, hourly precip doubled into the window total, so the
// ascending ranking is Dry (0.2) < Mid (0.4) < Wet (0.6) and REQUEST's
// limit of 2 cuts Wet.
const THREE = [
  { name: 'Wet', latitude: 1, longitude: 1 },
  { name: 'Dry', latitude: 2, longitude: 2 },
  { name: 'Mid', latitude: 3, longitude: 3 },
]
const THREE_PRECIPS = [0.3, 0.1, 0.2]

beforeEach(() => {
  // openMeteo.ts caches forecasts per location+window and paces against
  // module-level budgets, so without this a test sees the previous test's
  // answers and makes no request of its own.
  resetOpenMeteoState()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('runClientAnalysis', () => {
  it('ranks, trims to limit, and reports total_queried', async () => {
    stubOpenMeteo(THREE_PRECIPS)
    const dests = customRows(THREE)
    const startMs = Date.parse('2026-07-21T00:00:00Z')
    const endMs = Date.parse('2026-07-21T02:00:00Z')
    const out = await runClientAnalysis(REQUEST, dests, startMs, endMs, {
      nowMs: startMs,
    })
    expect(out.response.total_queried).toBe(3)
    expect(out.response.results.map((r) => r.name)).toEqual(['Dry', 'Mid'])
    expect(out.response.times).toHaveLength(2)
  })

  it('keeps the full ranked field behind the cut, for an exact re-rank later', async () => {
    stubOpenMeteo(THREE_PRECIPS)
    const startMs = Date.parse('2026-07-21T00:00:00Z')
    const endMs = Date.parse('2026-07-21T02:00:00Z')
    const out = await runClientAnalysis(REQUEST, customRows(THREE), startMs, endMs, {
      nowMs: startMs,
    })
    // Ranked by the request's key but NOT trimmed: 'Wet' lost the limit=2 cut
    // and is exactly the row a window change used to be unable to promote.
    expect(out.universe.map((r) => r.name)).toEqual(['Dry', 'Mid', 'Wet'])
    // Shared objects, not copies: the displayed rows are a window onto the
    // field, so the two views can never disagree about a row's numbers.
    expect(out.universe[0]).toBe(out.response.results[0])
    expect(out.universe[1]).toBe(out.response.results[1])
  })

  it('hands back the ranked field as each batch lands (#337)', async () => {
    // 60 destinations is two batches of 50 and 10. Before this the reader saw
    // a percentage and an empty table until the last one returned.
    const many = Array.from({ length: 60 }, (_, i) => ({
      name: `P${i}`,
      latitude: i + 1,
      longitude: i + 1,
    }))
    stubOpenMeteo(Array.from({ length: 60 }, (_, i) => (60 - i) / 100))
    const startMs = Date.parse('2026-07-21T00:00:00Z')
    const endMs = Date.parse('2026-07-21T02:00:00Z')
    const rounds: Array<{ count: number; first: string }> = []
    const out = await runClientAnalysis(REQUEST, customRows(many), startMs, endMs, {
      nowMs: startMs,
      onPartial: (rows) => rounds.push({ count: rows.length, first: rows[0].name }),
    })

    expect(rounds.map((r) => r.count)).toEqual([50, 60])
    // Ranked, not merely collected: the partial field is in the order the
    // finished report will use, so the table never shows an arbitrary list.
    expect(rounds[1].first).toBe(out.universe[0].name)
    expect(out.universe).toHaveLength(60)
  })

  it('announces batches for a point sample too, not only a date range (#337)', async () => {
    // A "Current" window is one hour, so `assemble` returns a single stamp and
    // the collapsed columns. Nothing about the partial path keys on the window
    // shape, and this pins that: the only thing that suppresses an announcement
    // is an air-quality ranking, in the test below.
    const many = Array.from({ length: 60 }, (_, i) => ({
      name: `P${i}`,
      latitude: i + 1,
      longitude: i + 1,
    }))
    stubOpenMeteo(Array.from({ length: 60 }, (_, i) => (60 - i) / 100))
    const at = Date.parse('2026-07-21T00:00:00Z')
    const rounds: Array<{ count: number; times: number }> = []
    const out = await runClientAnalysis(REQUEST, customRows(many), at, at + 60_000, {
      nowMs: at,
      onPartial: (rows, times) => rounds.push({ count: rows.length, times: times.length }),
    })
    expect(rounds.map((r) => r.count)).toEqual([50, 60])
    // One stamp, and it is carried on every announcement rather than arriving
    // only with the finished report.
    expect(rounds.map((r) => r.times)).toEqual([1, 1])
    expect(out.response.times).toHaveLength(1)
  })

  it('announces nothing while ranking by air quality (#337)', async () => {
    // Air quality resolves after the weather fetch, so a partial field ranked
    // by it would be ranked on nulls.
    const many = Array.from({ length: 60 }, (_, i) => ({
      name: `P${i}`,
      latitude: i + 1,
      longitude: i + 1,
    }))
    stubOpenMeteo(Array.from({ length: 60 }, () => 0.1))
    const startMs = Date.parse('2026-07-21T00:00:00Z')
    const endMs = Date.parse('2026-07-21T02:00:00Z')
    const rounds: number[] = []
    await runClientAnalysis(
      { ...REQUEST, sort_by: 'aqi_avg' },
      customRows(many),
      startMs,
      endMs,
      { nowMs: startMs, onPartial: (rows) => rounds.push(rows.length) },
    )
    expect(rounds).toEqual([])
  })

  it('fetches air quality for every candidate, not just the rows it returns', async () => {
    const aqiCounts: number[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const count = new URL(url).searchParams.get('latitude')!.split(',').length
        const isWeather = new URL(url).hostname === 'api.open-meteo.com'
        if (!isWeather) aqiCounts.push(count)
        return {
          ok: true,
          status: 200,
          json: async () =>
            isWeather
              ? weatherBody(THREE_PRECIPS.slice(0, count))
              : Array.from({ length: count }, () => ({ hourly: { time: [], us_aqi: [] } })),
        }
      }),
    )
    const startMs = Date.parse('2026-07-21T00:00:00Z')
    const endMs = Date.parse('2026-07-21T02:00:00Z')
    // limit=2 of 3 candidates: the lazy version asked for 2 here, which left
    // the third row unable to show air quality if a live knob surfaced it.
    await runClientAnalysis(REQUEST, customRows(THREE), startMs, endMs, { nowMs: startMs })
    expect(aqiCounts).toEqual([3])
  })

  it('issues the air-quality request alongside weather, not after the ranking', async () => {
    // The concurrency is what makes the whole field affordable: weather and air
    // quality bill against separate per-service quotas, so overlapping them
    // costs no extra wall clock. Gate the weather response and assert the AQI
    // request has already gone out while weather is still in flight.
    let releaseWeather = () => {}
    const weatherGate = new Promise<void>((resolve) => {
      releaseWeather = resolve
    })
    const hosts: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const host = new URL(url).hostname
        hosts.push(host)
        const count = new URL(url).searchParams.get('latitude')!.split(',').length
        if (host === 'api.open-meteo.com') {
          await weatherGate
          return {
            ok: true,
            status: 200,
            json: async () => weatherBody(THREE_PRECIPS.slice(0, count)),
          }
        }
        return {
          ok: true,
          status: 200,
          json: async () => Array.from({ length: count }, () => ({ hourly: { time: [], us_aqi: [] } })),
        }
      }),
    )
    const startMs = Date.parse('2026-07-21T00:00:00Z')
    const endMs = Date.parse('2026-07-21T02:00:00Z')
    const pending = runClientAnalysis(REQUEST, customRows(THREE), startMs, endMs, {
      nowMs: startMs,
    })
    await vi.waitFor(() => expect(hosts).toContain('air-quality-api.open-meteo.com'))
    releaseWeather()
    await expect(pending).resolves.toBeDefined()
  })

  it('still ranks when air quality fails outright, with null AQI', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const isWeather = new URL(url).hostname === 'api.open-meteo.com'
        if (!isWeather) throw new TypeError('Failed to fetch')
        const count = new URL(url).searchParams.get('latitude')!.split(',').length
        return {
          ok: true,
          status: 200,
          json: async () => weatherBody(THREE_PRECIPS.slice(0, count)),
        }
      }),
    )
    const startMs = Date.parse('2026-07-21T00:00:00Z')
    const endMs = Date.parse('2026-07-21T02:00:00Z')
    const out = await runClientAnalysis(REQUEST, customRows(THREE), startMs, endMs, {
      nowMs: startMs,
    })
    // Air quality is supplementary: a ranking on another metric must survive
    // losing it, or an AQI outage takes the whole analysis down with it.
    expect(out.response.results.map((r) => r.name)).toEqual(['Dry', 'Mid'])
    expect(out.universe.every((r) => r.aqi_avg === null)).toBe(true)
  })

  it('refuses over-cap lists with the server wording, before any fetch', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const dests = Array.from({ length: MAX_ANALYZE_DESTINATIONS + 1 }, (_, i) =>
      customRows([{ name: `P${i}`, latitude: i, longitude: i }])[0],
    )
    await expect(
      runClientAnalysis(REQUEST, dests, 0, 1),
    ).rejects.toThrow(/analysis limit/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })


  it('reuses a held forecast instead of buying it again', async () => {
    // Widening the elevation band is what this exists for: the field grows by
    // a few destinations, and before this every forecast already on screen was
    // re-bought to add them.
    stubOpenMeteo(THREE_PRECIPS)
    const startMs = Date.parse('2026-07-21T00:00:00Z')
    const endMs = Date.parse('2026-07-21T02:00:00Z')
    const first = await runClientAnalysis(REQUEST, customRows(THREE), startMs, endMs, {
      nowMs: startMs,
    })

    // A fourth destination joins the same three. Only it is fetched, and the
    // caches are cleared first so a hit here can only come from `reuse`.
    resetOpenMeteoState()
    const asked: number[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const count = new URL(url).searchParams.get('latitude')!.split(',').length
        const isWeather = new URL(url).hostname === 'api.open-meteo.com'
        if (isWeather) asked.push(count)
        return {
          ok: true,
          status: 200,
          json: async () =>
            isWeather
              ? weatherBody([0.05])
              : Array.from({ length: count }, () => ({ hourly: { time: [], us_aqi: [] } })),
        }
      }),
    )
    const widened = [...THREE, { name: 'New', latitude: 4, longitude: 4 }]
    const out = await runClientAnalysis(
      { ...REQUEST, limit: 10 },
      customRows(widened),
      startMs,
      endMs,
      { nowMs: startMs, reuse: { rows: first.universe, times: first.response.times ?? [] } },
    )
    expect(asked).toEqual([1])
    expect(out.response.total_queried).toBe(4)
    // 'New' at 0.05 doubled is 0.1, so it ranks ahead of Dry's 0.2.
    expect(out.universe.map((r) => r.name)).toEqual(['New', 'Dry', 'Mid', 'Wet'])
    expect(out.universe[1].precip_total_in).toBeCloseTo(0.2, 5)
  })

  it('takes identity from the fresh candidate and the forecast from the held row', async () => {
    // Discovery may have learned an elevation since (a pasted coordinate
    // resolved against OSM). The forecast is the expensive half, not the name.
    stubOpenMeteo(THREE_PRECIPS)
    const startMs = Date.parse('2026-07-21T00:00:00Z')
    const endMs = Date.parse('2026-07-21T02:00:00Z')
    const first = await runClientAnalysis(REQUEST, customRows(THREE), startMs, endMs, {
      nowMs: startMs,
    })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const relabeled = customRows(THREE).map((d) => ({ ...d, elevation_ft: 5165 }))
    const out = await runClientAnalysis({ ...REQUEST, limit: 10 }, relabeled, startMs, endMs, {
      nowMs: startMs,
      reuse: { rows: first.universe, times: first.response.times ?? [] },
    })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(out.universe.every((r) => r.elevation_ft === 5165)).toBe(true)
    expect(out.universe.map((r) => r.name)).toEqual(['Dry', 'Mid', 'Wet'])
    // Nothing was fetched, so the hourly grid can only come from the held one —
    // and it is the same grid, because reuse is legal only within one window.
    expect(out.response.times).toEqual(first.response.times)
  })

  // #580: a failed air-quality fetch is not cached, but reuse skipped the
  // fetch for held rows altogether, so the outage stuck for 15 minutes.
  it('asks air quality again for held rows whose fetch failed, and only for those', async () => {
    const startMs = Date.parse('2026-07-21T00:00:00Z')
    const endMs = Date.parse('2026-07-21T02:00:00Z')
    const hours = [startMs / 1000, startMs / 1000 + 3600]
    let aqiUp = false
    const asked: { weather: number[]; aqi: number[] } = { weather: [], aqi: [] }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const isWeather = new URL(url).hostname === 'api.open-meteo.com'
        const count = new URL(url).searchParams.get('latitude')!.split(',').length
        asked[isWeather ? 'weather' : 'aqi'].push(count)
        if (isWeather) return fakeResponse(weatherBody(THREE_PRECIPS.slice(0, count)))
        if (!aqiUp) return fakeResponse({}, 500)
        return fakeResponse(Array.from({ length: count }, () => ({ hourly: { time: hours, us_aqi: [40, 60] } })))
      }),
    )
    const first = await runClientAnalysis({ ...REQUEST, limit: 10 }, customRows(THREE), startMs, endMs, {
      nowMs: startMs,
    })
    expect(first.universe.every((r) => r.aqi_avg === null)).toBe(true)
    expect(first.aqiFailed).toEqual(new Set(THREE.map((d) => geoKey(d.latitude, d.longitude))))

    aqiUp = true
    asked.weather = []
    asked.aqi = []
    const out = await runClientAnalysis({ ...REQUEST, limit: 10 }, customRows(THREE), startMs, endMs, {
      nowMs: startMs,
      reuse: { rows: first.universe, times: first.response.times ?? [], aqiFailed: first.aqiFailed },
    })
    expect(asked).toEqual({ weather: [], aqi: [3] })
    expect(out.universe.map((r) => r.aqi_avg)).toEqual([50, 50, 50])
    expect(out.universe[0].series?.aqi).toEqual([40, 60])
    expect(out.aqiFailed.size).toBe(0)
  })

  it('never re-buys a held null that air quality answered', async () => {
    stubOpenMeteo(THREE_PRECIPS)
    const startMs = Date.parse('2026-07-21T00:00:00Z')
    const endMs = Date.parse('2026-07-21T02:00:00Z')
    const first = await runClientAnalysis(REQUEST, customRows(THREE), startMs, endMs, { nowMs: startMs })
    expect(first.aqiFailed.size).toBe(0)
    resetOpenMeteoState()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await runClientAnalysis(REQUEST, customRows(THREE), startMs, endMs, {
      nowMs: startMs,
      reuse: { rows: first.universe, times: first.response.times ?? [], aqiFailed: first.aqiFailed },
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns the empty result shape for zero candidates', async () => {
    const out = await runClientAnalysis(REQUEST, [], 0, 1)
    expect(out).toEqual({
      response: { results: [], total_queried: 0, total_matched: 0 },
      universe: [],
      columns: new Map(),
      late: null,
      aqiFailed: new Set(),
    })
  })

  it('reads a peak with no elevation at terrain height and a lake at the surface (#545)', async () => {
    // Every location answers from terrain 2438.4 m (8,000 ft), between the 850
    // and 700 hPa levels. A peak or pasted point with no elevation of its own
    // reads the wind interpolated there: 10 + 20 x (981.4 / 1555) = 22.6 mph.
    // A lake or trailhead with none keeps the 10 m wind, 6.0, because it sits
    // on the terrain the surface values describe, and its cloud deck walks the
    // levels without a 2 m point, so it still has one (#670). A row
    // that carries an elevation keeps it: 1,000 ft is under the lowest level,
    // so its wind stays at 6.0 whatever the terrain says.
    stubTerrain()
    const startMs = Date.parse('2026-07-21T00:00:00Z')
    const endMs = Date.parse('2026-07-21T02:00:00Z')
    const out = await runClientAnalysis(
      { ...REQUEST, limit: 10 },
      [
        ...customRows([
          { name: 'Pasted', latitude: 1, longitude: 1 },
          { name: 'Low', latitude: 2, longitude: 2, elevation_ft: 1000 },
        ]),
        { ...discovered('Nameless', 3, 3), elevation_ft: null },
        { ...discovered('Tarn', 4, 4), type: 'lake' },
        { ...discovered('Lot', 5, 5), type: 'trailhead' },
      ],
      startMs,
      endMs,
      { nowMs: startMs, cloud: true },
    )
    const byName = new Map(out.universe.map((r) => [r.name, r]))
    expect(byName.get('Pasted')?.wind_avg_mph).toBe(22.6)
    expect(byName.get('Nameless')?.wind_avg_mph).toBe(22.6)
    expect(byName.get('Pasted')?.cloud_deck_min_ft).not.toBeNull()
    expect(byName.get('Tarn')?.wind_avg_mph).toBe(6)
    expect(byName.get('Lot')?.wind_avg_mph).toBe(6)
    expect(byName.get('Tarn')?.cloud_deck_min_ft).toBe(DECK_AT_RH_925[50])
    expect(byName.get('Lot')?.cloud_deck_min_ft).toBe(DECK_AT_RH_925[50])
    expect(byName.get('Low')?.wind_avg_mph).toBe(6)
    // The terrain height is the forecast's, not the destination's: the
    // Elevation column still says only what OSM or the list said.
    expect(byName.get('Pasted')?.elevation_ft).toBeNull()
    expect(byName.get('Low')?.elevation_ft).toBe(1000)
  })

  it('hands its countdown to the air-quality pacer as well as the weather one (#545)', async () => {
    vi.useFakeTimers()
    try {
      // The pacer reads the clock, and the clock just changed.
      resetOpenMeteoState()
      stubOpenMeteo(THREE_PRECIPS)
      const startMs = Date.parse('2026-07-21T00:00:00Z')
      const endMs = Date.parse('2026-07-21T02:00:00Z')
      // Overspend the air-quality budget and leave the weather one empty, the
      // way a large analysis a moment ago would have: 50 locations over 201
      // days is 717.9 weighted calls, more than a minute's 550, so it holds the
      // window for 717.9 / 550 x 60 s = 78.3 s. The analysis's own three wait
      // that long, and only on air quality.
      const fifty = Array.from({ length: 50 }, (_, i) => ({ latitude: 10 + i / 100, longitude: 10 }))
      const drain = fetchAqi(fifty, startMs - 200 * 86_400_000, startMs, { nowMs: startMs })
      const onPace = vi.fn()
      const pending = runClientAnalysis(REQUEST, customRows(THREE), startMs, endMs, {
        nowMs: startMs,
        onPace,
      })

      await vi.advanceTimersByTimeAsync(0)
      expect(onPace).toHaveBeenCalledExactlyOnceWith(79)
      await vi.advanceTimersByTimeAsync(80_000)
      await drain
      await expect(pending).resolves.toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })
})

// ── The cloud column, fetched only on request (#117, #670) ─────────────────

// One cloud body per location: saturated at 850 hPa (1457 m) every hour, and
// a 925 hPa humidity (762 m) that differs per location, so each reads a deck
// between the two levels at a height of its own and a ranking has something
// to order. Every destination here stands below 925 hPa, so the deck is the
// same whether or not its 2 m point is in the column.
function cloudBody(rh925s: number[]) {
  return rh925s.map((rh) => ({
    hourly: {
      time: ['2026-07-21T00:00', '2026-07-21T01:00'],
      relative_humidity_2m: [70, 70],
      relative_humidity_1000hPa: [72, 72],
      relative_humidity_925hPa: [rh, rh],
      relative_humidity_850hPa: [100, 100],
      relative_humidity_700hPa: [60, 60],
      relative_humidity_600hPa: [50, 50],
      relative_humidity_500hPa: [40, 40],
      relative_humidity_400hPa: [30, 30],
      relative_humidity_300hPa: [20, 20],
    },
  }))
}

// The cloud request goes to the weather host too, so it is told apart by what
// it asks for rather than where it goes.
function isCloudRequest(url: string) {
  return (new URL(url).searchParams.get('hourly') ?? '').includes('relative_humidity_2m')
}

// The deck each 925 hPa humidity puts between 762 m and 1457 m, in whole feet:
// 762 + 695 x (95 - rh) / (100 - rh) metres.
const DECK_AT_RH_925: Record<number, number> = { 50: 4552, 60: 4495, 80: 4210, 90: 3640 }

function stubWithCloud(precips: number[], rh925s: number[], cloudCounts: number[] = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const host = new URL(url).hostname
      const count = new URL(url).searchParams.get('latitude')!.split(',').length
      let body: unknown
      if (host !== 'api.open-meteo.com') {
        body = Array.from({ length: count }, () => ({ hourly: { time: [], us_aqi: [] } }))
      } else if (isCloudRequest(url)) {
        cloudCounts.push(count)
        body = cloudBody(rh925s.slice(0, count))
      } else {
        body = weatherBody(precips.slice(0, count))
      }
      return { ok: true, status: 200, json: async () => body }
    }),
  )
}

// Every location answers from terrain 2438.4 m (8,000 ft), between the 850 and
// 700 hPa levels, so a place read at the terrain height has wind of
// 10 + 20 x (981.4 / 1555) = 22.6 mph where the 10 m wind is 6.0 (#545).
function stubTerrain() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const host = new URL(url).hostname
      const count = new URL(url).searchParams.get('latitude')!.split(',').length
      let body: unknown
      if (host !== 'api.open-meteo.com') {
        body = Array.from({ length: count }, () => ({ hourly: { time: [], us_aqi: [] } }))
      } else if (isCloudRequest(url)) {
        body = cloudBody(new Array(count).fill(50)).map((item) => ({ ...item, elevation: 2438.4 }))
      } else {
        body = weatherBody(new Array(count).fill(0)).map((item) => ({
          ...item,
          elevation: 2438.4,
          hourly: {
            ...item.hourly,
            wind_speed_925hPa: [7, 7],
            wind_speed_850hPa: [10, 10],
            wind_speed_700hPa: [30, 30],
            wind_speed_600hPa: [40, 40],
            wind_speed_500hPa: [50, 50],
          },
        }))
      }
      return { ok: true, status: 200, json: async () => body }
    }),
  )
}

describe('the kind of a place the server calls custom (#545)', () => {
  const startMs = Date.parse('2026-07-21T00:00:00Z')
  const endMs = Date.parse('2026-07-21T02:00:00Z')
  // What POST /api/destinations answers for two places clicked on the map: a
  // lake and a peak, neither with an elevation, both typed "custom" because
  // `custom_destinations` carries no kind.
  const echoed = customRows([
    { name: 'Tarn', latitude: 1, longitude: 1 },
    { name: 'Summit', latitude: 2, longitude: 2 },
    { name: 'Pasted', latitude: 3, longitude: 3 },
  ])
  const clicked = [
    place({ label: 'Tarn', kind: 'lake', lat: 1, lon: 1 }),
    place({ label: 'Summit', kind: 'volcano', lat: 2, lon: 2 }),
  ]

  it('learns each place\'s kind from the places, over the held field', () => {
    const held = [
      resultRow({ type: 'trailhead', latitude: 5, longitude: 5 }),
      resultRow({ type: 'custom', latitude: 3, longitude: 3 }),
      resultRow({ type: 'peak', latitude: 1, longitude: 1 }),
    ]
    expect(knownTypes(held, clicked)).toEqual({
      [geoKey(5, 5)]: 'trailhead',
      [geoKey(1, 1)]: 'lake',
      [geoKey(2, 2)]: 'peak',
    })
  })

  it('types only the rows the server called custom', () => {
    const known = { [geoKey(1, 1)]: 'lake', [geoKey(9, 9)]: 'lake' }
    const typed = withKnownTypes([...echoed, discovered('Found', 9, 9)], known)
    expect(typed.map((d) => d.type)).toEqual(['lake', 'custom', 'custom', 'peak'])
  })

  it('reads a clicked lake at the 10 m wind and a clicked peak at terrain height', async () => {
    stubTerrain()
    const out = await runClientAnalysis(
      { ...REQUEST, limit: 10 },
      withKnownTypes(echoed, knownTypes(null, clicked)),
      startMs,
      endMs,
      { nowMs: startMs, cloud: true },
    )
    const byName = new Map(out.universe.map((r) => [r.name, r]))
    expect(byName.get('Tarn')?.type).toBe('lake')
    expect(byName.get('Tarn')?.wind_avg_mph).toBe(6)
    expect(byName.get('Tarn')?.cloud_deck_min_ft).toBe(DECK_AT_RH_925[50])
    expect(byName.get('Summit')?.type).toBe('peak')
    expect(byName.get('Summit')?.wind_avg_mph).toBe(22.6)
    // A pasted coordinate has no kind to learn, so it keeps the peak's side.
    expect(byName.get('Pasted')?.type).toBe('custom')
    expect(byName.get('Pasted')?.wind_avg_mph).toBe(22.6)
  })
})

describe('alignCloud', () => {
  it('lays each hour on its own stamp and leaves a missing one null', () => {
    const out = alignCloud([1, 2, 3], { times: [1, 3], cloud_deck_ft: [4000, 5000] })
    expect(out).toEqual([4000, null, 5000])
  })

  it('carries no array at all for a row never asked for clouds', () => {
    expect(alignCloud([1, 2], null)).toBeNull()
  })
})

describe('withCloud', () => {
  const cloud = {
    cloud_deck_min_ft: 4000,
    cloud_deck_avg_ft: 4500,
    cloud_deck_max_ft: 5000,
    series: { times: [1, 2], cloud_deck_ft: [4000, 5000] },
  }

  it('lays a cloud answer over a held row', () => {
    const row = resultRow({ series: series({ precip_in: [0, 0], temp_f: [1, 1], wind_mph: [2, 2], freeze_ft: [null, null], snowfall_in: [0, 0], aqi: [null, null] }) })
    const out = withCloud(row, cloud, [1, 2])
    expect(out.cloud_deck_min_ft).toBe(4000)
    expect(out.cloud_deck_avg_ft).toBe(4500)
    expect(out.series?.cloud_deck_ft).toEqual([4000, 5000])
  })

  // A report carries the column for every row or for none, so a row held from
  // a cloud analysis loses it when the next analysis did not ask.
  it('strips a cloud answer the new report did not ask for', () => {
    const held = withCloud(
      resultRow({ series: series({ precip_in: [0, 0], temp_f: [1, 1], wind_mph: [2, 2], freeze_ft: [null, null], snowfall_in: [0, 0], aqi: [null, null] }) }),
      cloud,
      [1, 2],
    )
    const out = withCloud(held, null, [1, 2])
    expect(out.cloud_deck_min_ft).toBeNull()
    expect(out.cloud_deck_max_ft).toBeNull()
    expect(out.series).not.toHaveProperty('cloud_deck_ft')
    expect(out.series?.precip_in).toEqual([0, 0])
  })
})

describe('runClientAnalysis and the cloud column', () => {
  const startMs = Date.parse('2026-07-21T00:00:00Z')
  const endMs = Date.parse('2026-07-21T02:00:00Z')

  it('asks for no cloud column unless told to', async () => {
    const cloudCounts: number[] = []
    stubWithCloud(THREE_PRECIPS, [90, 60, 80], cloudCounts)
    const out = await runClientAnalysis(REQUEST, customRows(THREE), startMs, endMs, { nowMs: startMs })
    expect(cloudCounts).toEqual([])
    expect(out.universe.every((r) => r.cloud_deck_min_ft === null && r.cloud_deck_avg_ft === null)).toBe(true)
    expect(out.universe.every((r) => r.series && !('cloud_deck_ft' in r.series))).toBe(true)
  })

  it('fetches it for every candidate and ranks on it when told to', async () => {
    const cloudCounts: number[] = []
    stubWithCloud(THREE_PRECIPS, [90, 60, 80], cloudCounts)
    // 328 ft is 100 m, under the 1000 hPa level: the 2 m point is the bottom
    // of the column and dry.
    const dests = customRows(THREE).map((d) => ({ ...d, elevation_ft: 328 }))
    const out = await runClientAnalysis(
      { ...REQUEST, sort_by: 'cloud_deck_avg_ft' },
      dests,
      startMs,
      endMs,
      { nowMs: startMs, cloud: true },
    )
    expect(cloudCounts).toEqual([3])
    // Wet 90%, Dry 60%, Mid 80% at 925 hPa: the wetter the layer under the
    // saturated one, the lower the deck, so ascending is Wet, Mid, Dry.
    expect(out.universe.map((r) => r.name)).toEqual(['Wet', 'Mid', 'Dry'])
    expect(out.universe[0].cloud_deck_avg_ft).toBe(DECK_AT_RH_925[90])
    // 80% at 762 m and 100% at 1457 m put 95% three quarters of the way up:
    // 1283.25 m, which is 4210 ft.
    expect(out.universe[1].cloud_deck_min_ft).toBe(4210)
    expect(out.universe[0].series?.cloud_deck_ft).toEqual([3640, 3640])
  })

  it('announces no partial field under a cloud ranking', async () => {
    stubWithCloud(THREE_PRECIPS, [90, 60, 80])
    const rounds: number[] = []
    await runClientAnalysis(
      { ...REQUEST, sort_by: 'cloud_deck_min_ft' },
      customRows(THREE),
      startMs,
      endMs,
      { nowMs: startMs, cloud: true, onPartial: (rows) => rounds.push(rows.length) },
    )
    expect(rounds).toEqual([])
  })

  it('covers held rows too, so the column is whole', async () => {
    stubWithCloud(THREE_PRECIPS, [90, 60, 80])
    const first = await runClientAnalysis({ ...REQUEST, limit: 10 }, customRows(THREE), startMs, endMs, {
      nowMs: startMs,
    })
    resetOpenMeteoState()
    const cloudCounts: number[] = []
    stubWithCloud(THREE_PRECIPS, [90, 60, 80], cloudCounts)
    const out = await runClientAnalysis(
      { ...REQUEST, limit: 10, sort_by: 'cloud_deck_avg_ft' },
      customRows(THREE),
      startMs,
      endMs,
      { nowMs: startMs, cloud: true, reuse: { rows: first.universe, times: first.response.times ?? [] } },
    )
    expect(cloudCounts).toEqual([3])
    expect(out.universe.map((r) => r.cloud_deck_avg_ft)).toEqual([3640, 4210, 4495])
  })

  // The cloud failure aborts the weather fetch, and the weather fetch then
  // rejects with an AbortError, which reads as the reader's own cancel.
  it('fails with the cloud error rather than the abort it causes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const count = new URL(url).searchParams.get('latitude')!.split(',').length
        if (isCloudRequest(url)) return { ok: false, status: 500, json: async () => ({ reason: 'x' }), text: async () => '' }
        const host = new URL(url).hostname
        return {
          ok: true,
          status: 200,
          json: async () =>
            host === 'api.open-meteo.com'
              ? weatherBody(THREE_PRECIPS.slice(0, count))
              : Array.from({ length: count }, () => ({ hourly: { time: [], us_aqi: [] } })),
        }
      }),
    )
    const err = await runClientAnalysis(
      { ...REQUEST, sort_by: 'cloud_deck_min_ft' },
      customRows(THREE),
      startMs,
      endMs,
      { nowMs: startMs, cloud: true },
    ).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).name).not.toBe('AbortError')
  })
})

// ── refreshEchoRows: what a window change re-analyzes ──────────────────────

describe('refreshEchoRows', () => {
  function at(name: string, lat: number, elevationFt: number | null = null): DestinationResult {
    return { ...row(name, null), latitude: lat, longitude: -121.9, elevation_ft: elevationFt }
  }

  const universe = [at('Dry', 1), at('Mid', 2), at('Wet', 3)]
  const displayed = universe.slice(0, 2)

  it('echoes the whole analyzed field, not the rows that survived the cut', () => {
    // The #177 bug: re-ranking `displayed` could never promote 'Wet' into the
    // new window's top rows, however wet the other two turned out to be.
    expect(refreshEchoRows(universe, displayed, new Set()).map((r) => r.name)).toEqual([
      'Dry',
      'Mid',
      'Wet',
    ])
  })

  it('falls back to the displayed rows when no universe is held', () => {
    // The server SSE path sends only its trimmed rows, so it keeps the old
    // approximation rather than pretending to a field it never received.
    expect(refreshEchoRows(null, displayed, new Set()).map((r) => r.name)).toEqual(['Dry', 'Mid'])
  })

  it('drops ×-removed destinations from the universe explicitly', () => {
    // Echoing the displayed rows used to do this as a side effect; the universe
    // never saw the removal, so the filter has to be applied here.
    const removed = new Set([geoKey(3, -121.9), geoKey(1, -121.9)])
    expect(refreshEchoRows(universe, displayed, removed).map((r) => r.name)).toEqual(['Mid'])
  })

  it('sends elevation as undefined, not null, so the request stays valid', () => {
    const [known, unknown] = refreshEchoRows([at('Known', 4, 9000), at('Unknown', 5)], [], new Set())
    expect(known.elevation_ft).toBe(9000)
    expect(unknown.elevation_ft).toBeUndefined()
  })
})

// ── The refresh decision: does Analyze spend a discovery call? ──────────────
//
// This is the spend boundary the panel's whole interaction model rests on. A
// false positive re-ranks a stale field against a question it no longer
// answers; a false negative buys an Overpass query nobody asked for. Both
// directions are pinned here.

describe('discoveryBase', () => {
  const ring: GeoPolygon = {
    type: 'Polygon',
    coordinates: [
      [
        [-121.9, 46.8],
        [-121.7, 46.8],
        [-121.7, 47.0],
        [-121.9, 46.8],
      ],
    ],
  }
  const csv = [{ name: 'Rainier', latitude: 46.85, longitude: -121.76 }]

  it('is the same discovery whichever order the kinds were checked in', () => {
    expect(discoveryBase(ring, [], ['peak', 'lake'], false)).toBe(
      discoveryBase(ring, [], ['lake', 'peak'], false),
    )
  })

  it('changes when a kind joins or leaves', () => {
    expect(discoveryBase(ring, [], ['peak'], false)).not.toBe(
      discoveryBase(ring, [], ['peak', 'lake'], false),
    )
  })

  it('changes when the unnamed-peaks toggle moves', () => {
    // It widens what discovery finds the same way checking another kind does.
    expect(discoveryBase(ring, [], ['peak'], false)).not.toBe(
      discoveryBase(ring, [], ['peak'], true),
    )
  })

  it('changes when the pasted rows change', () => {
    expect(discoveryBase(ring, csv, ['peak'], false)).not.toBe(
      discoveryBase(ring, [], ['peak'], false),
    )
    expect(discoveryBase(ring, csv, ['peak'], false)).not.toBe(
      discoveryBase(ring, [{ ...csv[0], latitude: 46.9 }], ['peak'], false),
    )
  })

  // It takes the PARSED rows, so editing a comment or the whitespace around a
  // coordinate leaves the discovery alone.
  it('is the rows, not the text they were typed as', () => {
    expect(discoveryBase(ring, csv, ['peak'], false)).toBe(
      discoveryBase(ring, [{ ...csv[0] }], ['peak'], false),
    )
  })

  it('changes when the ring moves', () => {
    const moved: GeoPolygon = {
      type: 'Polygon',
      coordinates: [ring.coordinates[0].map((p, i) => (i === 1 ? [-121.6, 46.8] : p))],
    }
    expect(discoveryBase(ring, [], ['peak'], false)).not.toBe(
      discoveryBase(moved, [], ['peak'], false),
    )
  })

  // Every recorded base carries a ring, because only a polygon run records one.
  // A run with no ring can therefore never match a record, which is what makes
  // the caller's polygon guard a backstop rather than the only guard.
  it('never matches a recorded base when there is no ring', () => {
    expect(discoveryBase(null, [], ['peak'], false)).not.toBe(
      discoveryBase(ring, [], ['peak'], false),
    )
  })
})

describe('isDiscoveryRefresh', () => {
  const base = 'base'
  const prev = { base, searchedKeys: ['a', 'b'] }

  it('refreshes when nothing the user authored has changed', () => {
    expect(isDiscoveryRefresh(prev, base, ['a', 'b'], true)).toBe(true)
  })

  it('re-discovers when a discovery input changed', () => {
    expect(isDiscoveryRefresh(prev, 'other', ['a', 'b'], true)).toBe(false)
  })

  // A removal shrinks the searched list, and the departed rows are already gone
  // from the report the refresh echoes.
  it('refreshes over a searched list that only shrank', () => {
    expect(isDiscoveryRefresh(prev, base, ['a'], true)).toBe(true)
    expect(isDiscoveryRefresh(prev, base, [], true)).toBe(true)
  })

  // A new place has to compete against the whole candidate field, which the
  // echo is not: refreshing would silently leave it out of the ranking.
  it('re-discovers when a searched place was added', () => {
    expect(isDiscoveryRefresh(prev, base, ['a', 'b', 'c'], true)).toBe(false)
    expect(isDiscoveryRefresh(prev, base, ['c'], true)).toBe(false)
  })

  it('re-discovers when there is no report to echo', () => {
    expect(isDiscoveryRefresh(prev, base, ['a', 'b'], false)).toBe(false)
  })

  // Null after a custom-only run, which forgets the polygon behind it on
  // purpose so those rows are never mistaken for a polygon's discovered set.
  it('re-discovers when nothing was recorded', () => {
    expect(isDiscoveryRefresh(null, base, [], true)).toBe(false)
  })
})

// The fetches that trail the weather, named while they keep the run waiting
// (#579). The weather has answered when this runs.
// ── A lookup still in flight (#643, #673) ──────────────────────────────────
//
// A run with no polygon asks the pod what OSM knows about its
// rows. That lookup runs beside the forecasts, the report lands when the
// forecasts do, and the lookup's answer lands on the report afterwards: each
// row it placed is reduced again from its kept column at that height.

describe('runClientAnalysis with a lookup still in flight (#673)', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
  const tick = () => new Promise<void>((r) => setTimeout(r, 0))
  const startMs = Date.parse('2026-07-21T00:00:00Z')
  const endMs = Date.parse('2026-07-21T02:00:00Z')
  const SENT = customRows(THREE)
  // What the pod answers: the same rows, with an elevation, an id and a depth.
  // The elevations sit near 8,000 ft, where the level winds below read 22.6
  // mph against the 10 m mean of 6.0 (#257), so a re-reduce is visible.
  const ANSWERED: DiscoveredDestination[] = SENT.map((d, i) => ({
    ...d,
    elevation_ft: 8000 + i,
    osm_id: `node/${i}`,
  }))
  const openMeteoCalls = () => vi.mocked(fetch).mock.calls.length
  const keyOf = (d: { latitude: number; longitude: number }) => geoKey(d.latitude, d.longitude)

  function stubWindy(precips: number[]) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const isWeather = new URL(url).hostname === 'api.open-meteo.com'
        const count = new URL(url).searchParams.get('latitude')!.split(',').length
        const bodies = weatherBody(precips.slice(0, count)).map((b) => ({
          ...b,
          hourly: {
            ...b.hourly,
            wind_speed_925hPa: [7.0, 7.0],
            wind_speed_850hPa: [10.0, 10.0],
            wind_speed_700hPa: [30.0, 30.0],
            wind_speed_600hPa: [40.0, 40.0],
            wind_speed_500hPa: [50.0, 50.0],
          },
        }))
        return {
          ok: true,
          status: 200,
          json: async () => (isWeather ? bodies : Array.from({ length: count }, () => ({ hourly: { time: [], us_aqi: [] } }))),
        }
      }),
    )
  }

  it('lands the report before the lookup answers, every row as it was sent, and keeps their columns', async () => {
    stubWindy(THREE_PRECIPS)
    const lookup = deferred<DiscoveredDestination[]>()
    const labels: string[] = []
    const out = await runClientAnalysis(REQUEST, SENT, startMs, endMs, {
      nowMs: startMs,
      resolving: lookup.promise,
      onTail: (m) => labels.push(m),
    })
    expect(openMeteoCalls()).toBe(2)
    expect(labels).toEqual([])
    expect(out.universe.map((r) => [r.name, r.elevation_ft, r.osm_id, r.wind_avg_mph])).toEqual([
      ['Dry', null, null, 6.0],
      ['Mid', null, null, 6.0],
      ['Wet', null, null, 6.0],
    ])
    expect([...out.columns.keys()].sort()).toEqual(SENT.map(keyOf).sort())
    expect(out.late).not.toBeNull()
    lookup.resolve(ANSWERED)
    await out.late
  })

  it('patches each row with what the lookup found, reduced again at its height', async () => {
    stubWindy(THREE_PRECIPS)
    const lookup = deferred<DiscoveredDestination[]>()
    const out = await runClientAnalysis(REQUEST, SENT, startMs, endMs, { nowMs: startMs, resolving: lookup.promise })
    lookup.resolve(ANSWERED)
    const patch = await out.late!
    expect(patch.rows.map((r) => [r.name, r.elevation_ft, r.osm_id])).toEqual([
      ['Wet', 8000, 'node/0'],
      ['Dry', 8001, 'node/1'],
      ['Mid', 8002, 'node/2'],
    ])
    for (const r of patch.rows) {
      expect(r.wind_avg_mph).toBeCloseTo(22.6, 1)
      expect(r.series?.wind_mph.every((w) => w !== null && w > 20)).toBe(true)
      // The precipitation and the hours are the column's, untouched.
      expect(r.series?.precip_in).toEqual(out.universe.find((u) => u.name === r.name)!.series?.precip_in)
    }
    // Every row has its elevation now, so no column is worth holding.
    expect(patch.columns.size).toBe(0)
  })

  it('produces the rows a run that waited would have', async () => {
    stubWindy(THREE_PRECIPS)
    const lookup = deferred<DiscoveredDestination[]>()
    const early = await runClientAnalysis(REQUEST, SENT, startMs, endMs, { nowMs: startMs, resolving: lookup.promise })
    lookup.resolve(ANSWERED)
    const patch = await early.late!
    resetOpenMeteoState()
    stubWindy(THREE_PRECIPS)
    const waited = await runClientAnalysis(REQUEST, ANSWERED, startMs, endMs, { nowMs: startMs })
    for (const r of patch.rows) {
      expect(r).toEqual(waited.universe.find((u) => u.name === r.name))
    }
  })

  it('shows the partial field before the lookup answers', async () => {
    stubWindy(THREE_PRECIPS)
    const lookup = deferred<DiscoveredDestination[]>()
    const rounds: (number | null)[][] = []
    const out = await runClientAnalysis(REQUEST, SENT, startMs, endMs, {
      nowMs: startMs,
      resolving: lookup.promise,
      onPartial: (rows) => rounds.push(rows.map((r) => r.elevation_ft)),
    })
    expect(rounds).toEqual([[null, null, null]])
    lookup.resolve(ANSWERED)
    await out.late
  })

  it('does not wait for the lookup under a height ranking either: the patch reorders the field', async () => {
    stubWindy(THREE_PRECIPS)
    const lookup = deferred<DiscoveredDestination[]>()
    const labels: string[] = []
    const out = await runClientAnalysis({ ...REQUEST, sort_by: 'wind_avg_mph', max_wind_mph: 30 }, SENT, startMs, endMs, {
      nowMs: startMs,
      resolving: lookup.promise,
      onTail: (m) => labels.push(m),
    })
    expect(labels).toEqual([])
    expect(out.universe.map((r) => r.wind_avg_mph)).toEqual([6.0, 6.0, 6.0])
    // The patched rows carry the numbers the ranking and the bound read, so
    // present.ts re-ranks the field once they replace the provisional ones.
    lookup.resolve(ANSWERED)
    const patch = await out.late!
    expect(patch.rows).toHaveLength(3)
    for (const r of patch.rows) expect(r.wind_avg_mph).toBeCloseTo(22.6, 1)
  })

  it('keeps the row it sent when the answer is about somewhere else, and holds its column', async () => {
    stubWindy(THREE_PRECIPS)
    const moved = ANSWERED.map((d, i) => (i === 0 ? { ...d, latitude: 9 } : d))
    const out = await runClientAnalysis(REQUEST, SENT, startMs, endMs, {
      nowMs: startMs,
      resolving: Promise.resolve(moved),
    })
    const patch = await out.late!
    expect(patch.rows.map((r) => r.name).sort()).toEqual(['Dry', 'Mid'])
    expect([...patch.columns.keys()]).toEqual([keyOf(SENT[0])])
    // A list of another length describes some other field altogether.
    resetOpenMeteoState()
    stubWindy(THREE_PRECIPS)
    const short = await runClientAnalysis(REQUEST, SENT, startMs, endMs, {
      nowMs: startMs,
      resolving: Promise.resolve(ANSWERED.slice(1)),
    })
    const none = await short.late!
    expect(none.rows).toEqual([])
    expect(none.columns.size).toBe(3)
  })

  it('reduces a held row again from the column the last run kept, with nothing to fetch', async () => {
    stubWindy(THREE_PRECIPS)
    const first = await runClientAnalysis(REQUEST, SENT, startMs, endMs, {
      nowMs: startMs,
      resolving: new Promise(() => {}),
    })
    const asked = openMeteoCalls()
    const out = await runClientAnalysis(REQUEST, SENT, startMs, endMs, {
      nowMs: startMs,
      reuse: { rows: first.universe, times: first.response.times ?? [], columns: first.columns },
      resolving: Promise.resolve(ANSWERED),
    })
    expect(openMeteoCalls()).toBe(asked)
    const patch = await out.late!
    expect(patch.rows.map((r) => r.elevation_ft).sort()).toEqual([8000, 8001, 8002])
    for (const r of patch.rows) expect(r.wind_avg_mph).toBeCloseTo(22.6, 1)
  })

  it('refuses an over-cap list without waiting for the lookup', async () => {
    stubWindy(THREE_PRECIPS)
    await expect(
      runClientAnalysis(REQUEST, SENT, startMs, endMs, {
        nowMs: startMs,
        maxDestinations: 2,
        resolving: new Promise(() => {}),
      }),
    ).rejects.toThrow(/3/)
    expect(openMeteoCalls()).toBe(0)
  })

  it('waits for the elevations before it keeps the highest of an over-cap list', async () => {
    stubWindy(THREE_PRECIPS)
    const lookup = deferred<DiscoveredDestination[]>()
    const labels: string[] = []
    const pending = runClientAnalysis({ ...REQUEST, top_by_elevation: true }, SENT, startMs, endMs, {
      nowMs: startMs,
      maxDestinations: 2,
      resolving: lookup.promise,
      onTail: (m) => labels.push(m),
    })
    await tick()
    // Nothing can be asked until the field is chosen.
    expect(openMeteoCalls()).toBe(0)
    expect(labels).toEqual(['Retrieving elevation…'])
    lookup.resolve(ANSWERED)
    const out = await pending
    // Dry (8001) and Mid (8002) outrank Wet (8000).
    expect(out.universe.map((r) => r.name).sort()).toEqual(['Dry', 'Mid'])
    expect(out.response).toMatchObject({ truncated: true, total_found: 3 })
    expect(out.late).toBeNull()
  })

  it('rejects the patch, and nothing else, when the lookup is aborted after the report', async () => {
    stubWindy(THREE_PRECIPS)
    const lookup = deferred<DiscoveredDestination[]>()
    const out = await runClientAnalysis(REQUEST, SENT, startMs, endMs, { nowMs: startMs, resolving: lookup.promise })
    lookup.reject(new DOMException('Aborted', 'AbortError'))
    await expect(out.late).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('withWeather', () => {
  it('replaces the aggregates and the weather series, and keeps the rest of the row', () => {
    const row = resultRow({ name: 'A', aqi_max: 42, series: series({ precip_in: [0.1, 0.2], aqi: [1, 2] }) })
    const wx = weatherResult({ wind_avg_mph: 22.6, series: { ...series({ wind_mph: [20, 25] }), times: [] } })
    const next = withWeather(row, wx)
    expect(next.wind_avg_mph).toBe(22.6)
    expect(next.aqi_max).toBe(42)
    expect(next.series?.wind_mph).toEqual([20, 25])
    expect(next.series?.aqi).toEqual([1, 2])
    expect(withWeather(row, null)).toBe(row)
  })
})

describe('following the tail', () => {
  function deferred() {
    let resolve!: () => void
    const promise = new Promise<void>((r) => (resolve = r))
    return { promise, resolve }
  }
  const tick = () => new Promise<void>((r) => setTimeout(r, 0))
  // Past the macrotask followTail waits before its first label.
  const settle = async () => {
    await tick()
    await tick()
  }

  it('names air quality while it is still out', async () => {
    const aqi = deferred()
    const labels: string[] = []
    const done = followTail(aqi.promise, null, (m) => labels.push(m))
    await settle()
    expect(labels).toEqual(['Retrieving air quality…'])
    aqi.resolve()
    await done
    expect(labels).toEqual(['Retrieving air quality…'])
  })

  it('names the cloud data while it is still out', async () => {
    const cloud = deferred()
    const labels: string[] = []
    const done = followTail(Promise.resolve(), cloud.promise, (m) => labels.push(m))
    await settle()
    expect(labels).toEqual(['Retrieving cloud data…'])
    cloud.resolve()
    await done
  })

  it('names air quality, then the cloud data once air quality answers, and never goes back', async () => {
    const aqi = deferred()
    const cloud = deferred()
    const labels: string[] = []
    const done = followTail(aqi.promise, cloud.promise, (m) => labels.push(m))
    await settle()
    expect(labels).toEqual(['Retrieving air quality…'])
    aqi.resolve()
    await settle()
    expect(labels).toEqual(['Retrieving air quality…', 'Retrieving cloud data…'])
    cloud.resolve()
    await done
    expect(labels).toEqual(['Retrieving air quality…', 'Retrieving cloud data…'])
  })

  it('names the cloud data alone when air quality answers first', async () => {
    const cloud = deferred()
    const labels: string[] = []
    const done = followTail(Promise.resolve(), cloud.promise, (m) => labels.push(m))
    cloud.resolve()
    await done
    expect(labels).toEqual([])
  })

  it('names nothing when neither is out', async () => {
    const labels: string[] = []
    await followTail(Promise.resolve(), Promise.resolve(), (m) => labels.push(m))
    await followTail(null, null, (m) => labels.push(m))
    expect(labels).toEqual([])
  })

  it('names nothing when the tail answers in the same tick as the weather', async () => {
    const aqi = deferred()
    const labels: string[] = []
    const done = followTail(aqi.promise, null, (m) => labels.push(m))
    aqi.resolve()
    await done
    expect(labels).toEqual([])
  })
})

// The height a row was read at, when it was the terrain's (decision 0116):
// carried onto the row by the reduce that read there, and taken off by the
// reduce at the place's own elevation once a lookup has placed it.
describe('withWeather and the terrain height', () => {
  it('carries the terrain height the reduce read at, and drops it once the row is read at its own', () => {
    const atTerrain = withWeather(resultRow({ elevation_ft: null }), { ...weatherResult(), terrain_ft: 7119 })
    expect(atTerrain.terrain_ft).toBe(7119)
    const placed = withWeather({ ...atTerrain, elevation_ft: 7300 }, weatherResult())
    expect(placed).not.toHaveProperty('terrain_ft')
  })
})
