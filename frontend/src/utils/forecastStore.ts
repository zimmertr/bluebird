/**
 * The per-location forecast cache, across a reload (issue #337, finding 3).
 *
 * `openMeteo.ts` holds forecasts in a module `Map` for 15 minutes, which is the
 * same freshness the pod's own cache keeps and the same window `useAnalyze.ts`
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
 * Everything here is pure except `loadSnapshot`/`saveSnapshot`, which are the
 * only two functions that touch storage and which swallow every failure. A
 * private window, cleared site data, and a full quota all present as an
 * exception from an ordinary-looking property access, and none of them is a
 * reason to fail an analysis.
 */

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
