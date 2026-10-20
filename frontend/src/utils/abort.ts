/**
 * Whether a caught error is a cancel: an abort is the user's own doing, so
 * every catch that passes one through, or says nothing about it, asks here.
 *
 * Read off the name rather than through `instanceof DOMException`. A rejected
 * fetch is a DOMException in every browser, but not in every realm this code
 * runs in: Vitest's jsdom project swaps the global DOMException for jsdom's
 * and keeps Node's AbortController and fetch, so a real abort there fails the
 * `instanceof` and a cancel would read as a failure. Null-safe, because a
 * promise can reject with nothing at all.
 *
 * A `TimeoutError` is not a cancel: a deadline is a failure the caller
 * reports, which is what `AbortSignal.timeout` rejects with.
 */
export function isAbort(e: unknown): boolean {
  return (e as { name?: unknown } | null)?.name === 'AbortError'
}
