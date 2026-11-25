// Where the browser asks for forecasts, and the bookkeeping that decides which
// source to ask next (record 0345). Every analysis used to depend on
// Open-Meteo's public hosts alone, so a host that hung or refused failed the
// run however long it lasted. The deployment now publishes a list
// (`open_meteo_sources` on `/api/capabilities`), its own mirrors first and
// the public hosts last, and `openMeteo.ts` walks it through `chainFor`.
//
// Three pieces of state live here, all module-level for the pacers' reason in
// `openMeteo.ts`: they describe the hosts, not one fetch, so a forecast grid
// and an analysis running together must see the same answer.
// - a breaker per host, so a host that just failed twice is asked last for a
//   minute rather than first by every batch;
// - the latency each host has answered in, so a slow request gets a second
//   copy after about the time a normal one takes (`hedgeDelayMs`);
// - nothing per run: that is `RunBudget`, which a caller makes once per run.

import type { OpenMeteoSource } from '../types'
import { clamp } from './numbers'

export const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
// Where a window older than the forecast endpoint's retention goes (#123).
// `windowSource` in forecastWindow.ts is the one thing that decides which of the
// two a window belongs to, mirrored with the backend.
export const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive'
export const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality'

export type Endpoint = 'forecast' | 'archive' | 'air_quality'

/**
 * Open-Meteo's own hosts, which the backend publishes last in every list and
 * which stand in until `/api/capabilities` answers, or on a deployment whose
 * answer names no usable source. The same three URLs `open_meteo_sources.py`
 * names, which is a comment's promise only: a drift would leave the browser
 * asking one set before the answer and another after it.
 */
export const PUBLIC_SOURCE: OpenMeteoSource = {
  name: 'open-meteo',
  forecast_url: FORECAST_URL,
  archive_url: ARCHIVE_URL,
  air_quality_url: AIR_QUALITY_URL,
  paced: true,
}

let sources: readonly OpenMeteoSource[] = [PUBLIC_SOURCE]

/**
 * Take the published list. One with no entry that answers anything keeps the
 * public hosts, because a chain must never be empty: an analysis with nowhere
 * to ask would fail before it tried.
 */
export function setOpenMeteoSources(list: readonly OpenMeteoSource[]): void {
  const usable = list.filter((s) => s.forecast_url || s.archive_url || s.air_quality_url)
  sources = usable.length > 0 ? usable : [PUBLIC_SOURCE]
}

/**
 * The `open_meteo_sources` a capabilities body publishes, keeping an entry
 * only when it has the published shape. Absent or unreadable, the list is
 * the public hosts alone, which is how every build before this one behaved.
 */
export function parseSources(body: unknown): readonly OpenMeteoSource[] {
  const raw = (body as { open_meteo_sources?: unknown } | null)?.open_meteo_sources
  if (!Array.isArray(raw)) return [PUBLIC_SOURCE]
  const url = (v: unknown): v is string | null => v === null || (typeof v === 'string' && v.startsWith('https://'))
  const kept = raw.filter(
    (s): s is OpenMeteoSource =>
      typeof s === 'object' &&
      s !== null &&
      (s.name === 'open-meteo' || s.name === 'mirror') &&
      url(s.forecast_url) &&
      url(s.archive_url) &&
      url(s.air_quality_url) &&
      typeof s.paced === 'boolean',
  )
  return kept.length > 0 ? kept : [PUBLIC_SOURCE]
}

function urlFor(source: OpenMeteoSource, endpoint: Endpoint): string | null {
  switch (endpoint) {
    case 'forecast':
      return source.forecast_url
    case 'archive':
      return source.archive_url
    case 'air_quality':
      return source.air_quality_url
  }
}

/** One source's URL for one endpoint: what a request is actually sent to. */
export interface Leg {
  source: OpenMeteoSource
  url: string
}

function hostOf(url: string): string {
  return new URL(url).host
}

/**
 * The sources that answer `endpoint`, in the order to ask them: the published
 * order, with any whose host's breaker is open moved to the back. Moved rather
 * than dropped, because a host that failed a minute ago may still be the only
 * one left that answers, and asking it last costs only the wait for it.
 */
export function chainFor(endpoint: Endpoint, nowMs: number = performance.now()): Leg[] {
  const legs: Leg[] = []
  for (const source of sources) {
    const url = urlFor(source, endpoint)
    if (url !== null) legs.push({ source, url })
  }
  const closed = legs.filter((l) => !breakerOpen(l.url, nowMs))
  const open = legs.filter((l) => breakerOpen(l.url, nowMs))
  return [...closed, ...open]
}

// ── A breaker per host ─────────────────────────────────────────────────────

// Two failures in a row open a host's breaker for a minute. Two because one is
// the cold outlier #545 measured, which the very next ask usually answers; a
// minute because the stuck host of 2026-11-13 stayed stuck for longer than
// that, and a minute is also how long the forecast host's own quota window
// lasts, so a quota refusal and a hang are skipped for the same span.
const BREAKER_FAILURES = 2
export const BREAKER_OPEN_MS = 60_000

