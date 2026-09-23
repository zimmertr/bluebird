import { useCallback, useEffect, useMemo, useState } from 'react'
import { DEFAULT_FAMILY_KEY, type MetricFamily, familyOf } from '../metrics'
import type { SortBy } from '../types'
import { type Constraints, NO_CONSTRAINTS } from '../utils/clientAnalyze'
import type { PresentationKnobs } from '../utils/present'
import { DEFAULT_LIMIT, DEFAULT_SORT, type ShareableState, clampLimit } from '../utils/urlState'

/**
 * The presentation knobs: the ranking, its direction, each metric row's
 * aggregate, the forecast bounds and the results cap.
 *
 * Its own hook because these are the knobs that apply live (#188): nothing
 * here can gate a fetch, so nothing here reaches the analysis request's data
 * side, and `liveKnobs` is the one value `present.ts` re-derives the table
 * from.
 */
export function useRankingKnobs(restored: Partial<ShareableState> | null, maxLimit: number) {
  const [sortBy, setSortByRaw] = useState<SortBy>(() => restored?.sortBy ?? DEFAULT_SORT)
  const [sortDesc, setSortDesc] = useState(() => restored?.sortDesc ?? false)
  // What each metric row's aggregate dropdown holds (#291), the active row's
  // entry always equal to sortBy. One state for every row because a
  // dropdown choice IS a ranking choice — picking an aggregate activates its
  // row, the same one-click contract the direction toggle has always kept —
  // so the two could only ever disagree by a missed update.
  const [rowKeys, setRowKeys] = useState<Record<MetricFamily, SortBy>>(
    () => restored?.rowKeys ?? { ...DEFAULT_FAMILY_KEY },
  )
  const setSortBy = useCallback((key: SortBy) => {
    setSortByRaw(key)
    setRowKeys((rows) => (rows[familyOf(key)] === key ? rows : { ...rows, [familyOf(key)]: key }))
  }, [])
  // The forecast bounds (#115). None of them can gate a fetch — nothing knows
  // a destination's precipitation before it has
  // been fetched — so they are pure presentation and every one of them applies
  // live, loosening as well as tightening.
  const [constraints, setConstraints] = useState<Constraints>(
    () => restored?.constraints ?? NO_CONSTRAINTS,
  )
  // 200 rather than 100 because the pasted lists people bring are themselves
  // often 100 long (peakbagger exports, the examples/ CSVs). At 100 a list plus
  // anything else — one searched peak, a polygon — spills over the cut on its
  // first analysis, which is what made #205 visible.
  const [limit, setLimit] = useState(() => clampLimit(restored?.limit ?? DEFAULT_LIMIT, maxLimit))
  // The initializer above clamps against the compiled fallback, because at
  // first render that is all useCapabilities has. Re-clamp once the real
  // ceiling lands so a deployment that publishes a lower one is honored on a
  // restored link too. Only ever lowers, so it cannot fight the knob.
  useEffect(() => {
    setLimit((prev) => clampLimit(prev, maxLimit))
  }, [maxLimit])

  // Every knob the Metrics table's boxes hold, back to its default. The
  // results cap is one of them (#341): it bounds nothing, but it is typed into
  // the same column and the button that clears that column cannot skip one
  // box.
  const clearFilters = useCallback(() => {
    setConstraints(NO_CONSTRAINTS)
    setLimit(DEFAULT_LIMIT)
  }, [])

  // The knobs the displayed report is rendered under: markers, legend, results
  // header, and table column order all read from here.
  const liveKnobs: PresentationKnobs = useMemo(
    () => ({ sortBy, sortDesc, limit, constraints }),
    [sortBy, sortDesc, limit, constraints],
  )

  return {
    sortBy,
    setSortBy,
    sortDesc,
    setSortDesc,
    rowKeys,
    constraints,
    setConstraints,
    limit,
    setLimit,
    clearFilters,
    liveKnobs,
  }
}
