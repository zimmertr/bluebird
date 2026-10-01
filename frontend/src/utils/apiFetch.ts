import type { DestinationsRequest } from '../types'

/**
 * The one way the browser asks Bluebird Forecast's own API a question.
 *
 * `fetch` rejects with a `TypeError` before a status is ever read when the pod
 * cannot be reached at all (DNS, offline, CORS), and the browser writes that
 * message itself: "Failed to fetch". Every call site used to carry its own
 * fetch stack and none of them translated that, so a pod nobody can reach
 * surfaced in the banner in Chrome's words rather than in ours, against the
 * rule in docs/STYLES.md that no raw exception message reaches the reader
 * (issue #381). Closing it at the primitive is what keeps the next caller from
 * reintroducing it; the linter's `one-api-door` check fails any file outside
 * this one and openMeteo.ts that reaches for `fetch` at all.
 *
 * Open-Meteo stays on its own stack in utils/openMeteo.ts. It is a different
 * service with a different error taxonomy (a quota, a model domain, a pacer),
 * and the one thing it shares with this file is the shape of the translation.
 */

/**
 * The message an unreachable API carries.
 *
 * No remedy: a network that is down cannot be helped by a suggestion, so the
 * copy states the condition and stops at the standing tail (docs/STYLES.md).
 * The product is "Bluebird Forecast" and is never shortened (#312).
 */
export const API_UNREACHABLE_MESSAGE = 'Bluebird Forecast is offline. Try again later.'

/**
 * The pod could not be reached at all, so no status was ever returned.
 *
 * Named, rather than a bare `Error`, so a caller can tell it from the errors it
 * raises itself about an answer it did get.
 */
export class ApiUnreachable extends Error {
  constructor(message: string = API_UNREACHABLE_MESSAGE) {
    super(message)
    this.name = 'ApiUnreachable'
  }
}

/**
 * An abort is the user's own doing, so it passes through untranslated.
 *
 * Read off the name rather than through `instanceof DOMException`: a rejected
 * fetch is a DOMException in every browser, but the polyfilled and test
 * environments this code also runs in are not bound to that.
 */
function isAbort(e: unknown): boolean {
  return (e as { name?: string } | null)?.name === 'AbortError'
}

/**
 * How long the pod has to start answering before the request is given up as
 * unreachable (#580). Past Cloudflare's 100 s on purpose: in production the
 * edge answers a pod that is merely slow with its own 524 first, which is a
 * status the caller reads like any other, so this ends only a request that
 * gets no answer at all, such as a connection that dropped without closing or
 * a deployment with no edge in front. The slowest answer the pod gives on
 * purpose stays under it: discovery waits at most on two Overpass mirrors at
 * 25 s each and the 8 s elevation lookup, and a cold overlay on the 60 s
 * refresh deadline in `snapshot.py`.
 */
export const API_DEADLINE_MS = 110_000

/**
 * `fetch`, with an unreachable API translated and everything else untouched.
 *
 * Returns the `Response` whatever its status: a status is an answer, and what
 * a 404 or a 429 means differs per endpoint (a rate-limit flag on the overlays,
 * a refusal body on analyze, a fallback on capabilities), so the caller keeps
 * that judgement.
 *
 * The deadline covers the wait for the response to start, not the body read
 * after it: a body that fails part way would reject in the caller's own parse
 * with the browser's wording, and every answer here is small. It is a timer on
 * a controller of its own rather than `AbortSignal.timeout` composed with the
 * caller's signal, because that composition cannot be undone once the
 * response has started.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const caller = init?.signal ?? null
  const forward = () => controller.abort(caller?.reason)
  if (caller?.aborted) forward()
  else caller?.addEventListener('abort', forward, { once: true })
  const deadline = setTimeout(
    () => controller.abort(new DOMException('No answer from the API.', 'TimeoutError')),
    API_DEADLINE_MS,
  )
  try {
    return await fetch(path, { ...init, signal: controller.signal })
  } catch (e) {
    // The caller's own cancel, whatever the error says, passes through.
    if (caller?.aborted || isAbort(e)) throw e
    throw new ApiUnreachable()
  } finally {
    clearTimeout(deadline)
  }
}

/**
 * The `Retry-After` an answer carries, in seconds, or null.
 *
 * The overlays read it off a 503 or a 429 so a retry waits as long as the pod
 * asked (#580). Only the delta-seconds form: the pod and its rate limiter send
 * nothing else.
 */
export function retryAfterSeconds(res: Response): number | null {
  const value = res.headers.get('Retry-After')
  if (value === null || !/^\d+$/.test(value.trim())) return null
  return Number(value.trim())
}

/**
 * `apiFetch` for a caller with nothing to say about a status: any answer that
 * is not `ok` throws, and the body comes back parsed.
 *
 * The HTTP message is deliberately bare rather than a sentence, because no
 * caller of this shows it: both swallow their failure and fall back. A caller
 * that has to *read* a status uses `apiFetch` and keeps its own handling.
 */
export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as T
}

/**
 * `POST /api/destinations`, the SPA's one per-analysis server call.
 *
 * Shared because two modules make it and neither can own it: the polygon
 * discovery runs in utils/analysisPipeline.ts and the custom-list resolution in
 * utils/clientAnalyze.ts. The two read the answer differently (one parses a
 * refusal body, the other returns the rows it already holds), so only the
 * request is shared.
 */
export function postDestinations(
  body: DestinationsRequest,
  signal?: AbortSignal,
): Promise<Response> {
  return apiFetch('/api/destinations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
}
