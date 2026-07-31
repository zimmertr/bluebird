// Determine whether the encoded state requires a URL sync.
// Compares the full resulting URL after replaceState would be called,
// avoiding redundant writes when the URL has not changed.
export function urlNeedsSync(
  encodedQueryString: string,
  currentPathname: string,
  currentSearch: string,
): boolean {
  // Construct the full URL that would result from the replaceState call.
  // replaceState(null, '', urlArg) with urlArg="?foo=bar" results in
  // currentPathname + "?foo=bar", and with urlArg=pathname results in just
  // the pathname (query string cleared).
  const newUrl = encodedQueryString
    ? `${currentPathname}?${encodedQueryString}`
    : currentPathname
  const currentUrl = currentPathname + currentSearch
  return newUrl !== currentUrl
}

export interface UrlWriter {
  /** Queue `url`, to be written once the caller stops changing its mind. */
  (url: string): void
  /** Write the queued URL now. For unmount, where waiting is not an option. */
  flush(): void
  /** Drop the queued URL unwritten, for a change that lands back on what the
   *  address bar already says. */
  cancel(): void
}

/**
 * Trailing debounce over a single URL write.
 *
 * Deliberately not a React effect. The obvious shape, scheduling in an effect
 * and flushing in that effect's cleanup, silently defeats itself: React runs
 * cleanup on every dependency change, not only on unmount, so each keystroke
 * flushes the one before it and the burst is never collapsed. Holding the
 * timer in a closure that outlives individual effect runs is what makes the
 * debounce real, and it makes the behavior testable without a DOM.
 */
export function debounceUrlWrite(write: (url: string) => void, delayMs = 400): UrlWriter {
  let timer: ReturnType<typeof setTimeout> | null = null
  let queued: string | null = null

  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const schedule = ((url: string) => {
    // Last write wins: an edit mid-burst replaces the queued URL rather than
    // earning a second write.
    queued = url
    clear()
    timer = setTimeout(() => {
      timer = null
      const pending = queued
      queued = null
      if (pending !== null) write(pending)
    }, delayMs)
  }) as UrlWriter

  schedule.flush = () => {
    clear()
    const pending = queued
    queued = null
    if (pending !== null) write(pending)
  }

  schedule.cancel = () => {
    clear()
    queued = null
  }

  return schedule
}
