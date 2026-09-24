// Must trip: a count with no "so far" tail, and one effect where the report
// takes three.
import { useEffect } from 'react'
declare const arriving: boolean
export const tail = arriving ? ' (partial)' : ''
export function useReport() {
  useEffect(() => {}, [])
}
