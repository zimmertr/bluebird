import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DestinationResult, SortBy } from '../types'
import {
  ChartMetric,
  candidateSetKey,
  chartKey,
  debutRows,
  metricForSort,
} from '../utils/chartData'
import { allocateColors } from '../utils/chartColors'

// Chart selection for the results table and the chart-only legend: which
// destinations are overlaid, their stable line colors, and the active metric.
//
// `results` is every destination on show, INCLUDING pending ones an analysis
// has not covered yet — a searched place earns its color the moment it appears
// (#242 review), and because a color is assigned once per coordinate key and
// never reassigned, the color it wears before the analysis is the color its
// line draws in after, no matter where the row ranks or what else joins the
// list. The first destination a session ever charts wears the palette's first
// color, bluebird forecast sky. Selections persist until the user changes them —
// removals and re-analyses never uncheck a box (a key whose row leaves the
// report simply stops rendering, and returns if the row does).
export function useChartSelection(results: DestinationResult[], sortBy: SortBy) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [colorByKey, setColorByKey] = useState<Record<string, string>>({})
  const [metric, setMetric] = useState<ChartMetric>(() => metricForSort(sortBy))

  // The metric follows each new ranking; a same-ranking refresh leaves a
  // manually chosen metric alone (the dep is the value, not the report).
  useEffect(() => {
    setMetric(metricForSort(sortBy))
  }, [sortBy])

  // Debut rule, applied whenever the displayed set changes (live state is read
  // through a ref so unchecking never re-selects). Keyed on the rows and not
  // on the report, deliberately: since #188 a live ranking change can swap
  // every row on screen without a new analysis, and new rows still debut then.
  //
  // The DEPENDENCY is the SET's identity, never the array holding it. The
  // caller's `chartCandidates` is rebuilt whenever the displayed rows or the
  // pending list are re-derived — once per keystroke in the coordinates box and
  // once per live knob change — so keying on the array ran this scan for a set
  // of destinations that had not changed at all (issue #185). `candidateSetKey`
  // is a value, so React compares it and the scan runs once per real change.
  // `src/App.test.ts` fails any effect here that takes the rows again.
  //
  // Every destination the chart has NEVER seen — pending or analyzed — arrives
  // selected and colored, so the chart mirrors the table by default and a
  // searched place is charted from the moment it is searched. colorByKey is
  // the "ever charted" memory: a deliberately unchecked box has been charted,
  // stays in the map, and is therefore never re-checked by a later report.
  const colorByKeyRef = useRef<Record<string, string>>({})
  colorByKeyRef.current = colorByKey
  const resultsRef = useRef<DestinationResult[]>(results)
  resultsRef.current = results
  const candidatesKey = useMemo(() => candidateSetKey(results), [results])
  useEffect(() => {
    const debut = debutRows(resultsRef.current, colorByKeyRef.current)
    if (debut.length > 0) setRange(debut, true)
    // Kept: `setRange` is the omission, and it is declared below this effect,
    // so naming it in the list would read it inside its own temporal dead zone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatesKey])

  // Every function below is a prop of a memoized component (ResultsTable and
  // TimeSeriesChart), so a fresh identity per render would defeat the memo and
  // re-render both on any state change at all (#337, finding 8).
  const toggle = useCallback((row: DestinationResult) => {
    const key = chartKey(row)
    setSelectedKeys((keys) =>
      keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key],
    )
    // Assign a color the first time a destination is charted, from the one
    // allocator the comparison's (destination, model) pairs also draw on, so a
    // line on the chart never changes hue when another is toggled and no pair
    // can be handed a colour a destination is already wearing.
    setColorByKey((cbk) => allocateColors(cbk, [key]))
  }, [])

  // Add or remove a run of rows in one shot (shift-click range select). New
  // additions get colors in list order, continuing the same monotonic sequence.
  const setRange = useCallback((rows: DestinationResult[], selected: boolean) => {
    const keys = rows.map(chartKey)
    if (selected) {
      setSelectedKeys((prev) => {
        const have = new Set(prev)
        return [...prev, ...keys.filter((k) => !have.has(k))]
      })
      setColorByKey((cbk) => allocateColors(cbk, keys))
    } else {
      const remove = new Set(keys)
      setSelectedKeys((prev) => prev.filter((k) => !remove.has(k)))
    }
  }, [])

  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys])

  // Selections are keyed by coordinate; a row that leaves the report (removed,
  // ranked out) simply drops off the chart.
  const selectedRows = useMemo(() => {
    // Index once, then look up. This ran as a `find` per selected key, which is
    // a scan of every row for every row: 895,000 `chartKey` calls for a
    // 946-destination report, measured at 44 ms, and 104 ms at the 1,500 cap
    // (#337). It runs on every keystroke in the coordinates box, because the
    // `results` this hook is given is rebuilt whenever the pending list is.
    const byKey = new Map<string, DestinationResult>()
    for (const r of results) byKey.set(chartKey(r), r)
    return selectedKeys
      .map((k) => byKey.get(k))
      .filter((r): r is DestinationResult => r != null)
  }, [selectedKeys, results])

  const isSelected = useCallback(
    (row: DestinationResult): boolean => selectedSet.has(chartKey(row)),
    [selectedSet],
  )

  const colorFor = useCallback(
    (row: DestinationResult): string => colorByKey[chartKey(row)] ?? '#94a3b8',
    [colorByKey],
  )

  /**
   * Keep the colours a comparison's (destination, model) pairs have been
   * given (#232).
   *
   * The chart works out which pairs it is drawing and allocates their colours
   * for the frame it draws them in; this is where that allocation is
   * REMEMBERED, in the same map and off the same counter the destinations use.
   * Without it a pair would be re-allocated from scratch every time the set
   * moved, and a line would change hue because another was hidden.
   */
  const rememberColors = useCallback((keys: readonly string[]) => {
    setColorByKey((cbk) => allocateColors(cbk, keys))
  }, [])

  const clear = useCallback(() => setSelectedKeys([]), [])

  return {
    selectedRows,
    isSelected,
    toggle,
    setRange,
    colorFor,
    colorByKey,
    rememberColors,
    clear,
    metric,
    setMetric,
  }
}
