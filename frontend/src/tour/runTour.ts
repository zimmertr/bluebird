import { driver, type PopoverDOM } from 'driver.js'
import type { MapCamera, MapViewHandle } from '../components/MapView'
import { ICON, TOUR, TOUR_DIM, TOUR_STAGE_PAD_PX, TOUR_STAGE_RADIUS_PX } from '../styles'
import type { WindowLimits } from '../utils/forecastWindow'
import { buildScene, type DemoCapture, type TourScene } from '../utils/tourScene'
import { TOUR_COPY, TOUR_STEPS, stepLayout, tourSelector } from '../utils/tourSteps'
import demo from './demoScene.json'
import '../tour.css'

// One run of the tutorial (#536): Driver.js walks the steps in
// `utils/tourSteps.ts`, and this moves the screen under it. Everything here,
// Driver and the demo included, is one chunk that `useTour` imports when a
// reader starts the tutorial, so no one who never opens it downloads any of it.
//
// It never writes the reader's state. The demo analysis is handed to the host
// as a value the app READS in place of its own report, so ending the tutorial
// is dropping that value. What it does move is presentation, and it puts each
// piece back at the end: the drawer, whether the results show, the sheet's
// collapse, and the camera.

/** The screen state the tutorial moves, read fresh at every step. */
export interface TourUi {
  isDesktop: boolean
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  showResults: boolean
  setShowResults: (show: boolean) => void
  resultsCollapsed: boolean
  toggleCollapsed: () => void
}

/** What the app lends a run. */
export interface TourHost {
  ui: () => TourUi | null
  map: () => MapViewHandle | null
  showScene: (scene: TourScene | null) => void
  /** Called once, however the run ends. */
  ended: () => void
}

interface Saved {
  sidebarOpen: boolean
  showResults: boolean
  resultsCollapsed: boolean
  camera: MapCamera | null
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

// The phone drawer slides in over 300ms, and a target measured mid-slide lights
// the wrong place. Waits for the slide to end, with a ceiling in case the
// transition never runs (reduced motion, or a desktop where it is off).
function slideDone(): Promise<void> {
  const drawer = document.querySelector('[data-drawer]')
  if (!drawer) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, 400)
    drawer.addEventListener('transitionend', () => {
      window.clearTimeout(timer)
      resolve()
    }, { once: true })
  })
}

function addClasses(el: HTMLElement, classes: string) {
  el.classList.add(...classes.split(' ').filter(Boolean))
}

