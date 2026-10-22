import { useEffect, useSyncExternalStore } from 'react'
import type { UsStates } from '../utils/usStates'
import { loadUsStates, subscribeUsStates, usStatesNow } from '../utils/usStatesLoad'

/**
 * The state outlines a crag's link is narrowed by, fetched when `needed` and
 * not yet held. Null until they arrive, and the caller re-renders when they
 * do, so a link drawn before them gains its state then.
 */
export function useUsStates(needed: boolean): UsStates | null {
  const states = useSyncExternalStore(subscribeUsStates, usStatesNow)
  useEffect(() => {
    if (needed && states === null) void loadUsStates()
  }, [needed, states])
  return states
}
