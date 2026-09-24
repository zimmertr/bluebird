// Must trip: the order dropped on mount too, the widths reset on the ranking as
// well, the shape stored nowhere (two effects where the hook runs three), a
// fresh move handler, and the file built by hand.
import { useEffect } from 'react'
declare const sortBy: string
declare const pointSample: boolean
declare function setColumnOrder(v: null): void
declare function setWidths(v: object): void
declare function buildResultsCsv(): string
export function useView() {
  useEffect(() => setColumnOrder(null), [sortBy])
  useEffect(() => setWidths({}), [pointSample, sortBy])
  const handleColumnMove = (from: string, to: string) => [from, to]
  return { handleColumnMove, file: buildResultsCsv() }
}
