import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_BYTES,
  NO_DATA,
  STORAGE_KEY,
  buildSnapshot,
  cacheGet,
  cachePut,
  hydrateForecastCache,
  keepForecastsAcrossReload,
  readSnapshot,
  resetForecastCache,
} from './forecastStore'
import { MINUTE_MS } from './forecastWindow'

// `performance.now()` readings in the tests below are arbitrary: what matters
// is that the in-memory expiry is measured against one clock and the stored one
// against the other, so both are passed in.
const PERF = 10_000
const NOW = Date.parse('2026-09-14T12:00:00Z')
// Two builds' identities, in the shape `main.tsx` hands over: the entry chunk's URL.
const BUILD = 'https://bluebirdforecast.com/assets/index-AAAA.js'
const OTHER_BUILD = 'https://bluebirdforecast.com/assets/index-BBBB.js'

function entry(expiresInMs: number, value: unknown = { precip_total_in: 1 }) {
  return { expires: PERF + expiresInMs, value }
}

describe('buildSnapshot', () => {
  it('stores what is left of each entry, not when it expires', () => {
    // The two clocks are the whole problem. `performance.now()` restarts at
    // zero on reload, so an expiry measured against it means nothing to the
    // next page. What survives is the remaining milliseconds plus the wall
    // clock reading at the write.
    const snapshot = buildSnapshot([['a', entry(5 * 60_000)]], PERF, NOW, BUILD)
    expect(snapshot.build).toBe(BUILD)
    expect(snapshot.savedAt).toBe(NOW)
    expect(snapshot.entries).toEqual([{ k: 'a', v: { precip_total_in: 1 }, ttl: 5 * 60_000 }])
  })

  it('drops an entry that has already expired', () => {
    const snapshot = buildSnapshot([['gone', entry(-1)], ['live', entry(60_000)]], PERF, NOW, BUILD)
    expect(snapshot.entries.map((e) => e.k)).toEqual(['live'])
  })

  it('keeps the newest entries when the budget runs out', () => {
    // The map iterates in insertion order, so the last one in is the newest and
    // the most likely to be asked for again.
    const big = 'x'.repeat(400)
    const entries: [string, { expires: number; value: unknown }][] = [
      ['oldest', entry(60_000, big)],
      ['middle', entry(60_000, big)],
      ['newest', entry(60_000, big)],
    ]
    const snapshot = buildSnapshot(entries, PERF, NOW, BUILD, 1_000)
    expect(snapshot.entries.map((e) => e.k)).toEqual(['newest', 'middle'])
  })

  it('never writes more than the budget', () => {
    // One measured entry is about 10.5 KB, so the real cache overflows the
    // budget long before it overflows storage. The string that is written is
    // what has to fit, envelope included.
    const value = { series: { precip_in: Array.from({ length: 360 }, () => 0.0123) } }
    const entries: [string, { expires: number; value: unknown }][] = Array.from(
      { length: 2_000 },
      (_, i) => [`k${i}`, entry(60_000, value)],
    )
    const snapshot = buildSnapshot(entries, PERF, NOW, BUILD)
    expect(JSON.stringify(snapshot).length).toBeLessThanOrEqual(MAX_BYTES)
    expect(snapshot.entries.length).toBeGreaterThan(0)
    expect(snapshot.entries.length).toBeLessThan(2_000)
  })
})

describe('readSnapshot', () => {
  it('subtracts the time the page was away', () => {
    const snapshot = buildSnapshot([['a', entry(10 * 60_000)]], PERF, NOW, BUILD)
    const back = readSnapshot(snapshot, 500, NOW + 4 * 60_000, BUILD)
    expect(back).toEqual([['a', { expires: 500 + 6 * 60_000, value: { precip_total_in: 1 } }]])
  })

  it('drops an entry whose freshness ran out while the page was away', () => {
    const snapshot = buildSnapshot([['a', entry(60_000)]], PERF, NOW, BUILD)
    expect(readSnapshot(snapshot, 0, NOW + 61_000, BUILD)).toEqual([])
  })

  it('restores the order the entries were written in', () => {
    // The map's insertion order is its eviction order, so a restore that
    // reversed it would evict the newest entries first.
    const snapshot = buildSnapshot(
      [['old', entry(60_000)], ['new', entry(60_000)]],
      PERF,
      NOW,
      BUILD,
    )
    expect(readSnapshot(snapshot, 0, NOW, BUILD).map(([k]) => k)).toEqual(['old', 'new'])
  })

  it('refuses a snapshot from the future', () => {
    // A clock that moved backwards would otherwise hand back more freshness
    // than was ever stored.
    const snapshot = buildSnapshot([['a', entry(60_000)]], PERF, NOW, BUILD)
    expect(readSnapshot(snapshot, 0, NOW - 1_000, BUILD)).toEqual([])
  })

  it('reads nothing out of anything it does not recognize', () => {
    for (const junk of [null, undefined, 42, 'text', {}, { entries: 'no' }, { savedAt: NOW }]) {
      expect(readSnapshot(junk, 0, NOW, BUILD)).toEqual([])
    }
    expect(readSnapshot({ build: BUILD, savedAt: NOW, entries: [null, { k: 1 }, { ttl: 1 }] }, 0, NOW, BUILD)).toEqual(
      [],
    )
    // A stamp written as text: subtraction would coerce it into a working
    // number, so only the type test refuses it.
    const textStamp = { build: BUILD, savedAt: String(NOW - 1_000), entries: [{ k: 'a', ttl: 60_000, v: 1 }] }
    expect(readSnapshot(textStamp, 0, NOW, BUILD)).toEqual([])
  })

  it('reads nothing out of another build, or out of a snapshot with no build', () => {
    // The values are aggregates, so a release that changes the aggregation
    // changes what they mean.
    const snapshot = buildSnapshot([['a', entry(60_000)]], PERF, NOW, BUILD)
    expect(readSnapshot(snapshot, 0, NOW, OTHER_BUILD)).toEqual([])
    const unstamped = { savedAt: snapshot.savedAt, entries: snapshot.entries }
    expect(readSnapshot(unstamped, 0, NOW, BUILD)).toEqual([])
  })
})

