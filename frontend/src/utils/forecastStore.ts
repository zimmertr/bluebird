/**
 * The per-location forecast cache, in memory and across a reload (issue #337,
 * finding 3).
 *
 * The module `Map` below holds forecasts for 15 minutes, which is the
 * same freshness the pod's own cache keeps and the same window `forecastReuse.ts`
 * will reuse a held field inside. A reload emptied it, so a visitor who
 * refreshed the page re-spent their own Open-Meteo quota on coordinates the
 * browser had already paid for. Quota is the scarcest thing this app spends.
 *
 * Two measurements shape everything here (2026-09-14):
 *
 * 1. **One entry is about 10.5 KB.** A 15-day window is 360 hourly stamps
 *    across five or six series arrays. So 100 destinations are 1.0 MB, 500 are
 *    5.2 MB, and a maximal 1,500-destination analysis is 15.7 MB.
 * 2. **`sessionStorage` holds about 5 MB per origin.** A full mirror therefore
 *    cannot exist, and a writer that tried would throw on the entry that
 *    crossed the line and lose the whole write.
 *
 * So this is a budget, not a mirror: newest entries first until `MAX_BYTES`,
 * then stop. What fits comes back free and the rest is re-fetched, which is
 * exactly what would have happened to all of it.
 *
 * The expiry has to change shape on the way out. In memory it is a
 * `performance.now()` reading, which is monotonic and immune to the wall clock
 * moving, and which resets to zero on reload. What is stored is the wall-clock
 * moment of the write plus the milliseconds that were left, so the reader can
 * subtract however long the page was away.
 *
 * The snapshot half is pure except `loadSnapshot`/`saveSnapshot`, which are the
 * only two functions that touch storage and which swallow every failure. A
 * private window, cleared site data, and a full quota all present as an
 * exception from an ordinary-looking property access, and none of them is a
 * reason to fail an analysis.
 */

import type { AqiResult, CloudResult, Coordinate, WeatherResult } from './openMeteo'

export const STORAGE_KEY = 'bluebird_forecast_cache_v1'

/**
 * 2 MB of the ~5 MB budget, which is about 190 destinations.
 *
 * Not the whole quota: this is one origin's storage, shared with anything else
 * the app keeps there, and a writer that fills it leaves nothing for the view
 * state. Measured cost of a write at this size is about 6 ms of
 * `JSON.stringify`, which is why the caller writes on the way out of the page
 * rather than after every batch.
 */
export const MAX_BYTES = 2_000_000

/** One entry as it is stored: the key, the value, and the ms it had left. */
export interface StoredEntry {
  k: string
  v: unknown
  /** Milliseconds of freshness remaining at the moment of the write. */
  ttl: number
}

export interface StoredSnapshot {
  /** `Date.now()` at the write, so the reader can measure the gap. */
  savedAt: number
  entries: StoredEntry[]
}

/**
 * The entries worth keeping, newest first, under the byte budget.
 *
 * `perfNow` is the caller's `performance.now()`, which is what the in-memory
 * expiries are measured against. An entry that has already expired is dropped
 * rather than stored: it would only be dropped again on the way back in.
 */
export function buildSnapshot(
  entries: Iterable<[string, { expires: number; value: unknown }]>,
  perfNow: number,
  nowMs: number,
  maxBytes = MAX_BYTES,
): StoredSnapshot {
  // The map iterates in insertion order, so the newest entries are last. They
  // are the ones most likely to be asked for again, so they are kept first.
  const fresh: StoredEntry[] = []
  for (const [k, entry] of entries) {
    const ttl = entry.expires - perfNow
    if (ttl > 0) fresh.push({ k, v: entry.value, ttl })
  }
  fresh.reverse()

  const kept: StoredEntry[] = []
  // The envelope's own cost, so the budget bounds the string that is actually
  // written rather than the entries alone.
  let bytes = JSON.stringify({ savedAt: nowMs, entries: [] }).length
  for (const entry of fresh) {
    const size = JSON.stringify(entry).length + 1
    if (bytes + size > maxBytes) break
    kept.push(entry)
    bytes += size
  }
  return { savedAt: nowMs, entries: kept }
}

/**
 * A stored snapshot as entries to put back, with the time away subtracted.
 *
 * Returns them oldest-last, matching the order `buildSnapshot` wrote, so the
 * restored map keeps the same newest-last insertion order it had before.
 */
export function readSnapshot(
  snapshot: unknown,
  perfNow: number,
  nowMs: number,
): [string, { expires: number; value: unknown }][] {
  if (!snapshot || typeof snapshot !== 'object') return []
  const { savedAt, entries } = snapshot as Partial<StoredSnapshot>
  if (typeof savedAt !== 'number' || !Array.isArray(entries)) return []
  // A clock that moved backwards would otherwise hand back more freshness than
  // was stored. Treat any impossible gap as the whole of it.
  const away = nowMs - savedAt
  if (!Number.isFinite(away) || away < 0) return []

  const out: [string, { expires: number; value: unknown }][] = []
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]
    if (!entry || typeof entry.k !== 'string' || typeof entry.ttl !== 'number') continue
    const left = entry.ttl - away
    if (left <= 0) continue
    out.push([entry.k, { expires: perfNow + left, value: entry.v }])
  }
  return out
}

