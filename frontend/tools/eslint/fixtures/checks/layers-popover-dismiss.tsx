// Must trip: the listeners split over two effects keyed on more than the open
// flag, and neither a click away nor Escape closing the popover.
import { useEffect } from 'react'
export function useLayers(layersOpen: boolean, other: number) {
  useEffect(() => {
    document.addEventListener('click', () => {})
  }, [layersOpen, other])
  useEffect(() => {}, [other])
}
