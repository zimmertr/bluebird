import { useCallback, useEffect, useState } from 'react'
import { anchorSelector, stepLayout, TOUR_STEPS, type TourStep } from '../utils/tourSteps'

interface Args {
  isDesktop: boolean
  setSidebarOpen: (open: boolean) => void
}

/**
 * The tutorial's state (#536): which step is open, over which steps. The list
 * is fixed when the tour starts, from the steps whose control is on the
 * screen, so the count a card shows holds for the whole run. Ending changes
 * nothing in the app: no URL, no storage, no analysis. On a phone each step
 * opens or closes the drawer for its own control, and that is the one thing
 * the tour moves.
 */
export function useTour({ isDesktop, setSidebarOpen }: Args) {
  const [steps, setSteps] = useState<readonly TourStep[]>(TOUR_STEPS)
  const [index, setIndex] = useState<number | null>(null)

  const start = useCallback(() => {
    const present = TOUR_STEPS.filter((s) => document.querySelector(anchorSelector(s.anchor)) !== null)
    if (present.length === 0) return
    setSteps(present)
    setIndex(0)
  }, [])
  const end = useCallback(() => setIndex(null), [])
  const next = useCallback(() => {
    setIndex((i) => (i === null ? null : i + 1 < steps.length ? i + 1 : null))
  }, [steps.length])
  const prev = useCallback(() => {
    setIndex((i) => (i === null || i === 0 ? i : i - 1))
  }, [])

  useEffect(() => {
    if (index === null) return
    const { drawerOpen } = stepLayout(steps[index], isDesktop)
    if (drawerOpen !== null) setSidebarOpen(drawerOpen)
  }, [index, steps, isDesktop, setSidebarOpen])

  return { steps, index, start, end, next, prev }
}
