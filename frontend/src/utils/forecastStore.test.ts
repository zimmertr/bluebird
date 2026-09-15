import { describe, expect, it } from 'vitest'
import { MAX_BYTES, buildSnapshot, readSnapshot } from './forecastStore'

// `performance.now()` readings in the tests below are arbitrary: what matters
// is that the in-memory expiry is measured against one clock and the stored one
// against the other, so both are passed in.
const PERF = 10_000
const NOW = Date.parse('2026-09-14T12:00:00Z')

function entry(expiresInMs: number, value: unknown = { precip_total_in: 1 }) {
  return { expires: PERF + expiresInMs, value }
}

describe('buildSnapshot', () => {
  it('stores what is left of each entry, not when it expires', () => {
    // The two clocks are the whole problem. `performance.now()` restarts at
    // zero on reload, so an expiry measured against it means nothing to the
    // next page. What survives is the remaining milliseconds plus the wall
    // clock reading at the write.
    const snapshot = buildSnapshot([['a', entry(5 * 60_000)]], PERF, NOW)
    expect(snapshot.savedAt).toBe(NOW)
    expect(snapshot.entries).toEqual([{ k: 'a', v: { precip_total_in: 1 }, ttl: 5 * 60_000 }])
  })

  it('drops an entry that has already expired', () => {
    const snapshot = buildSnapshot([['gone', entry(-1)], ['live', entry(60_000)]], PERF, NOW)
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
    const snapshot = buildSnapshot(entries, PERF, NOW, 1_000)
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
    const snapshot = buildSnapshot(entries, PERF, NOW)
    expect(JSON.stringify(snapshot).length).toBeLessThanOrEqual(MAX_BYTES)
    expect(snapshot.entries.length).toBeGreaterThan(0)
    expect(snapshot.entries.length).toBeLessThan(2_000)
  })
})

describe('readSnapshot', () => {
  it('subtracts the time the page was away', () => {
    const snapshot = buildSnapshot([['a', entry(10 * 60_000)]], PERF, NOW)
    const back = readSnapshot(snapshot, 500, NOW + 4 * 60_000)
    expect(back).toEqual([['a', { expires: 500 + 6 * 60_000, value: { precip_total_in: 1 } }]])
  })

  it('drops an entry whose freshness ran out while the page was away', () => {
    const snapshot = buildSnapshot([['a', entry(60_000)]], PERF, NOW)
    expect(readSnapshot(snapshot, 0, NOW + 61_000)).toEqual([])
  })

  it('restores the order the entries were written in', () => {
    // The map's insertion order is its eviction order, so a restore that
    // reversed it would evict the newest entries first.
    const snapshot = buildSnapshot(
      [['old', entry(60_000)], ['new', entry(60_000)]],
      PERF,
      NOW,
    )
    expect(readSnapshot(snapshot, 0, NOW).map(([k]) => k)).toEqual(['old', 'new'])
  })

  it('refuses a snapshot from the future', () => {
    // A clock that moved backwards would otherwise hand back more freshness
    // than was ever stored.
    const snapshot = buildSnapshot([['a', entry(60_000)]], PERF, NOW)
    expect(readSnapshot(snapshot, 0, NOW - 1_000)).toEqual([])
  })

  it('reads nothing out of anything it does not recognize', () => {
    for (const junk of [null, undefined, 42, 'text', {}, { entries: 'no' }, { savedAt: NOW }]) {
      expect(readSnapshot(junk, 0, NOW)).toEqual([])
    }
    expect(readSnapshot({ savedAt: NOW, entries: [null, { k: 1 }, { ttl: 1 }] }, 0, NOW)).toEqual(
      [],
    )
  })
})
