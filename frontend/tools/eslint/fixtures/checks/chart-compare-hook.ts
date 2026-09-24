// Must trip: the row colour keyed on the chart object, one effect keyed on
// the arrays rather than their joined values where the hook runs two.
import { useCallback, useEffect } from 'react'
declare const chart: { colorFor: (r: object) => string }
declare const chartedPairKeys: string[]
export function useLines() {
  const rowChartColor = useCallback((r: object) => chart.colorFor(r), [chart])
  useEffect(() => {}, [chartedPairKeys])
  return rowChartColor
}
