import { useCallback, useEffect, useRef, useState } from 'react'
import type { SortBy } from '../types'
import {
  type ChartMetric,
  type ChartMetricPair,
  metricForSort,
  pairFor,
  pickPrimary,
  pickSecond,
} from '../utils/chart/chartData'

/**
 * The chart's two metric slots (#499): which metric the top panel draws, and
 * which the second panel under it draws, if any.
 *
 * Its own hook, called in `App.tsx` above the address bar's sync, because the
 * pair rides the share link (`chart=`) and `useUrlSync` runs before the
 * results view that draws the chart. The rules that move the pair are pure,
 * in `utils/chart/chartData.ts` (`pickPrimary`, `pickSecond`).
 *
 * `restored` is a link's pair, which the session opens on. The primary
 * follows each NEW ranking after that; the ranking the session opened on is
 * not new, so a link's primary is not clobbered by the mount.
 */
export function useChartPair(restored: ChartMetricPair | undefined, sortBy: SortBy) {
  const [pair, setPair] = useState<ChartMetricPair>(() => restored ?? pairFor(sortBy))

  // The primary follows each new ranking; a same-ranking refresh leaves a
  // manually chosen metric alone (the dep is the value, not the report). Held
  // in a ref rather than run on mount, so a restored primary survives it.
  const followedRef = useRef(sortBy)
  useEffect(() => {
    if (followedRef.current === sortBy) return
    followedRef.current = sortBy
    setPair((p) => pickPrimary(p, metricForSort(sortBy)))
  }, [sortBy])

  // Props of the memoized chart, so each keeps one identity (#337).
  const setPrimary = useCallback((m: ChartMetric) => setPair((p) => pickPrimary(p, m)), [])
  const setSecond = useCallback((m: ChartMetric | null) => setPair((p) => pickSecond(p, m)), [])

  return { pair, setPrimary, setSecond }
}

/** What `useChartPair` hands its callers. */
export type ChartPair = ReturnType<typeof useChartPair>
