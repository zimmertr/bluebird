import { useEffect, useMemo, useRef, useState } from 'react'
import { DestinationResult, SortBy } from '../types'
import { ChartMetric, chartKey, metricForSort } from '../utils/chartData'
import { colorForIndex } from '../utils/chartColors'

// Chart selection for the results table: which destinations are overlaid, their
// stable line colors (assigned on add, then fixed), and the active metric. The
// color is surfaced by the row's checkbox (accent) and the chart tooltip — no
// legend or picker. Selections persist until the user changes them — removals
// and re-analyses never uncheck a box (a key whose row leaves the report simply
// stops rendering, and returns if the row does).
export function useChartSelection(results: DestinationResult[], sortBy: SortBy) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [colorByKey, setColorByKey] = useState<Record<string, string>>({})
  const [metric, setMetric] = useState<ChartMetric>(() => metricForSort(sortBy))

  // The metric follows each new ranking; a same-ranking refresh leaves a
  // manually chosen metric alone (the dep is the value, not the report).
  useEffect(() => {
    setMetric(metricForSort(sortBy))
  }, [sortBy])

  // Default-shown chart: when a report arrives and none of the selected keys
  // exist in it (first analysis, or a new report that replaced every charted
  // row — stale selections must not block the default), chart its top rows.
  // Keyed on the report's identity only, with the selection read through a
  // ref — unchecking the last box must close the chart, not re-select.
  const selectedKeysRef = useRef<string[]>([])
  selectedKeysRef.current = selectedKeys
  useEffect(() => {
    const present = new Set(results.map(chartKey))
    if (selectedKeysRef.current.some((k) => present.has(k))) return
    const top = results.filter((r) => r.series).slice(0, 3)
    if (top.length > 0) setRange(top, true)
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
