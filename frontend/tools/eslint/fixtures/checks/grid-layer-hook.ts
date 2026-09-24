// Must trip: gridAllowed asked twice and of the panel, none of the flags built
// on it, and an effect of the hook's own.
import { useEffect } from 'react'
export const a = gridAllowed(panel)
export const b = gridAllowed(window)
export function useLayer() {
  useEffect(() => {}, [])
}
