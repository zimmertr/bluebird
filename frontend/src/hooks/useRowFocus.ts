import { useCallback, useEffect, useRef, type RefObject } from 'react'
import type { MapViewHandle } from '../components/MapView'
import type { DestinationResult } from '../types'

interface RowFocusInputs {
  isDesktop: boolean
  /** Whether the results are down to their bar (`useResultsLayout`). */
  resultsCollapsed: boolean
  /** Lowers them to it. */
  collapse: () => void
  mapRef: RefObject<MapViewHandle | null>
}

/**
 * What a results row's name, or a press on its ground (#696; record 0143),
 * does: opens the popup its marker gives, flown to like a marker click. On a
 * phone the sheet first drops to its bar, so the card has the map to stand on,
 * and the camera moves in the commit after, once the sheet's resting lift
 * (the camera's bottom pad) is the bar's; framed in the same commit, the card
 * was placed for a sheet that was about to go. A hook of its own because it
 * holds that one effect, and `useResultsView` runs none.
 */
export function useRowFocus({ isDesktop, resultsCollapsed, collapse, mapRef }: RowFocusInputs) {
  const waiting = useRef<DestinationResult | null>(null)
  // Keyed on what the press does, so a desk's chevron leaves the callback,
  // and every table row it reaches, as they were: the table stays drawn
  // while its pane shuts (record 0202), and a new callback there drew 946
  // rows again in the chevron's press.
  const lowerFirst = !isDesktop && !resultsCollapsed
  const onFocusResult = useCallback(
    (row: DestinationResult) => {
      if (lowerFirst) {
        waiting.current = row
        collapse()
        return
      }
      mapRef.current?.focusResult(row)
    },
    [lowerFirst, collapse, mapRef],
  )
  useEffect(() => {
    const row = waiting.current
    if (row === null || !resultsCollapsed) return
    waiting.current = null
    mapRef.current?.focusResult(row)
  }, [resultsCollapsed, mapRef])
  return onFocusResult
}
