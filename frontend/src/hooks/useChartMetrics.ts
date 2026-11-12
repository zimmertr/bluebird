import { useCallback, useEffect, useRef, useState } from 'react'
import type { SortBy } from '../types'
import {
  type ChartMetric,
  type ChartMetrics,
  addMetric,
  metricForSort,
  metricsFor,
  pickMetric,
  moveMetric, removeMetric,
} from '../utils/chart/chartData'
import type { ChartLayout } from '../utils/chart/chartLayout'
import { writeViewPrefs } from '../utils/viewPrefs'

/**
 * The chart's metric slots (#499): one to four families, each its own panel,
 * the first following the ranking, and the arrangement a desk picked.
 *
 * Its own hook, called in `App.tsx` above the address bar's sync, because the
 * slots ride the share link (`chart=`) and `useUrlSync` runs before the
 * results view that draws the chart. The rules that move the list are pure,
 * in `utils/chart/chartData.ts` (`pickMetric`, `addMetric`, `removeMetric`, `moveMetric`).
 *
 * `restored` is a link's list, which the session opens on. The first slot
 * follows each NEW ranking after that; the ranking the session opened on is
 * not new, so a link's first slot is not clobbered by the mount.
 *
 * `storedLayout` is the arrangement this browser kept. It is a habit of the
 * browser's and never a link's (#864): a phone always stacks the panels, and
 * column choice and order, the same kind of setting, already live there.
 */
export function useChartMetrics(restored: ChartMetrics | undefined, sortBy: SortBy, storedLayout: ChartLayout | null) {
  const [metrics, setMetrics] = useState<ChartMetrics>(() => restored ?? metricsFor(sortBy))
  // The arrangement the reader picked from the Panel layout menu, or null for
  // the panel count's own (#499). Kept while panels come and go, and drawn
  // whenever the count offers it (`layoutFor`).
  const [layout, setLayout] = useState<ChartLayout | null>(storedLayout)
  useEffect(() => {
    writeViewPrefs({ chartLayout: layout })
  }, [layout])

  // The first slot follows each new ranking; a same-ranking refresh leaves a
  // manually chosen metric alone (the dep is the value, not the report). Held
  // in a ref rather than run on mount, so a restored first slot survives it.
  const followedRef = useRef(sortBy)
  useEffect(() => {
    if (followedRef.current === sortBy) return
    followedRef.current = sortBy
    // A snapshot ranking leaves the first slot where it is: it has no hours.
    const metric = metricForSort(sortBy)
    if (metric !== null) setMetrics((m) => pickMetric(m, 0, metric))
  }, [sortBy])

  // Props of the memoized chart, so each keeps one identity (#337).
  const pick = useCallback((index: number, m: ChartMetric) => setMetrics((list) => pickMetric(list, index, m)), [])
  const add = useCallback(() => setMetrics(addMetric), [])
  const remove = useCallback((index: number) => setMetrics((list) => removeMetric(list, index)), [])
  const move = useCallback((from: number, to: number) => setMetrics((list) => moveMetric(list, from, to)), [])

  return { metrics, pick, add, remove, move, layout, setLayout }
}

/** What `useChartMetrics` hands its callers. */
export type ChartMetricsState = ReturnType<typeof useChartMetrics>
