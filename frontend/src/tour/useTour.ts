import { useCallback, useEffect, useMemo, useState } from 'react'
import { anchorSelector, stepLayout, TOUR_STEPS, type TourStep } from '../utils/tourSteps'
import { demoReport, type DemoReport } from './demoReport'

interface Args {
  isDesktop: boolean
  setSidebarOpen: (open: boolean) => void
}

/**
 * The tutorial's state (#536): which step is open, over which steps. The list
 * is fixed when the tour starts, from the steps whose control is on the
 * screen plus the ones that bring their own (`reveal`), so the count a card
 * shows holds for the whole run. Ending changes nothing in the app: no URL,
 * no storage, no analysis. What a step may move is the phone's drawer, the
 * Layers menu, and, for the last step, the results sheet over a
 * demonstration report; each is undone the moment the step is left.
 */
export function useTour({ isDesktop, setSidebarOpen }: Args) {
  const [steps, setSteps] = useState<readonly TourStep[]>(TOUR_STEPS)
  const [index, setIndex] = useState<number | null>(null)

  const start = useCallback(() => {
    const present = TOUR_STEPS.filter(
      (s) => s.reveal !== undefined || document.querySelector(anchorSelector(s.anchor)) !== null,
    )
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

  const step = index === null ? null : steps[index]

  useEffect(() => {
    if (step === null) return
    const { drawerOpen } = stepLayout(step, isDesktop)
    if (drawerOpen !== null) setSidebarOpen(drawerOpen)
  }, [step, isDesktop, setSidebarOpen])

  // One report per run, built when the results step opens and dropped with it.
  const showingResults = step?.reveal === 'results'
  const demo: DemoReport | null = useMemo(() => (showingResults ? demoReport() : null), [showingResults])

  return {
    steps,
    index,
    start,
    end,
    next,
    prev,
    /** The Layers menu is held open for its step. */
    layersOpen: step?.reveal === 'layers',
    /** The results sheet shows this instead of the real report for its step. */
    demo,
  }
}
