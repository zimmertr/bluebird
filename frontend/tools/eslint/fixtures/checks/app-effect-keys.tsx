// Must trip: an effect keyed on the per-keystroke rows, too few effects, and none keyed on the fact.
import { useEffect } from 'react'
export function App({ csvRows }: { csvRows: string[] }) {
  useEffect(() => {}, [csvRows])
  return null
}
