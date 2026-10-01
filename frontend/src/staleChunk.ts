// A tab opened before a release still asks for the old build's hashed chunk
// names, and the new image serves only the new ones, so the first lazy surface
// it reaches (the chart, the tour, the tour's demonstration report) answers
// 404. React keeps a rejected lazy payload and throws it on every render, so
// the root boundary's Try again cannot recover; only a page load can, and the
// URL already carries the inputs a load needs. Vite routes every failed
// dynamic import and preload through one `vite:preloadError` event on window,
// which is where this listens.
//
// The guard is the build that reloaded, not a flag: a reload is taken only
// from a build that has not already taken one in this session. A stale tab
// reloads once into the new build; a build whose own chunk is missing reloads
// at most once more and then shows the error screen, since the reloaded page
// is the same build and finds its own name in the guard; and a later release
// can reload the same tab again, because its build is a new name. Nothing has
// to clear the guard, which is the one thing a page cannot tell it should do
// (no event says a lazy chunk loaded).
export const CHUNK_RELOAD_KEY = 'bluebird_forecast_chunk_reload'

export interface StaleChunkDeps {
  target: Pick<EventTarget, 'addEventListener'>
  // A getter, because reading `window.sessionStorage` itself throws where site
  // data is blocked.
  storage: () => Pick<Storage, 'getItem' | 'setItem'>
  reload: () => void
  // Anything that changes with every build. The entry chunk's own URL does:
  // its hash covers the hashed names of every chunk it imports.
  build: string
}

export function reloadOnStaleChunk({ target, storage, reload, build }: StaleChunkDeps): void {
  target.addEventListener('vite:preloadError', () => {
    try {
      const store = storage()
      if (store.getItem(CHUNK_RELOAD_KEY) === build) return
      store.setItem(CHUNK_RELOAD_KEY, build)
    } catch {
      // No storage means no guard, and an unguarded reload can loop, which is
      // worse than the error screen the failure falls through to.
      return
    }
    // The event is not cancelled, so the failure still reaches the boundary
    // for the moment before the reload lands, and reaches it for good when
    // the guard declines.
    reload()
  })
}
