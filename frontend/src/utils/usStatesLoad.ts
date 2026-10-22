import { apiJson } from './apiFetch'
import outlinesUrl from './usStateOutlines.json?url'
import { decodeUsStates, type UsStateOutlines, type UsStates } from './usStates'

// The state outlines, fetched once, the first time a crag is about to show
// (a crag marker in view, a crag row in the table, a crag's card opening),
// and held for the session. 55 kB gzipped would take nearly all the room the
// cold load's script budget has left (`.github/lighthouserc.js`), and most
// visits never see a crag.
//
// A hashed asset fetched through `apiJson`, not a lazy `import()`: a stale tab's
// failed import fires `vite:preloadError`, which reloads the page
// (`staleChunk.ts`), and a link's better search is not worth a reload. A fetch
// that fails leaves the name-only search the link had before, and the next
// crag tries again.

let held: UsStates | null = null
let inFlight: Promise<UsStates | null> | null = null
const listeners = new Set<() => void>()

/** The outlines if they have arrived, else null. */
export function usStatesNow(): UsStates | null {
  return held
}

/** Fetch the outlines unless they are held or on their way. Never rejects. */
export function loadUsStates(): Promise<UsStates | null> {
  if (held) return Promise.resolve(held)
  inFlight ??= apiJson<UsStateOutlines>(outlinesUrl)
    .then((file) => {
      held = decodeUsStates(file)
      for (const listener of listeners) listener()
      return held
    })
    .catch((err: unknown) => {
      console.warn('State outlines failed to load', err)
      inFlight = null
      return null
    })
  return inFlight
}

export function subscribeUsStates(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
