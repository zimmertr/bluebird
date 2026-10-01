/**
 * When a pod overlay asks again after a failed fetch, with no toggle (#580).
 *
 * The smoke overlay fetched once per toggle, so one failed fetch left it empty
 * until the reader switched it off and on, and no overlay asked again when the
 * browser came back online unless the map also moved. This is the one rule for
 * both, shared by the smoke, fire and closure overlays so the three cannot
 * recover in three different ways.
 *
 * Two triggers, each one attempt:
 * - the window's `online` event, while a failure is outstanding, for all
 *   three: the network that failed the fetch is back;
 * - for an overlay with no other trigger (`timed`, the smoke one), the
 *   `Retry-After` the pod sent with its 503 or 429, which is the moment the
 *   pod said an answer could change. A failure that named no wait (the pod
 *   unreachable, an unreadable body) waits for `online` alone, because a timer
 *   there would guess.
 *
 * Neither ever asks before the pod's `Retry-After` has passed: an `online`
 * inside that wait schedules the one attempt for the end of it. And one
 * attempt is pending at most, so a flapping connection cannot queue a burst.
 * The fire and closure overlays need no timer, because a pan already asks
 * again and the pod's own backoff answers those cheaply.
 */

export interface OverlayRecovery {
  /** A fetch failed; `retryAfterS` is the pod's `Retry-After`, or null. */
  failed(retryAfterS: number | null): void
  /** A fetch landed: nothing is outstanding. */
  succeeded(): void
  /** The overlay is off or gone: drop the timer and the listener. */
  stop(): void
}

export interface OverlayRecoveryOptions {
  /** Ask again when the pod's `Retry-After` runs out, not only on `online`. */
  timed?: boolean
  /** Where `online` is heard. The window in a browser; none under node. */
  online?: EventTarget | null
  now?: () => number
}

function windowTarget(): EventTarget | null {
  return typeof window === 'undefined' ? null : window
}

export function overlayRecovery(
  retry: () => void,
  { timed = false, online = windowTarget(), now = Date.now }: OverlayRecoveryOptions = {},
): OverlayRecovery {
  let failing = false
  // The earliest instant the pod said a new attempt could help.
  let notBefore = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let listening = false

  function clearTimer() {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
  }
  function arm(delayMs: number) {
    if (timer !== null) return
    timer = setTimeout(() => {
      timer = null
      retry()
    }, delayMs)
  }
  function onOnline() {
    if (failing) arm(Math.max(0, notBefore - now()))
  }
  function listen(on: boolean) {
    if (online === null || on === listening) return
    listening = on
    if (on) online.addEventListener('online', onOnline)
    else online.removeEventListener('online', onOnline)
  }

  return {
    failed(retryAfterS) {
      failing = true
      notBefore = now() + (retryAfterS ?? 0) * 1000
      listen(true)
      if (timed && retryAfterS !== null) arm(retryAfterS * 1000)
    },
    succeeded() {
      failing = false
      clearTimer()
      listen(false)
    },
    stop() {
      failing = false
      clearTimer()
      listen(false)
    },
  }
}

/** The `Retry-After` a failed overlay fetch carried, in seconds, or null. */
export function retryAfterOf(err: unknown): number | null {
  const value = (err as { retryAfterS?: unknown } | null)?.retryAfterS
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}
