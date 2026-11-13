import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchSnowDepth, withSnowDepth } from './snowHistory'
import { geoKey } from './points'
import { fakeResponse, resultRow, series } from '../testSupport/fixtures'
import type { SnowDepthAtPoint } from '../types'

const DAY_MS = 86_400_000
const START = Date.UTC(2026, 10, 10, 12)
const POINTS = [
  { latitude: 46.85, longitude: -121.76 },
  { latitude: 48.77, longitude: -121.81 },
]

const at = (over: Partial<SnowDepthAtPoint> = {}): SnowDepthAtPoint => ({
  avg_in: 20,
  min_in: 10,
  max_in: 30,
  days: [
    { day: '2026-11-10', depth_in: 10 },
    { day: '2026-11-11', depth_in: 30 },
  ],
  ...over,
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchSnowDepth', () => {
  it('asks once for the whole field and keys each answer by its point', async () => {
    const spy = vi.fn(async () =>
      fakeResponse({ snow_analysis_date: '2026-11-11', points: [at(), at({ max_in: 80 })] }),
    )
    vi.stubGlobal('fetch', spy)
    const out = await fetchSnowDepth(POINTS, START, START + 3 * DAY_MS)
    expect(spy).toHaveBeenCalledTimes(1)
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/api/snow-depth')
    expect(JSON.parse(init.body as string)).toEqual({
      points: POINTS,
      start_datetime: new Date(START).toISOString(),
      end_datetime: new Date(START + 3 * DAY_MS).toISOString(),
    })
    expect(out!.get(geoKey(46.85, -121.76))!.max_in).toBe(30)
    expect(out!.get(geoKey(48.77, -121.81))!.max_in).toBe(80)
  })

  it('asks nothing for an empty field', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    expect(await fetchSnowDepth([], START, START)).toEqual(new Map())
    expect(spy).not.toHaveBeenCalled()
  })

  // Best effort, like air quality: a refusal or a dropped connection leaves
  // the rows reading N/A and fails nothing else.
  it('answers null for a refusal or a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ error: { code: 'rate_limited' } }, 429)))
    expect(await fetchSnowDepth(POINTS, START, START)).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))))
    expect(await fetchSnowDepth(POINTS, START, START)).toBeNull()
  })

  // A cancelled analysis must stop as a cancel, not read as a missing depth.
  it('passes a cancel through', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new DOMException('stop', 'AbortError'))))
    await expect(fetchSnowDepth(POINTS, START, START)).rejects.toThrow('stop')
  })
})

describe('withSnowDepth', () => {
  // Three hours on each of three days, the last day past the newest analysis.
  const times = [0, 6, 18, 24, 30, 42, 48, 54, 66].map((h) => Date.UTC(2026, 10, 10) + h * 3_600_000)

  it('carries the window aggregates onto the row', () => {
    const row = withSnowDepth(resultRow(), at(), times)
    expect([row.snow_depth_avg_in, row.snow_depth_min_in, row.snow_depth_max_in]).toEqual([20, 10, 30])
  })

  // The chart draws only what was measured, so the series is null past the
  // newest day rather than repeating it.
  it('gives each hour its UTC day and stops at the newest day', () => {
    const row = withSnowDepth(resultRow({ series: series() }), at(), times)
    expect(row.series!.snow_depth_in).toEqual([10, 10, 10, 30, 30, 30, null, null, null])
  })

  it('reads a row\'s own grid before the report\'s', () => {
    const own = [Date.UTC(2026, 10, 11, 3)]
    const row = withSnowDepth(resultRow({ series: series(), series_times: own }), at(), times)
    expect(row.series!.snow_depth_in).toEqual([30])
  })

  it('reads N/A everywhere for a point with no answer', () => {
    const row = withSnowDepth(resultRow({ series: series(), snow_depth_max_in: 5 }), undefined, times)
    expect([row.snow_depth_avg_in, row.snow_depth_min_in, row.snow_depth_max_in]).toEqual([null, null, null])
    expect(row.series!.snow_depth_in!.every((v) => v === null)).toBe(true)
  })

  it('leaves a row with no series without one', () => {
    expect(withSnowDepth(resultRow({ series: null }), at(), times).series).toBeNull()
  })
})
