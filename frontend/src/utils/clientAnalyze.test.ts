import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnalyzeRequest, DestinationResult, DiscoveredDestination } from '../types'
import {
  Constraints,
  MAX_ANALYZE_DESTINATIONS,
  NO_CONSTRAINTS,
  alignAqi,
  analysisNoun,
  assemble,
  canonicalTimes,
  capDetail,
  constraintFields,
  constraintsFromRequest,
  customRows,
  filterConstraints,
  filterElevation,
  hasConstraints,
  rankComparator,
  refreshEchoRows,
  resolveCustomOnly,
  runClientAnalysis,
  truncateTopElevation,
} from './clientAnalyze'
import { pinKey } from './customList'
import { WeatherResult, resetOpenMeteoState } from './openMeteo'
import vectors from './weather_vectors.json'

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
    expect(out.map((d) => d.elevation_ft)).toEqual([5165])
    expect(out[0].osm_id).toBe('node/1')
  })

  it('asks for a resolve, never a discovery', async () => {
    const spy = stubFetch(() => ({
      ok: true,
      json: async () => ({ destinations: [resolved('McClellan Butte', 5165)], total: 1 }),
    }))
    await resolveCustomOnly(ROWS)
    const body = sentBody(spy)
    expect(body.destination_types).toEqual([])
    expect(body.custom_destinations).toHaveLength(1)
    // The band and the cap stay client-side on this path, so sending them
    // would hand the server a say it is not being asked for.
    expect(body.polygon).toBeUndefined()
    expect(body.min_elevation_ft).toBeUndefined()
  })

  it('falls back to unresolved rows when the server refuses', async () => {
    stubFetch(() => ({ ok: false, status: 503, json: async () => ({}) }))
    const out = await resolveCustomOnly(ROWS)
    expect(out.map((d) => d.name)).toEqual(['McClellan Butte'])
    expect(out[0].elevation_ft).toBeNull()
  })

  it('falls back to unresolved rows when the request cannot be made', async () => {
    stubFetch(() => {
      throw new TypeError('Failed to fetch')
    })
    const out = await resolveCustomOnly(ROWS)
    expect(out[0].elevation_ft).toBeNull()
  })

  it('falls back when the server answers with a different number of rows', async () => {
    stubFetch(() => ({ ok: true, json: async () => ({ destinations: [], total: 0 }) }))
    const out = await resolveCustomOnly(ROWS)
    expect(out.map((d) => d.name)).toEqual(['McClellan Butte'])
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
    expect(await resolveCustomOnly([])).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })

  it('makes no call when every row already knows its elevation', async () => {
    // The pins-only refresh: each searched place carries Nominatim's answer,
    // so this path reaches no server, exactly as it did before #207.
    const spy = stubFetch(() => ({ ok: true, json: async () => ({ destinations: [] }) }))
    const out = await resolveCustomOnly([
      { name: 'Pinned', latitude: 47.5, longitude: -121.9, elevation_ft: 6000 },
    ])
    expect(out[0].elevation_ft).toBe(6000)
    expect(spy).not.toHaveBeenCalled()
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

function row(name: string, aqi: number | null): DestinationResult {
  return {
    name,
    type: 'peak',
    latitude: 0,
    longitude: 0,
    elevation_ft: null,
    osm_id: null,
    precip_total_in: 0,
    precip_avg_in_hr: 0,
    precip_max_in_hr: 0,
    temp_min_f: 0,
    temp_max_f: 0,
    temp_avg_f: 0,
    wind_min_mph: 0,
    wind_max_mph: 0,
    wind_avg_mph: 0,
    aqi_avg: aqi,
    aqi_max: aqi,
    series: null,
  }
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
})

// ── assemble (port of _assemble) ───────────────────────────────────────────

const WX: WeatherResult = {
  precip_total_in: 0.3,
  precip_avg_in_hr: 0.15,
  precip_max_in_hr: 0.2,
  temp_min_f: 50,
  temp_max_f: 52,
  temp_avg_f: 51,
  wind_min_mph: 5,
  wind_max_mph: 7,
  wind_avg_mph: 6,
  series: {
    times: [1784592000000, 1784595600000],
    precip_in: [0.1, 0.2],
    temp_f: [50, 52],
    wind_mph: [5, 7],
  },
}

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
      aqi_max: 80,
      series: { times: [1784592000000], aqi: [60] },
    }
    const { results } = assemble([discovered('A')], [WX], [aqi])
    expect(results[0].aqi_avg).toBe(60)
    expect(results[0].series?.aqi).toEqual([60, null])
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

