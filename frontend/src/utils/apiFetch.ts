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
 * `fetch`, with an unreachable API translated and everything else untouched.
 *
 * Returns the `Response` whatever its status: a status is an answer, and what
 * a 404 or a 429 means differs per endpoint (a rate-limit flag on the overlays,
 * a refusal body on analyze, a fallback on capabilities), so the caller keeps
 * that judgement.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(path, init)
  } catch (e) {
    if (isAbort(e)) throw e
    throw new ApiUnreachable()
  }
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
