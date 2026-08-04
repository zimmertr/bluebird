import { useEffect, useMemo, useRef, useState } from 'react'
import { DestinationResult, SortBy } from '../types'
import { ChartMetric, chartKey, metricForSort } from '../utils/chartData'
import { colorForIndex } from '../utils/chartColors'

// Chart selection for the results table and the chart-only legend: which
// destinations are overlaid, their stable line colors, and the active metric.
//
// `results` is every destination on show, INCLUDING pending ones an analysis
// has not covered yet — a searched place earns its color the moment it appears
// (#242 review), and because a color is assigned once per coordinate key and
// never reassigned, the color it wears before the analysis is the color its
// line draws in after, no matter where the row ranks or what else joins the
// list. The first destination a session ever charts wears the palette's first
// color, bluebird sky. Selections persist until the user changes them —
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
  // Every destination the chart has NEVER seen — pending or analyzed — arrives
  // selected and colored, so the chart mirrors the table by default and a
  // searched place is charted from the moment it is searched. colorByKey is
  // the "ever charted" memory: a deliberately unchecked box has been charted,
  // stays in the map, and is therefore never re-checked by a later report.
  const selectedKeysRef = useRef<string[]>([])
  selectedKeysRef.current = selectedKeys
  const colorByKeyRef = useRef<Record<string, string>>({})
  colorByKeyRef.current = colorByKey
  useEffect(() => {
    const debut = results.filter((r) => !colorByKeyRef.current[chartKey(r)])
    if (debut.length > 0) setRange(debut, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results])

  function toggle(row: DestinationResult) {
    const key = chartKey(row)
    setSelectedKeys((keys) =>
      keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key],
    )
    // Assign a color the first time a destination is charted; monotonic in the
    // number already assigned, so a line on the chart never changes hue when
    // another is toggled.
    setColorByKey((cbk) =>
      cbk[key] ? cbk : { ...cbk, [key]: colorForIndex(Object.keys(cbk).length) },
    )
  }

  // Add or remove a run of rows in one shot (shift-click range select). New
  // additions get colors in list order, continuing the same monotonic sequence.
  function setRange(rows: DestinationResult[], selected: boolean) {
    const keys = rows.map(chartKey)
    if (selected) {
      setSelectedKeys((prev) => {
        const have = new Set(prev)
        return [...prev, ...keys.filter((k) => !have.has(k))]
      })
      setColorByKey((cbk) => {
        const next = { ...cbk }
        let n = Object.keys(next).length
        for (const k of keys) {
          if (!next[k]) {
            next[k] = colorForIndex(n)
            n++
          }
        }
        return next
      })
    } else {
      const remove = new Set(keys)
      setSelectedKeys((prev) => prev.filter((k) => !remove.has(k)))
    }
  }

  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys])

  // Selections are keyed by coordinate; a row that leaves the report (removed,
  // ranked out) simply drops off the chart.
  const selectedRows = useMemo(
    () =>
      selectedKeys
        .map((k) => results.find((r) => chartKey(r) === k))
        .filter((r): r is DestinationResult => r != null),
    [selectedKeys, results],
  )

  function isSelected(row: DestinationResult): boolean {
    return selectedSet.has(chartKey(row))
  }

  function colorFor(row: DestinationResult): string {
    return colorByKey[chartKey(row)] ?? '#94a3b8'
  }

  function clear() {
    setSelectedKeys([])
  }

  return { selectedRows, isSelected, toggle, setRange, colorFor, clear, metric, setMetric }
}
