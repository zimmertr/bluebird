// Must trip: two effects, none keyed on settled alone, and the run before the flush.
import { useEffect } from 'react'
export function useRunOnOpen(settled: boolean, flushUrl: () => void, analyze: () => void) {
  useEffect(() => {}, [settled, flushUrl])
  useEffect(() => {}, [])
  function runAutoAnalyze() {
    analyze()
    flushUrl()
  }
  return runAutoAnalyze
}
