// Must trip: a sync effect that flushes every run and keys on less than App
// carried, no unmount flush, and no writer handed back.
import { useEffect } from 'react'
declare const writeUrl: { flush: () => void }
declare const polygon: unknown
export function useSync() {
  useEffect(() => {
    writeUrl.flush()
  }, [polygon, writeUrl])
}
