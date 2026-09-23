import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import type { DestinationResult } from '../types'
import { chartKey, rowsBetween } from '../utils/chartData'

/** What a row's chart checkbox needs from the table. */
export interface ChartBox {
  // Records whether Shift was held, on the click that precedes the change.
  onShift: (shift: boolean) => void
  onToggle: (row: DestinationResult) => void
}

export interface ChartInputs {
  // In display order: a shift range is the run the reader sees between two boxes.
  results: DestinationResult[]
  isCharted?: (row: DestinationResult) => boolean
  onChartRange?: (rows: DestinationResult[], selected: boolean) => void
  onToggleChart?: (row: DestinationResult) => void
}

// The chart checkbox's two handlers, with an identity that never changes. They
// read the latest rows and callbacks through a ref, because every row is
// memoized on them: handlers keyed on the selection would redraw every row
// for a click that changes one row's box.
//
// A ref read is only as fresh as the last commit, which is enough here: the
// handlers run on a click, and a click lands after the render it clicked on
// has committed.
export function useChartBox(inputs: ChartInputs): ChartBox {
  const latest = useRef(inputs)
  // No dependency list on purpose: the ref must follow every render, and a
  // list that missed one input would leave a handler reading a stale one.
  useLayoutEffect(() => {
    latest.current = inputs
  })
  // Shift-click range select: the checkbox last interacted with is the anchor;
  // a shift-held click extends (de)selection to every chartable row between.
  const shiftHeldRef = useRef(false)
  const anchorRef = useRef<string | null>(null)
  const onShift = useCallback((shift: boolean) => {
    shiftHeldRef.current = shift
  }, [])
  const onToggle = useCallback((row: DestinationResult) => {
    const { results, isCharted, onChartRange, onToggleChart } = latest.current
    // Read once and cleared, so a later click with no onShift before it is
    // never taken for a shift-click.
    const shift = shiftHeldRef.current
    shiftHeldRef.current = false
    const anchor = anchorRef.current
    anchorRef.current = chartKey(row)

    if (shift && anchor && onChartRange) {
      // Apply the state this click produces (select or clear) to the whole run,
      // in the current display order: what the user sees between the two boxes.
      const range = rowsBetween(results, anchor, chartKey(row)).filter((r) => r.series)
      if (range.length > 0) {
        onChartRange(range, !(isCharted?.(row) ?? false))
        return
      }
    }
    onToggleChart?.(row)
  }, [])
  return useMemo(() => ({ onShift, onToggle }), [onShift, onToggle])
}
