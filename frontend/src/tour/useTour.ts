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
/** The room a result popup needs below its marker: the popup with every default column, plus its tip and a margin. */
const POPUP_ROOM_PX = 400

/** The nearest ancestor that scrolls: the panel's column, for the sections inside it. */
function scrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node
  }
  return null
}

/**
 * The tutorial's state (#536): which step is open, over which steps. The list
 * is fixed when the tour starts, from the steps whose control is on the
 * screen plus the ones that bring their own (`reveal`), so the count a card
 * shows holds for the whole run. Ending changes nothing in the app: no URL,
 * no storage, no analysis. What a step may move is the phone's drawer, the
 * Layers menu, the results sheet over a demonstration report, the map's
 * camera and one marker's popup; the popup and the menu are undone when
 * their step is left, and the camera, the drawer and the panel's scroll
 * position are put back where the tour found them when it ends, by any route.
 */
export function useTour({ isDesktop, sidebarOpen, setSidebarOpen, mapRef }: Args) {
  const [steps, setSteps] = useState<readonly TourStep[]>(TOUR_STEPS)
  const [index, setIndex] = useState<number | null>(null)
  // What the reader had before the tour touched anything: the camera, the
  // drawer, and how far the panel was scrolled (each step scrolls its section
  // into view).
  const before = useRef<{
    camera: MapCamera | null
    sidebarOpen: boolean
    scroller: HTMLElement | null
    scrollTop: number
  } | null>(null)

  const start = useCallback(() => {
    const present = TOUR_STEPS.filter(
      (s) => s.reveal !== undefined || document.querySelector(anchorSelector(s.anchor)) !== null,
    )
    if (present.length === 0) return
    const scroller = scrollParent(document.querySelector<HTMLElement>(anchorSelector(TOUR_STEPS[0].anchor)))
    before.current = {
      camera: mapRef.current?.getCamera() ?? null,
      sidebarOpen,
      scroller,
      scrollTop: scroller?.scrollTop ?? 0,
    }
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
    if (saved.scroller) saved.scroller.scrollTop = saved.scrollTop
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

  // The marker step cuts to the first demonstration row and opens its popup,
  // the same framing a click on its rank in the table makes but with no
  // flight: a tour that flies reads as the app doing something, and the
  // reader waits on it. Two frames first, so a phone's sheet has collapsed
  // and reported its height before the framing reads it. The popup is taken
  // down when the step is left, whichever way it is left.
  const showingMarker = step?.reveal === 'marker'
  useEffect(() => {
    if (!showingMarker || demo === null) return
    const map = mapRef.current
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => map?.focusResult(demo.universe[0], { popupRoom: POPUP_ROOM_PX, instant: true }))
    })
    return () => {
      cancelAnimationFrame(frame)
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