let failures = new Map<string, number>()
let openUntil = new Map<string, number>()

function breakerOpen(url: string, nowMs: number): boolean {
  return (openUntil.get(hostOf(url)) ?? -Infinity) > nowMs
}

/** A request to this host failed in a way another source could answer. */
export function recordFailure(url: string, nowMs: number = performance.now()): void {
  const host = hostOf(url)
  const count = (failures.get(host) ?? 0) + 1
  failures.set(host, count)
  if (count >= BREAKER_FAILURES) openUntil.set(host, nowMs + BREAKER_OPEN_MS)
}

/** A request to this host answered, which closes its breaker at once. */
export function recordSuccess(url: string): void {
  const host = hostOf(url)
  failures.delete(host)
  openUntil.delete(host)
}

// ── How long a host takes, for the hedge ───────────────────────────────────

// A request still unanswered after about the time a normal one takes is sent
// again, to the next source or to the same host when there is no other, and
// the first answer wins (Dean and Barroso, "The Tail at Scale"). Measured
// 2026-09-30 from a home network, a 50-location forecast batch answered in 1.5
// to 1.8 s, with cold outliers of 7.7 s and 19 s in six tries (#545): the
// outliers are what the second copy is for.
//
// The delay is the host's 95th percentile of recent answers, per location and
// scaled to this batch, because a 50-location batch takes longer than a one-
// location grid sample. Under five samples it is `HEDGE_DEFAULT_MS`, about
// three typical batches; it is never under the floor, which keeps a burst of
// fast answers from hedging every batch, nor over the cap, past which the
// copy would arrive too late to help.
export const HEDGE_DEFAULT_MS = 5_000
export const HEDGE_FLOOR_MS = 2_000
export const HEDGE_CAP_MS = 8_000
const LATENCY_SAMPLES = 20
const MIN_SAMPLES = 5

let latency = new Map<string, number[]>()

/** One answered request: how long it took, over how many locations. */
export function recordLatency(url: string, ms: number, locations: number): void {
  const host = hostOf(url)
  const samples = latency.get(host) ?? []
  samples.push(ms / Math.max(1, locations))
  if (samples.length > LATENCY_SAMPLES) samples.shift()
  latency.set(host, samples)
}

/** How long a request of `locations` to this host waits before its second copy. */
export function hedgeDelayMs(url: string, locations: number): number {
  const samples = latency.get(hostOf(url)) ?? []
  if (samples.length < MIN_SAMPLES) return HEDGE_DEFAULT_MS
  const sorted = [...samples].sort((a, b) => a - b)
  const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]
  return clamp(p95 * Math.max(1, locations), HEDGE_FLOOR_MS, HEDGE_CAP_MS)
}

// ── One run's budget ───────────────────────────────────────────────────────

/**
 * How long a run that has run out of sources may keep asking, from the first
 * time one does: half the minute record 0296 gave every batch. That minute was
 * per batch, so a run whose batches failed one after another could wait it
 * several times over; this is one window for the whole run, so an analysis
 * that cannot be answered ends inside the 30 s ceiling `docs/RELIABILITY.md`
 * sets, and one that can be answered after a short outage still is.
 */
export const OUTAGE_WINDOW_MS = 30_000
/**
 * The waits between asks inside that window, growing so a host coming back is
 * not met by every batch at once. They add up to the window.
 */
export const OUTAGE_WAITS_S = [5, 10, 15] as const
/**
 * How many second copies one run may send. A hedge costs a request, and on a
 * paced source a share of the visitor's quota, so it is for the slow tail and
 * not for a host that is slow at everything: four is about one batch in
 * fifteen on a full 1,500-destination run, which is the share of requests a
 * hedge is meant to cover.
 */
export const MAX_HEDGES_PER_RUN = 4

/**
 * What one run may spend on recovering: its outage window and its hedges.
 * Every fetch of a run takes the same one (the weather, the cloud column and
 * air quality), so three fetches cannot each wait out the window in turn. A
 * fetch called without one makes its own, which is right for the forecast grid
 * and the model comparison: each is a run of its own.
 */
export class RunBudget {
  private outageStartMs: number | null = null
  private hedges = MAX_HEDGES_PER_RUN
  /** Milliseconds left in the outage window, which the first call opens. */
  outageLeftMs(nowMs: number = performance.now()): number {
    if (this.outageStartMs === null) this.outageStartMs = nowMs
    return this.outageStartMs + OUTAGE_WINDOW_MS - nowMs
  }
  /** Whether the run has a hedge left to send. */
  hasHedge(): boolean {
    return this.hedges > 0
  }
  /** Spend one, once the copy is certain to go. */
  takeHedge(): void {
    this.hedges--
  }
}

// Test hook: sources, breakers and latency are module state that must not leak
// between unit tests.
export function resetSourceState(): void {
  sources = [PUBLIC_SOURCE]
  failures = new Map()
  openUntil = new Map()
  latency = new Map()
}
