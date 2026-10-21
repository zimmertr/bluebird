import { useEffect, useSyncExternalStore } from 'react'

// Whether any phone bottom sheet is open (#696; record 0136), for the Analyze
// button, which hides under a modal sheet's dim and comes back when it closes:
// Material's rule for a floating button under a modal sheet. A count rather
// than a flag, because one sheet can mount in the same commit another
// unmounts, and a module store rather than a context, because the sheets open
// from three places (the chip row, the Layers chip and the results bar) that
// share no parent below the app.
let open = 0
const listeners = new Set<() => void>()
const changed = () => listeners.forEach((l) => l())

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Counts the calling sheet as open for as long as it is mounted and `hold`
 * is true. The Controls sheet holds nothing (record 0207): the button stays
 * where it stood under its dim, inert, so opening the sheet moves nothing.
 */
export function useHoldSheetOpen(hold = true): void {
  useEffect(() => {
    if (!hold) return
    open += 1
    changed()
    return () => {
      open -= 1
      changed()
    }
  }, [hold])
}

/** True while any bottom sheet is mounted. */
export function useSheetOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => open > 0,
    () => false,
  )
}
