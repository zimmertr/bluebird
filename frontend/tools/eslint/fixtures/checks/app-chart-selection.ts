// Must trip: an effect keyed on the rows, a second effect where the hook keeps one,
// a scan for the selected rows, and no candidate key.
import { useEffect } from 'react'
export function useSelection(results: { key: string }[], selectedKeys: string[]) {
  useEffect(() => {}, [results])
  useEffect(() => {}, [selectedKeys])
  return selectedKeys.map((k) => results.find((r) => r.key === k))
}
