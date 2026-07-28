import { afterEach, describe, expect, it, vi } from 'vitest'
import { AnalyzeRequest, DestinationResult, DiscoveredDestination } from '../types'
import {
  MAX_ANALYZE_DESTINATIONS,
  alignAqi,
  analysisNoun,
  assemble,
  canonicalTimes,
  capDetail,
  customRows,
  mergeCustom,
  rankComparator,
  runClientAnalysis,
} from './clientAnalyze'
import { WeatherResult } from './openMeteo'
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

// ── mergeCustom (port of _merge_custom) ────────────────────────────────────

function discovered(name: string, lat = 47.5, lon = -121.9): DiscoveredDestination {
  return { name, type: 'peak', latitude: lat, longitude: lon, elevation_ft: null, osm_id: 'node/1' }
}

describe('mergeCustom', () => {
  it('drops a discovered row claimed by exact name', () => {
    const custom = customRows([{ name: 'Alpha', latitude: 1, longitude: 1 }])
    const merged = mergeCustom([discovered('Alpha'), discovered('Beta')], custom)
    expect(merged.map((d) => `${d.name}:${d.type}`)).toEqual(['Beta:peak', 'Alpha:custom'])
  })

  it('drops a discovered row claimed by 5-decimal coordinates', () => {
    const custom = customRows([{ name: 'Mine', latitude: 47.5, longitude: -121.9 }])
    const merged = mergeCustom([discovered('Alpha', 47.5, -121.9)], custom)
    expect(merged.map((d) => d.name)).toEqual(['Mine'])
  })

  it('keeps near-misses as two rows', () => {
    const custom = customRows([{ name: 'Mine', latitude: 47.50002, longitude: -121.9 }])
    const merged = mergeCustom([discovered('Alpha', 47.5, -121.9)], custom)
    expect(merged.map((d) => d.name)).toEqual(['Alpha', 'Mine'])
  })

  it('custom rows always survive, appended after discovery', () => {
    const custom = customRows([{ name: 'Solo', latitude: 2, longitude: 2 }])
    expect(mergeCustom([], custom).map((d) => d.name)).toEqual(['Solo'])
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
  it('advises only the remedies in play', () => {
    expect(capDetail(1201, 'peak', true, false)).toContain(
      'Draw a smaller polygon or narrow the elevation range.',
    )
    expect(capDetail(1201, 'destination', false, true)).toContain('Trim the custom list')
    expect(capDetail(1201, 'destination', true, true)).toContain('or trim the custom list')
  })

  it('formats counts with separators like the backend', () => {
    expect(capDetail(1201, 'peak', true, false)).toContain('1,201 peaks')
    expect(capDetail(1201, 'peak', true, false)).toContain('1,000')
  })
})

describe('analysisNoun', () => {
  const base = { start_datetime: '', end_datetime: '', limit: 10 }
  it('uses the discovery noun for pure polygon runs', () => {
    expect(analysisNoun({ ...base, destination_type: 'peak' } as AnalyzeRequest)).toBe('peak')
  })
  it('a union is a mixed set of destinations', () => {
    expect(
      analysisNoun({
        ...base,
        destination_type: 'peak',
        custom_destinations: [{ name: 'X', latitude: 0, longitude: 0 }],
      } as AnalyzeRequest),
    ).toBe('destination')
  })
})

// ── runClientAnalysis end-to-end (fetch mocked) ────────────────────────────

const REQUEST: AnalyzeRequest = {
  destination_type: 'custom',
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

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('runClientAnalysis', () => {
  it('ranks, trims to limit, and reports total_queried', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        // Hostname compare rather than a substring: routes the mock exactly
        // and keeps CodeQL's URL-sanitization rule quiet.
        const isWeather = new URL(url).hostname === 'api.open-meteo.com'
        const count = new URL(url).searchParams.get('latitude')!.split(',').length
        return {
          ok: true,
          status: 200,
          json: async () =>
            isWeather
              ? weatherBody([0.3, 0.1, 0.2].slice(0, count))
              : Array.from({ length: count }, () => ({ hourly: { time: [], us_aqi: [] } })),
        }
      }),
    )
    const dests = customRows([
      { name: 'Wet', latitude: 1, longitude: 1 },
      { name: 'Dry', latitude: 2, longitude: 2 },
      { name: 'Mid', latitude: 3, longitude: 3 },
    ])
    const startMs = Date.parse('2026-07-21T00:00:00Z')
    const endMs = Date.parse('2026-07-21T02:00:00Z')
    const out = await runClientAnalysis(REQUEST, dests, startMs, endMs, {
      nowMs: startMs,
    })
    expect(out.total_queried).toBe(3)
    expect(out.results.map((r) => r.name)).toEqual(['Dry', 'Mid'])
    expect(out.times).toHaveLength(2)
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

  it('returns the empty result shape for zero candidates', async () => {
    const out = await runClientAnalysis(REQUEST, [], 0, 1)
    expect(out).toEqual({ results: [], total_queried: 0 })
  })
})