/** The raw snapshot in storage, or null. Never throws. */
export function loadSnapshot(): unknown {
  try {
    const raw = globalThis.sessionStorage?.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** Write the snapshot, or do nothing at all. Never throws. */
export function saveSnapshot(snapshot: StoredSnapshot): void {
  try {
    globalThis.sessionStorage?.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // A full quota, a private window, or blocked site data. The in-memory map
    // is unaffected and the next analysis costs exactly what it would have.
    try {
      globalThis.sessionStorage?.removeItem(STORAGE_KEY)
    } catch {
      /* nothing left to try */
    }
  }
}

// ── Per-location result cache ──────────────────────────────────────────────

// Repeat clicks on an unchanged polygon and window cost zero upstream calls.
// Keys are exact coordinates on purpose: Open-Meteo interpolates per
// coordinate (including elevation downscaling), so a rounded key would serve
// one peak its neighbor's forecast and silently change displayed values.
// TTL sits under Open-Meteo's roughly hourly model-update cadence.
const CACHE_TTL_MS = 15 * 60_000
const CACHE_MAX_ENTRIES = 5_000
// "No data for this window" is a real cached answer, distinct from a miss.
export const NO_DATA = 'NO_DATA'

type CacheEntry = {
  expires: number
  value: WeatherResult | AqiResult | CloudResult | typeof NO_DATA
}
// The reader's forecasts, which are the only ones ever written to storage.
const readerCache = new Map<string, CacheEntry>()
// The map every read and write goes to: the reader's, or the tutorial's own
// empty one while it runs (#536).
let forecastCache = readerCache

// `model` is part of the key for the same reason the coordinates are: two
// models answering the same question disagree, which is the whole point of
// being able to choose one. Empty for air quality, which has a single model.
export function cacheKey(
  service: 'weather' | 'aqi' | 'cloud',
  c: Coordinate,
  startMs: number,
  endMs: number,
  model = '',
  terrainElevation = false,
  source = '',
): string {
  // Elevation joins the weather key for the reason the model does: the stored
  // aggregates were computed AT that elevation (issue #257), so the same
  // coordinates claimed at a different height are a different question. A
  // grid sample adjusting to the MODEL's terrain height is a third answer at
  // the same coordinates, distinct from both a claimed elevation and none —
  // without its own key, a destination with no elevation and the grid cell
  // over it would poison each other's entries.
  // The cloud column (#117) keys on it for the same reason: its walk up the
  // column starts at that height.
  const elevation =
    service === 'aqi' ? '' : (c.elevation_ft ?? (terrainElevation ? 'model' : ''))
  // `source` is which endpoint answered (#123). The archive carries no
  // pressure-level winds, so its rows hold the 10 m wind where the forecast
  // endpoint's hold wind at elevation, and the boundary between the two moves
  // with the clock — so an entry is only ever read back for the endpoint that
  // produced it. A window crossing the boundary keys on 'spanning', because its
  // joined series is a third answer at the same coordinates and window rather
  // than either half.
  return `${service}|${c.latitude}|${c.longitude}|${startMs}|${endMs}|${model}|${elevation}|${source}`
}

export function cacheGet(key: string): CacheEntry['value'] | undefined {
  const entry = forecastCache.get(key)
  if (!entry) return undefined
  if (performance.now() >= entry.expires) {
    forecastCache.delete(key)
    return undefined
  }
  return entry.value
}

export function cachePut(key: string, value: CacheEntry['value']): void {
  forecastCache.set(key, { expires: performance.now() + CACHE_TTL_MS, value })
  if (forecastCache === readerCache) cacheDirty = true
  if (forecastCache.size > CACHE_MAX_ENTRIES) {
    for (const oldest of forecastCache.keys()) {
      forecastCache.delete(oldest)
      if (forecastCache.size <= CACHE_MAX_ENTRIES) break
    }
  }
}

// ── Surviving a reload ─────────────────────────────────────────────────────

// The cache above dies with the page, so a reload re-spends the visitor's own
// Open-Meteo quota on coordinates the browser already paid for (#337, finding
// 3). The snapshot functions above mirror what fits into `sessionStorage`: one
// entry measures about 10.5 KB, storage holds about 5 MB, so it is a budget of
// the newest entries rather than a mirror of all of them. Every decision and
// every measurement is in this file's header; this is the wiring.
//
// The write happens on the way out of the page rather than after each batch,
// because serializing the budget costs about 6 ms and nothing about an
// in-flight analysis needs it done sooner. `pagehide` is the event that
// survives the back/forward cache; `visibilitychange` covers a phone whose
// browser is backgrounded and then killed.
let cacheDirty = false

function persistForecastCache(): void {
  if (!cacheDirty) return
  cacheDirty = false
  saveSnapshot(buildSnapshot(readerCache, performance.now(), Date.now()))
}

function hydrateForecastCache(): void {
  for (const [key, entry] of readSnapshot(loadSnapshot(), performance.now(), Date.now())) {
    readerCache.set(key, entry as CacheEntry)
  }
}

if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
  hydrateForecastCache()
  window.addEventListener('pagehide', persistForecastCache)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persistForecastCache()
  })
}

// Test hook: the cache is module state that must not leak between unit tests.
// `resetOpenMeteoState` calls it beside resetting the pacing budgets.
export function resetForecastCache(): void {
  cacheDirty = false
  readerCache.clear()
  forecastCache = readerCache
}

/**
 * Answer from an empty cache of the tutorial's own until
 * `leaveForecastScratch` (#536). The reader's map is left as it stood, and it
 * is still the one a `pagehide` saves, so a tab closed mid-tutorial stores the
 * reader's forecasts and none of the demo's.
 */
export function enterForecastScratch(): void {
  forecastCache = new Map()
}

/** Back to the reader's cache; the demo's forecasts go with the scratch map. */
export function leaveForecastScratch(): void {
  forecastCache = readerCache
}
