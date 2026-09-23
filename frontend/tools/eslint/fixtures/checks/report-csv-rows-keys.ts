// Must trip: an effect keyed on the per-keystroke rows.
import { useEffect } from 'react'
declare const csvRows: string[]
export function useReport() {
  useEffect(() => {}, [csvRows])
}