// Driver finds its own buttons by class name, so ours are added beside its
// rather than put in their place.
function dress(popover: PopoverDOM) {
  addClasses(popover.wrapper, TOUR.card)
  addClasses(popover.title, TOUR.title)
  addClasses(popover.description, TOUR.text)
  addClasses(popover.footer, TOUR.footer)
  addClasses(popover.progress, TOUR.progress)
  addClasses(popover.footerButtons, TOUR.buttons)
  addClasses(popover.previousButton, TOUR.previous)
  addClasses(popover.nextButton, TOUR.next)
  addClasses(popover.closeButton, TOUR.close)
  popover.closeButton.setAttribute('aria-label', TOUR_COPY.close)
  // `IconClose`'s drawn cross at its control size, for the reason its comment
  // gives: the typed glyph Driver puts here sits high in a round target. Markup
  // rather than the component, because Driver owns this element outside React.
  popover.closeButton.innerHTML =
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="${ICON.control}" aria-hidden="true">` +
    '<line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>'
}

export function runTour(host: TourHost, windowLimits: WindowLimits): void {
  const ui = host.ui()
  if (!ui) {
    host.ended()
    return
  }
  const scene = buildScene(demo as unknown as DemoCapture, Date.now(), windowLimits)
  const saved: Saved = {
    sidebarOpen: ui.sidebarOpen,
    showResults: ui.showResults,
    resultsCollapsed: ui.resultsCollapsed,
    camera: host.map()?.getCamera() ?? null,
  }
  let running = true
  let sceneOn = false

  // Stand the screen the way step `index` needs it, then light the step. A
  // step whose target is still missing is passed over in the direction of
  // travel, and running off the end ends the tutorial.
  async function go(index: number, dir: 1 | -1) {
    for (let i = index; i >= 0 && i < TOUR_STEPS.length; i += dir) {
      const now = host.ui()
      if (!running || !now) return
      const step = TOUR_STEPS[i]
      const layout = stepLayout(step, now.isDesktop)
      const slides = !now.isDesktop && now.sidebarOpen !== layout.drawerOpen
      now.setSidebarOpen(layout.drawerOpen)
      // The demo's steps open the results; a step back out of them puts the
      // reader's own view back.
      now.setShowResults(layout.showResults || saved.showResults)
      const wantCollapsed = !layout.showResults && saved.resultsCollapsed
      if (now.resultsCollapsed !== wantCollapsed) now.toggleCollapsed()
      const sceneMoves = layout.demo !== sceneOn
      if (sceneMoves) {
        sceneOn = layout.demo
        host.showScene(layout.demo ? scene : null)
      }
      // Two frames: one for React to commit, one for the layout effects that
      // measure the sheet to run, since the camera clears the sheet by that
      // measurement.
      await nextFrame()
      await nextFrame()
      if (sceneMoves && layout.demo) host.map()?.fitToPoints(scene.universe)
      else if (sceneMoves && saved.camera) host.map()?.setCamera(saved.camera)
      if (slides) await slideDone()
      if (!running) return
      if (document.querySelector(tourSelector(step.key))) {
        if (d.isActive()) d.moveTo(i)
        else d.drive(i)
        return
      }
    }
    if (dir === 1) finish()
  }

  // Idempotent: the X, Escape and Done reach it through `finish`, and
  // Driver's own `onDestroyed` reaches it again when it runs at all.
  function end() {
    if (!running) return
    running = false
    host.showScene(null)
    const now = host.ui()
    if (now) {
      now.setSidebarOpen(saved.sidebarOpen)
      now.setShowResults(saved.showResults)
      if (saved.resultsCollapsed !== now.resultsCollapsed) now.toggleCollapsed()
    }
    if (saved.camera) host.map()?.setCamera(saved.camera)
    host.ended()
  }

  function finish() {
    d.destroy()
    end()
  }

  const d = driver({
    steps: TOUR_STEPS.map((step) => ({
      element: tourSelector(step.key),
      popover: { title: step.title, description: step.text },
    })),
    // Point only (TJ, 2026-09-24): a lit control is shown, not used.
    disableActiveInteraction: true,
    // A press on the dim does nothing. The X, Escape and Done end it.
    overlayClickBehavior: () => {},
    showProgress: true,
    progressText: TOUR_COPY.progress,
    prevBtnText: TOUR_COPY.previous,
    nextBtnText: TOUR_COPY.next,
    doneBtnText: TOUR_COPY.done,
    overlayOpacity: TOUR_DIM,
    stagePadding: TOUR_STAGE_PAD_PX,
    stageRadius: TOUR_STAGE_RADIUS_PX,
    onPopoverRender: dress,
    // Navigation is ours, so every move can stand the screen up first.
    // Driver sends the arrow keys here too.
    onNextClick: () => {
      const at = d.getActiveIndex() ?? 0
      if (d.isLastStep()) finish()
      else void go(at + 1, 1)
    },
    onPrevClick: () => {
      const at = d.getActiveIndex() ?? 0
      if (at > 0) void go(at - 1, -1)
    },
    // The X and Escape. Driver asks here before it closes and then leaves the
    // closing to us, which is the one path it always takes: its own
    // `onDestroyed` is skipped when the close lands while a step is still
    // animating in, and a reader who closes that fast would otherwise be left
    // with the demo on screen and the page inert.
    onDestroyStarted: () => finish(),
    onDestroyed: end,
  })
  void go(0, 1)
}
