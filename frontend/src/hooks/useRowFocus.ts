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
 * What opens a card on the map from a phone: a results row's name, or a
 * press on its ground (#696; record 0143), and a tap on the map that opens a
 * card (TJ, 2026-11-04). On a phone the sheet first drops to its bar, so the
 * card has the map to stand on, and the card opens in the commit after, once
 * the sheet's resting lift (the camera's bottom pad) is the bar's; framed in
 * the same commit, the card was placed for a sheet that was about to go. A
 * hook of its own because it holds that one effect, and `useResultsView`
 * runs none.
 */
export function useRowFocus({ isDesktop, resultsCollapsed, collapse, mapRef }: RowFocusInputs) {
  const waiting = useRef<(() => void) | null>(null)
  // Keyed on what the press does, so a desk's chevron leaves the callbacks,
  // and every table row they reach, as they were: the table stays drawn
  // while its pane shuts (record 0202), and a new callback there drew 946
  // rows again in the chevron's press.
  const lowerFirst = !isDesktop && !resultsCollapsed
  // Lowers a phone's sheet and does `then` once it is down; does it at once
  // where there is no sheet up to lower.
  const lowerSheetFirst = useCallback(
    (then: () => void) => {
      if (lowerFirst) {
        waiting.current = then
        collapse()
        return
      }
      then()
    },
    [lowerFirst, collapse],
  )
  const onFocusResult = useCallback(
    (row: DestinationResult) => lowerSheetFirst(() => mapRef.current?.focusResult(row)),
    [lowerSheetFirst, mapRef],
  )
  const onFocusPending = useCallback(
    (at: { latitude: number; longitude: number }) => lowerSheetFirst(() => mapRef.current?.focusPoint(at)),
    [lowerSheetFirst, mapRef],
  )
  useEffect(() => {
    const then = waiting.current
    if (then === null || !resultsCollapsed) return
    waiting.current = null
    then()
  }, [resultsCollapsed])
  return { onFocusResult, onFocusPending, lowerSheetFirst }
}
