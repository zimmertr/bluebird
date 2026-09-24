// Must trip: an effect, the chart not told what the layout shows, the table without pointSample, and bare callbacks.
import { useEffect } from 'react'
export function useResultsView(open: boolean) {
  useEffect(() => {}, [open])
  const charts = useChartCompare({ chartShowing: open })
  const tableView = useTableView({ pointSample: open })
  const onFocusResult = () => open
  return { charts, tableView, onFocusResult }
}
