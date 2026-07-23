import { useEffect, useMemo, useState } from 'react'
import { DestinationResult, SortBy } from '../types'
import { ChartMetric, chartKey, metricForSort } from '../utils/chartData'
import { colorForIndex } from '../utils/chartColors'

// Chart selection for the results table: which destinations are overlaid, their
// stable line colors (assigned on add, overridable via the legend picker), and
// the active metric. Reset on each analysis — a fresh report starts clean, the
// same way the table's column sort resets.
export function useChartSelection(
  results: DestinationResult[],
  pinned: DestinationResult[],
  sortBy: SortBy,
) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [colorByKey, setColorByKey] = useState<Record<string, string>>({})
  const [metric, setMetric] = useState<ChartMetric>(() => metricForSort(sortBy))

  useEffect(() => {
    setSelectedKeys([])
    setColorByKey({})
    setMetric(metricForSort(sortBy))
    // `results` identity changes per analysis; sortBy is that report's snapshot.
    // Intentionally not keyed on sortBy — panel knob changes must not disturb a
    // selection until the next Analyze.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results])

  function toggle(row: DestinationResult) {
    const key = chartKey(row)
    setSelectedKeys((keys) =>
      keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key],
    )
    // Assign a color the first time a destination is charted; monotonic in the
    // number already assigned, so a line on the chart never changes hue when
    // another is toggled. Overrides (setColor) simply replace the entry.
    setColorByKey((cbk) =>
      cbk[key] ? cbk : { ...cbk, [key]: colorForIndex(Object.keys(cbk).length) },
    )
  }

  function setColor(row: DestinationResult, hex: string) {
    setColorByKey((cbk) => ({ ...cbk, [chartKey(row)]: hex }))
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

  // Ranked and pinned rows are both chartable; search either pool by key.
  const selectedRows = useMemo(() => {
    const pool = [...results, ...pinned]
    return selectedKeys
      .map((k) => pool.find((r) => chartKey(r) === k))
      .filter((r): r is DestinationResult => r != null)
  }, [selectedKeys, results, pinned])

  function isSelected(row: DestinationResult): boolean {
    return selectedSet.has(chartKey(row))
  }

  function colorFor(row: DestinationResult): string {
    return colorByKey[chartKey(row)] ?? '#94a3b8'
  }

  function clear() {
    setSelectedKeys([])
  }

  return { selectedRows, isSelected, toggle, setRange, colorFor, setColor, clear, metric, setMetric }
}
