import { type RefObject, useCallback, useEffect, useMemo, useState } from 'react'
import type { MapViewHandle } from '../components/MapView'
import { anchorSelector, stepLayout, TOUR_STEPS, type TourStep } from '../utils/tourSteps'
import { demoReport, type DemoReport } from './demoReport'

interface Args {
  isDesktop: boolean
  setSidebarOpen: (open: boolean) => void
  mapRef: RefObject<MapViewHandle | null>
}

/** The hour the chart's tooltip stands on while the report is a demonstration: the window's middle. */
const CHART_TOOLTIP_INDEX = 6

/**
 * The tutorial's state (#536): which step is open, over which steps. The list
 * is fixed when the tour starts, from the steps whose control is on the
 * screen plus the ones that bring their own (`reveal`), so the count a card
 * shows holds for the whole run. Ending changes nothing in the app: no URL,
 * no storage, no analysis. What a step may move is the phone's drawer, the
 * Layers menu, the results sheet over a demonstration report, and one
 * marker's popup; each is undone the moment the step is left.
 */
export function useTour({ isDesktop, setSidebarOpen, mapRef }: Args) {
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

  // One report per run, built when the results step opens and kept through
  // the marker step that follows it, since that step points at one of its
  // markers; dropped when either is left.
  const showingResults = step?.reveal === 'results' || step?.reveal === 'marker'
  const demo: DemoReport | null = useMemo(() => (showingResults ? demoReport() : null), [showingResults])

  // The marker step flies to the first demonstration row and opens its popup,
  // the same move a click on its rank in the table makes. The popup is taken
  // down when the step is left, whichever way it is left.
  const showingMarker = step?.reveal === 'marker'
  useEffect(() => {
    if (!showingMarker || demo === null) return
    const map = mapRef.current
    map?.focusResult(demo.universe[0])
    return () => map?.closePopups()
  }, [showingMarker, demo, mapRef])

  return {
    steps,
    index,
    start,
    end,
    next,
    prev,
    /** The Layers menu is held open for its step. */
    layersOpen: step?.reveal === 'layers',
    /** The results sheet shows this instead of the real report for its steps. */
    demo,
    /**
     * The sheet itself is up for the results step alone. The marker step keeps
     * the demonstration for its markers but takes the sheet down, because on a
     * phone the sheet stands where the popup opens and the popup's lower half
     * went under it (TJ, 2026-09-29).
     */
    sheetShown: step?.reveal === 'results',
    /** The chart's tooltip stands on this hour while the demonstration is up, or follows the mouse. */
    chartTooltipIndex: showingResults ? CHART_TOOLTIP_INDEX : null,
  }
}
