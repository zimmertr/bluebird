// Must trip: an effect keyed on the per-keystroke rows, the fact derived from
// the rows alone, and two effects where the pins take one.
import { useEffect } from 'react'
declare const csvRows: string[]
export const destinationNamed = csvRows.length > 0
export function useInputs() {
  useEffect(() => {}, [csvRows])
  useEffect(() => {}, [csvRows])
}