// The node project has no sessionStorage, so the one the module reads is a
// Map behind the same three calls.
function stubStorage(stored: unknown) {
  const items = new Map<string, string>()
  if (stored !== undefined) items.set(STORAGE_KEY, JSON.stringify(stored))
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    removeItem: (k: string) => void items.delete(k),
  })
  return items
}

// Written a minute ago with ten minutes left, so a restore has five to nine
// minutes of freshness whatever `performance.now()` reads.
function stored(build?: string) {
  const snapshot = buildSnapshot([['weather|1', entry(10 * 60_000)]], PERF, Date.now() - 60_000, build ?? BUILD)
  return build !== undefined ? snapshot : { savedAt: snapshot.savedAt, entries: snapshot.entries }
}

describe('hydrateForecastCache', () => {

  afterEach(() => {
    vi.unstubAllGlobals()
    resetForecastCache()
  })

  it('restores a snapshot the same build wrote, and leaves it in place', () => {
    const items = stubStorage(stored(BUILD))
    hydrateForecastCache(BUILD)
    expect(cacheGet('weather|1')).toEqual({ precip_total_in: 1 })
    expect(items.has(STORAGE_KEY)).toBe(true)
  })

  it('discards and removes a snapshot another build wrote', () => {
    const items = stubStorage(stored(OTHER_BUILD))
    hydrateForecastCache(BUILD)
    expect(cacheGet('weather|1')).toBeUndefined()
    expect(items.has(STORAGE_KEY)).toBe(false)
  })

  it('discards and removes a snapshot that names no build', () => {
    const items = stubStorage(stored())
    hydrateForecastCache(BUILD)
    expect(cacheGet('weather|1')).toBeUndefined()
    expect(items.has(STORAGE_KEY)).toBe(false)
  })
})

describe('the in-memory cache', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    resetForecastCache()
  })

  it('forgets an entry once its fifteen minutes are up', () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(PERF)
    cachePut('weather|1', NO_DATA)
    clock.mockReturnValue(PERF + 14 * MINUTE_MS)
    expect(cacheGet('weather|1')).toBe(NO_DATA)
    clock.mockReturnValue(PERF + 15 * MINUTE_MS)
    expect(cacheGet('weather|1')).toBeUndefined()
  })

  it('drops the oldest entry past five thousand', () => {
    for (let i = 0; i <= 5_000; i++) cachePut(`weather|${i}`, NO_DATA)
    expect(cacheGet('weather|0')).toBeUndefined()
    expect(cacheGet('weather|1')).toBe(NO_DATA)
    expect(cacheGet('weather|5000')).toBe(NO_DATA)
  })
})

describe('keepForecastsAcrossReload', () => {
  // Node has neither a window nor a document, so each is an EventTarget the
  // test dispatches on, fresh per test so no listener outlives its own.
  let page: EventTarget
  let doc: EventTarget & { visibilityState: DocumentVisibilityState }

  beforeEach(() => {
    page = new EventTarget()
    doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState })
    vi.stubGlobal('window', page)
    vi.stubGlobal('document', doc)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    resetForecastCache()
  })

  const hide = () => page.dispatchEvent(new Event('pagehide'))
  const writtenBuild = (items: Map<string, string>) => JSON.parse(items.get(STORAGE_KEY)!).build

  it('writes the snapshot when the page hides, only after something changed', () => {
    const items = stubStorage(undefined)
    keepForecastsAcrossReload(BUILD)
    expect(cacheGet('weather|1')).toBeUndefined()

    hide()
    expect(items.has(STORAGE_KEY)).toBe(false)

    cachePut('weather|1', NO_DATA)
    hide()
    expect(writtenBuild(items)).toBe(BUILD)

    // Nothing changed since that write, so a second hide writes nothing.
    items.delete(STORAGE_KEY)
    hide()
    expect(items.has(STORAGE_KEY)).toBe(false)
  })

  it('writes on a hidden visibilitychange, and on no other', () => {
    const items = stubStorage(undefined)
    keepForecastsAcrossReload(BUILD)
    cachePut('weather|1', NO_DATA)
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(items.has(STORAGE_KEY)).toBe(false)
    doc.visibilityState = 'hidden'
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(writtenBuild(items)).toBe(BUILD)
  })

  // The corrupt value stays until the next write replaces it.
  it('loads a stored value that is not JSON as no snapshot', () => {
    const items = stubStorage(undefined)
    items.set(STORAGE_KEY, 'not json {')
    expect(() => keepForecastsAcrossReload(BUILD)).not.toThrow()
    expect(cacheGet('weather|1')).toBeUndefined()
  })

  it('leaves no snapshot behind when storage refuses the write', () => {
    // A snapshot this build wrote, which the hydrate leaves in place, so only
    // the refused write can be what removes it.
    const items = stubStorage(stored(BUILD))
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => items.get(k) ?? null,
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError')
      },
      removeItem: (k: string) => void items.delete(k),
    })
    keepForecastsAcrossReload(BUILD)
    expect(items.has(STORAGE_KEY)).toBe(true)
    cachePut('weather|2', NO_DATA)
    expect(hide).not.toThrow()
    expect(items.has(STORAGE_KEY)).toBe(false)
  })
})
