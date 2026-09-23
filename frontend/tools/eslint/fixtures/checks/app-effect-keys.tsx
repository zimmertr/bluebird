// Must trip: an effect keyed on the per-keystroke rows, and none of the effects App.tsx runs.
import { useEffect } from 'react'
export function App({ csvRows }: { csvRows: string[] }) {
  useEffect(() => {}, [csvRows])
  return null
}
