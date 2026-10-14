// Must trip: the listeners split over two effects keyed on more than the open
// flag, and neither a click away nor Escape closing the popover.
import { useEffect } from 'react'
export function useLayers(popoverOpen: boolean, other: number) {
  useEffect(() => {
    document.addEventListener('click', () => {})
  }, [popoverOpen, other])
  useEffect(() => {}, [other])
}