// ── filterElevation (port of _filter_elevation) ────────────────────────────

describe('filterElevation', () => {
  const dests = [
    { elevation_ft: null, name: 'untagged' },
    { elevation_ft: 1000, name: 'low' },
    { elevation_ft: 5000, name: 'high' },
    { elevation_ft: 3000, name: 'mid' },
  ]

  it('returns the input untouched when no band is set', () => {
    expect(filterElevation(dests, null, null)).toBe(dests)
  })

  it('keeps unknown elevations, matching the backend', () => {
    // Many OSM peaks carry no `ele` tag. Dropping them would make narrowing the
    // band look like destinations disappearing.
    expect(filterElevation(dests, 2000, null).map((d) => d.name)).toEqual([
      'untagged',
      'high',
      'mid',
    ])
  })

  it('applies each edge inclusively', () => {
    expect(filterElevation(dests, 3000, 5000).map((d) => d.name)).toEqual([
      'untagged',
      'high',
      'mid',
    ])
    expect(filterElevation(dests, null, 1000).map((d) => d.name)).toEqual(['untagged', 'low'])
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

// ── filterConstraints: the port of _filter_constraints ─────────────────────

function bounded(over: Partial<Constraints>): Constraints {
  return { ...NO_CONSTRAINTS, ...over }
}

function boundRow(name: string, over: Partial<DestinationResult>): DestinationResult {
  return {
    name,
    type: 'peak',
    latitude: 1,
    longitude: 2,
    elevation_ft: null,
    osm_id: null,
    precip_total_in: 0,
    precip_avg_in_hr: 0,
    precip_max_in_hr: 0,
    temp_min_f: 0,
    temp_max_f: 0,
    temp_avg_f: 0,
    wind_min_mph: 0,
    wind_max_mph: 0,
    wind_avg_mph: 0,
    aqi_avg: null,
    aqi_max: null,
    ...over,
  }
}

describe('filterConstraints', () => {
  it('returns the rows untouched when nothing is bounded', () => {
    const rows = [boundRow('a', {}), boundRow('b', {})]
    expect(filterConstraints(rows, NO_CONSTRAINTS)).toBe(rows)
  })

  it('bounds precipitation on the window total, in both directions', () => {
    const rows = [
      boundRow('dry', { precip_total_in: 0 }),
      boundRow('damp', { precip_total_in: 0.1 }),
      boundRow('wet', { precip_total_in: 1 }),
    ]
    expect(
      filterConstraints(rows, bounded({ maxPrecipTotalIn: 0.5 })).map((r) => r.name),
    ).toEqual(['dry', 'damp'])
    expect(
      filterConstraints(rows, bounded({ minPrecipTotalIn: 0.05 })).map((r) => r.name),
    ).toEqual(['damp', 'wet'])
  })

  it('reads the hottest hour for a ceiling, not the average', () => {
    // The whole point of the bound. Both rows average 60°F; only one of them
    // is somewhere you would actually go under an 80°F ceiling.
    const rows = [
      boundRow('mild', { temp_min_f: 50, temp_max_f: 70, temp_avg_f: 60 }),
      boundRow('spiky', { temp_min_f: 40, temp_max_f: 95, temp_avg_f: 60 }),
    ]
    expect(filterConstraints(rows, bounded({ maxTempF: 80 })).map((r) => r.name)).toEqual([
      'mild',
    ])
  })

  it('reads the coldest hour for a floor', () => {
    const rows = [
      boundRow('mild', { temp_min_f: 50, temp_max_f: 70 }),
      boundRow('frosty', { temp_min_f: 15, temp_max_f: 80 }),
    ]
    expect(filterConstraints(rows, bounded({ minTempF: 20 })).map((r) => r.name)).toEqual([
      'mild',
    ])
  })

  it('reads the gustiest hour for a wind ceiling', () => {
    const rows = [
      boundRow('calm', { wind_min_mph: 2, wind_max_mph: 12, wind_avg_mph: 6 }),
      boundRow('gusty', { wind_min_mph: 1, wind_max_mph: 45, wind_avg_mph: 6 }),
    ]
    expect(filterConstraints(rows, bounded({ maxWindMph: 20 })).map((r) => r.name)).toEqual([
      'calm',
    ])
  })

  it('bounds air quality on its worst hour', () => {
    const rows = [
      boundRow('clean', { aqi_avg: 20, aqi_max: 30 }),
      boundRow('smoky', { aqi_avg: 60, aqi_max: 140 }),
    ]
    expect(filterConstraints(rows, bounded({ maxAqi: 100 })).map((r) => r.name)).toEqual([
      'clean',
    ])
    expect(filterConstraints(rows, bounded({ minAqi: 100 })).map((r) => r.name)).toEqual([
      'smoky',
    ])
  })

  it('lets a null air quality through either bound', () => {
    // Past the ~5-day horizon there is no air quality at all, and an absent
    // number is not evidence of bad air. Dropping these rows would empty a
    // long-window analysis the moment a ceiling was set.
    const rows = [
      boundRow('unknown', { aqi_avg: null, aqi_max: null }),
      boundRow('smoky', { aqi_avg: 60, aqi_max: 140 }),
    ]
    expect(filterConstraints(rows, bounded({ maxAqi: 100 })).map((r) => r.name)).toEqual([
      'unknown',
    ])
    expect(filterConstraints(rows, bounded({ minAqi: 100 })).map((r) => r.name)).toEqual([
      'unknown',
      'smoky',
    ])
  })

  it('combines every bound as an AND', () => {
    const rows = [
      boundRow('keeper', { precip_total_in: 0, temp_max_f: 70, wind_max_mph: 10, aqi_max: 40 }),
      boundRow('wet', { precip_total_in: 2, temp_max_f: 70, wind_max_mph: 10, aqi_max: 40 }),
      boundRow('hot', { precip_total_in: 0, temp_max_f: 99, wind_max_mph: 10, aqi_max: 40 }),
      boundRow('windy', { precip_total_in: 0, temp_max_f: 70, wind_max_mph: 50, aqi_max: 40 }),
      boundRow('smoky', { precip_total_in: 0, temp_max_f: 70, wind_max_mph: 10, aqi_max: 180 }),
    ]
    const kept = filterConstraints(
      rows,
      bounded({ maxPrecipTotalIn: 0.5, maxTempF: 80, maxWindMph: 20, maxAqi: 100 }),
    )
    expect(kept.map((r) => r.name)).toEqual(['keeper'])
  })

  it('keeps nothing when a range is inverted', () => {
    // No cross-field validation, matching the elevation band: an impossible
    // request answers honestly rather than being rejected.
    const rows = [boundRow('a', { temp_min_f: 50, temp_max_f: 70 })]
    expect(filterConstraints(rows, bounded({ minTempF: 90, maxTempF: 10 }))).toEqual([])
  })
})

describe('constraint round trips', () => {
  it('carries every bound out to the wire fields and back', () => {
    const c = bounded({ maxPrecipTotalIn: 0.1, minTempF: 20, maxWindMph: 20, maxAqi: 100 })
    expect(constraintsFromRequest({ ...REQUEST, ...constraintFields(c) })).toEqual(c)
  })

  it('reads an unbounded request as no bounds at all', () => {
    expect(constraintsFromRequest(REQUEST)).toEqual(NO_CONSTRAINTS)
    expect(hasConstraints(NO_CONSTRAINTS)).toBe(false)
    expect(hasConstraints(bounded({ maxAqi: 100 }))).toBe(true)
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

  it('returns the empty result shape for zero candidates', async () => {
    const out = await runClientAnalysis(REQUEST, [], 0, 1)
    expect(out).toEqual({
      response: { results: [], total_queried: 0, total_matched: 0 },
      universe: [],
    })
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
    const removed = new Set([pinKey(3, -121.9), pinKey(1, -121.9)])
    expect(refreshEchoRows(universe, displayed, removed).map((r) => r.name)).toEqual(['Mid'])
  })

  it('sends elevation as undefined, not null, so the request stays valid', () => {
    const [known, unknown] = refreshEchoRows([at('Known', 4, 9000), at('Unknown', 5)], [], new Set())
    expect(known.elevation_ft).toBe(9000)
    expect(unknown.elevation_ft).toBeUndefined()
  })
})
