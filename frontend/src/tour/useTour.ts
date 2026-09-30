import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MapCamera, MapViewHandle } from '../components/MapView'
import { anchorSelector, stepLayout, TOUR_STEPS, type TourStep } from '../utils/tourSteps'
import { demoReport, type DemoReport } from './demoReport'

interface Args {
  isDesktop: boolean
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  mapRef: RefObject<MapViewHandle | null>
}

/** The hour the chart's tooltip stands on while the report is a demonstration: the window's middle. */
const CHART_TOOLTIP_INDEX = 6
/** How far above the map's centre the marker step puts its marker, so the popup hangs whole below it. */
const MARKER_LIFT = 0.25
/** How long the marker step waits for the sheet to settle before it frames the map. */
const MARKER_SETTLE_MS = 350

/**
 * The tutorial's state (#536): which step is open, over which steps. The list
 * is fixed when the tour starts, from the steps whose control is on the
 * screen plus the ones that bring their own (`reveal`), so the count a card
 * shows holds for the whole run. Ending changes nothing in the app: no URL,
 * no storage, no analysis. What a step may move is the phone's drawer, the
 * Layers menu, the results sheet over a demonstration report, the map's
 * camera and one marker's popup; the popup and the menu are undone when
 * their step is left, and the camera and the drawer are put back where the
 * tour found them when it ends, by any route.
 */
export function useTour({ isDesktop, sidebarOpen, setSidebarOpen, mapRef }: Args) {
  const [steps, setSteps] = useState<readonly TourStep[]>(TOUR_STEPS)
  const [index, setIndex] = useState<number | null>(null)
  // What the reader had before the tour touched anything.
  const before = useRef<{ camera: MapCamera | null; sidebarOpen: boolean } | null>(null)

  const start = useCallback(() => {
    const present = TOUR_STEPS.filter(
      (s) => s.reveal !== undefined || document.querySelector(anchorSelector(s.anchor)) !== null,
    )
    if (present.length === 0) return
    before.current = { camera: mapRef.current?.getCamera() ?? null, sidebarOpen }
    setSteps(present)
    setIndex(0)
  }, [mapRef, sidebarOpen])
  const end = useCallback(() => {
    setIndex(null)
    const saved = before.current
    before.current = null
    if (!saved) return
    setSidebarOpen(saved.sidebarOpen)
    if (saved.camera) mapRef.current?.setCamera(saved.camera)
  }, [mapRef, setSidebarOpen])
  const next = useCallback(() => {
    if (index === null) return
    if (index + 1 < steps.length) setIndex(index + 1)
    else end()
  }, [index, steps.length, end])
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
  // the same move a click on its rank in the table makes, once the sheet has
  // settled (on a phone it collapses first, and the framing reads its height).
  // The popup is taken down when the step is left, whichever way it is left.
  const showingMarker = step?.reveal === 'marker'
  useEffect(() => {
    if (!showingMarker || demo === null) return
    const map = mapRef.current
    const timer = window.setTimeout(() => map?.focusResult(demo.universe[0], MARKER_LIFT), MARKER_SETTLE_MS)
    return () => {
      window.clearTimeout(timer)
      map?.closePopups()
    }
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
     * On a phone the marker step collapses the sheet to its bar: the open
     * sheet stands where the popup needs to be, and the table is a swipe away.
     * On desktop the sheet is docked under the map and stays as it is.
     */
    sheetCollapsed: showingMarker && !isDesktop ? true : null,
    /** The chart's tooltip stands on this hour while the demonstration is up, or follows the mouse. */
    chartTooltipIndex: showingResults ? CHART_TOOLTIP_INDEX : null,
  }
}
