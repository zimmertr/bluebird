import { useEffect, useMemo, useState } from 'react'
import { DestinationResult, SortBy } from '../types'
import { ChartMetric, chartKey, metricForSort } from '../utils/chartData'
import { colorForIndex } from '../utils/chartColors'

// Chart selection for the results table: which destinations are overlaid, their
// stable line colors (assigned on add, overridable via the legend picker), and
// the active metric. Reset on each analysis — a fresh report starts clean, the
// same way the table's column sort resets.
export function useChartSelection(results: DestinationResult[], sortBy: SortBy) {
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

  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys])

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

  return { selectedRows, isSelected, toggle, colorFor, setColor, clear, metric, setMetric }
}
