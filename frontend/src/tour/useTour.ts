import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import type { MapCamera, MapViewHandle } from '../components/MapView'
import { anchorSelector, stepLayout, TOUR_STEPS, TUTORIAL_PATH, type TourStep } from '../utils/tourSteps'
import type { DemoReport } from './demoReport'
import { cardMode } from './place'

interface Args {
  isDesktop: boolean
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  mapRef: RefObject<MapViewHandle | null>
}

/** The hour the chart's tooltip stands on while the report is a demonstration: the window's middle. */
const CHART_TOOLTIP_INDEX = 6
/** The nearest ancestor that scrolls: the panel's column, for the sections inside it. */
export function scrollParent(el: HTMLElement | null): HTMLElement | null {
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
 * shows holds for the whole run. Ending changes nothing in the app: no
 * storage, no analysis, and the URL's path, `/tutorial` while the tour runs
 * so the address bar can be copied as a link that opens it, goes back to `/`
 * with the query it had. Starting from inside the app pushes that path as a
 * history entry, so the browser's Back leaves the tour the way it leaves a
 * page; a page opened at the path has no entry to go back to and its path is
 * replaced instead. What a step may move is the phone's drawer, the
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
  // Whether this run pushed `/tutorial` onto the history, and so owes a
  // `back()` rather than a rewrite when it ends.
  const pushed = useRef(false)
  // Where the keyboard was when the tour began: the Tutorial link, usually.
  // The card takes the focus for the length of the tour, and when it unmounts
  // the focus would fall to the body, so the reader is put back here (#576).
  const returnFocus = useRef<HTMLElement | null>(null)

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
    const active = document.activeElement
    returnFocus.current = active instanceof HTMLElement && active !== document.body ? active : null
    setSteps(present)
    setIndex(0)
    if (window.location.pathname !== TUTORIAL_PATH) {
      window.history.pushState(null, '', TUTORIAL_PATH + window.location.search)
      pushed.current = true
    }
  }, [mapRef, sidebarOpen])
  const end = useCallback(() => {
    setIndex(null)
    const saved = before.current
    before.current = null
    if (pushed.current) {
      pushed.current = false
      window.history.back()
    } else if (window.location.pathname === TUTORIAL_PATH) {
      window.history.replaceState(null, '', '/' + window.location.search)
    }
    if (!saved) return
    setSidebarOpen(saved.sidebarOpen)
    if (saved.camera) mapRef.current?.setCamera(saved.camera)
    if (saved.scroller) saved.scroller.scrollTop = saved.scrollTop
  }, [mapRef, setSidebarOpen])
  // Back during the tour lands on the entry under the pushed one, whose path
  // is not the tour's, and ends it; the `back()` `end` itself makes finds
  // nothing left to end.
  useEffect(() => {
    const onPop = () => {
      if (before.current === null || window.location.pathname === TUTORIAL_PATH) return
      pushed.current = false
      end()
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [end])
  const next = useCallback(() => {
    if (index === null) return
    if (index + 1 < steps.length) setIndex(index + 1)
    else end()
  }, [index, steps.length, end])
  // After the commit that ended the tour rather than inside `end`, because the
  // same commit puts the drawer back, and an element in a closed drawer is
  // inert and cannot take the focus until it opens. An element that left the
  // page meanwhile (the welcome card's button) is not put back.
  useEffect(() => {
    if (index !== null) return
    const el = returnFocus.current
    returnFocus.current = null
    if (el?.isConnected) el.focus()
  }, [index])

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
  // markers; dropped when either is left. The builder is a chunk of its own,
  // fetched here rather than imported, so the fixtures it is made from stay
  // out of the main bundle with the overlay (`App.tsx`).
  const showingResults = step?.reveal === 'results' || step?.reveal === 'marker'
  const [demo, setDemo] = useState<DemoReport | null>(null)
  useEffect(() => {
    if (!showingResults) {
      setDemo(null)
      return
    }
    let current = true
    void import('./demoReport').then(({ demoReport }) => {
      if (current) setDemo(demoReport())
    })
    return () => {
      current = false
    }
  }, [showingResults])

  // The marker step cuts to the first demonstration row and opens its popup,
  // the same framing a click on its rank in the table makes but with no
  // flight: a tour that flies reads as the app doing something, and the
  // reader waits on it. Two frames first, so a phone's sheet has collapsed
  // and reported its height before the framing reads it. The framing is
  // handed the one thing over the map it cannot know about: this card,
  // where it is a sheet along the screen's edge; the button column it finds
  // for itself. The popup is taken down when the step is left, whichever
  // way it is left.
  const showingMarker = step?.reveal === 'marker'
  useEffect(() => {
    if (!showingMarker || demo === null) return
    const map = mapRef.current
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const card = cardMode(window.innerWidth) === 'sheet' ? document.querySelector('[data-tour-card]') : null
        const avoid = card ? [card.getBoundingClientRect()] : []
        map?.focusResult(demo.universe[0], { instant: true, avoid })
      })
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
