import { StrictMode, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { driver, type PopoverDOM } from 'driver.js'
import App from '../App'
import ErrorBoundary from '../components/ErrorBoundary'
import type { SandboxHandle } from '../hooks/useTour'
import { ICON, TOUR, TOUR_DIM, TOUR_STAGE_PAD_PX, TOUR_STAGE_RADIUS_PX } from '../styles'
import { setApiTransport } from '../utils/apiFetch'
import { enterScratch, leaveScratch, setOpenMeteoTransport } from '../utils/openMeteo'
import { TOUR_COPY, TOUR_STEPS, stepLayout, tourSelector } from '../utils/tourSteps'
import { setViewPrefsReadOnly } from '../utils/viewPrefs'
import { Stale, type Stage, find, frame, sleep, until } from './act'
import { ACTIONS } from './actions'
import demoData from './demoData.json'
import { createDemoWorld } from './fixtures'
import { createPointer } from './pointer'
import { type DemoData, stateBefore } from './scenario'
import '../tour.css'

// One run of the tutorial (#536). Everything here, Driver and the demo data
// included, is one chunk that `useTour` imports when a reader starts the
// tutorial, so no one who never opens it downloads any of it.
//
// The reader's app is hidden and left exactly as it was. Over it stands a
// second copy of the app, the demo, and each step is acted out on that copy's
// real controls by a drawn pointer: it types, clicks, draws and presses
// Analyze. For as long as the demo exists, every request the page makes is
// answered from recorded and example data (`fixtures.ts`), the demo has a
// forecast cache and pacing budgets of its own, and nothing is written to the
// address bar or to storage. Ending the tutorial removes the demo, and the
// reader's app is simply shown again.
//
// A step that is left before its action ends, and every step back, mounts the
// demo afresh in the state that step starts from (`scenario.stateBefore`), so
// no screen depends on how the reader moved through the steps.

/** What the reader's app lends a run. */
export interface TourHost {
  /** Called once, however the run ends. */
  ended: () => void
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
  // A press on the card is not a press outside a panel the demo opened: the
  // demo's pickers close on a press anywhere else in the document.
  for (const type of ['pointerdown', 'mousedown'] as const) {
    popover.wrapper.addEventListener(type, (e) => e.stopPropagation())
  }
}

export function runTour(host: TourHost): void {
  const demo = demoData as unknown as DemoData
  const nowMs = Date.now()
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const readerRoot = document.getElementById('root')

  // The closed world, set before the demo's first render asks for anything.
  const world = createDemoWorld(demo, nowMs)
  setApiTransport(world.api)
  setOpenMeteoTransport(world.openMeteo)
  enterScratch()
  setViewPrefsReadOnly(true)

  const container = document.createElement('div')
  container.className = TOUR.sandbox
  container.dataset.tourSandbox = ''
  document.body.appendChild(container)
  const root = createRoot(container)
  const handle: { current: SandboxHandle | null } = { current: null }
  let mounts = 0

  const frameEl = document.createElement('div')
  frameEl.className = TOUR.frame
  // Which step is on screen and whether it is still acting, for the browser
  // suite to wait on rather than guess a duration.
  frameEl.dataset.tourFrame = ''
  document.body.appendChild(frameEl)
  const pointer = createPointer(reduced)

  let running = true
  // Bumped by every move, so an action of a step already left stops at its
  // next wait instead of acting on the screen the reader has moved to.
  let moves = 0
  let index = 0
  // Whether the step on screen is still acting, so leaving it has to mount
  // the demo afresh at the next step rather than trust a half-acted screen.
  let acting = false

  // ── What Driver lights ────────────────────────────────────────────────────

  let targets: () => (Element | null | undefined)[] = () => []
  let lastBox = ''

  // The frame is the union of the targets, kept inside the viewport. Returns
  // whether it moved, so Driver is asked to redraw only then.
  function measure(): boolean {
    const boxes = targets()
      .filter((el): el is Element => Boolean(el?.isConnected))
      .map((el) => el.getBoundingClientRect())
      .filter((b) => b.width > 0 && b.height > 0)
    if (boxes.length === 0) return false
    const left = Math.max(0, Math.min(...boxes.map((b) => b.left)))
    const top = Math.max(0, Math.min(...boxes.map((b) => b.top)))
    const right = Math.min(window.innerWidth, Math.max(...boxes.map((b) => b.right)))
    const bottom = Math.min(window.innerHeight, Math.max(...boxes.map((b) => b.bottom)))
    const box = [left, top, right, bottom].map(Math.round).join(',')
    if (box === lastBox) return false
    lastBox = box
    Object.assign(frameEl.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${Math.max(0, right - left)}px`,
      height: `${Math.max(0, bottom - top)}px`,
    })
    return true
  }

  // A control opens, a drawer slides, the map flies: the lit box follows
  // every frame, and costs a few rectangle reads when nothing moves.
  let watching = 0
  function watch() {
    if (measure() && d.isActive()) d.refresh()
    watching = requestAnimationFrame(watch)
  }

  // ── The demo app ──────────────────────────────────────────────────────────

  function stage(move: number): Stage {
    return {
      root: container,
      readerRoot,
      handle: () => {
        if (!handle.current) throw new Error('The demo app is not mounted.')
        return handle.current
      },
      alive: () => running && move === moves,
      reduced,
      pointer,
      light: (next) => {
        targets = next
        if (measure() && d.isActive()) d.refresh()
      },
    }
  }

  // Mounts the demo in the state step `at` starts from, and waits until it
  // stands: limits applied, map drawn, and the analysis done where one has
  // already run by then.
  async function mount(at: number, s: Stage): Promise<void> {
    const { initial, autoAnalyze } = stateBefore(at, demo, nowMs)
    handle.current = null
    mounts += 1
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(
          ErrorBoundary,
          null,
          createElement(App, { key: mounts, sandbox: { initial, autoAnalyze, handle } }),
        ),
      ),
    )
    const ready = await until(s, () => handle.current?.settled && handle.current.map && handle.current, 15_000)
    await ready.map?.whenIdle()
    if (autoAnalyze) {
      await until(s, () => handle.current && handle.current.analysisSeq > 0 && !handle.current.loading, 30_000)
    }
  }

  // Stands the drawer and the results sheet the way a step needs them.
  async function stand(s: Stage, at: number): Promise<void> {
    const h = s.handle()
    const hasReport = h.analysisSeq > 0
    const layout = stepLayout(TOUR_STEPS[at], h.isDesktop, hasReport)
    const slides = h.sidebarOpen !== layout.drawerOpen
    h.setSidebarOpen(layout.drawerOpen)
    if (hasReport) h.setShowResults(true)
    if (layout.collapsed !== null && h.resultsCollapsed !== layout.collapsed) h.toggleCollapsed()
    await frame(s)
    await frame(s)
    if (slides && !h.isDesktop) await sleep(s, 400)
  }

  // ── Moving between steps ──────────────────────────────────────────────────

  async function show(at: number, fresh: boolean): Promise<void> {
    moves += 1
    const s = stage(moves)
    index = at
    pointer.hide()
    try {
      if (d.isActive()) d.moveTo(at)
      if (fresh) await mount(at, s)
      await stand(s, at)
      const step = TOUR_STEPS[at]
      const anchor = await until(s, () => find(s, tourSelector(step.anchor)))
      s.light(() => [anchor])
      if (!d.isActive()) d.drive(at)
      const action = ACTIONS[step.key]
      acting = Boolean(action)
      frameEl.dataset.step = step.key
      frameEl.dataset.acting = String(acting)
      if (action) await action(s, demo, nowMs)
      if (s.alive()) {
        acting = false
        frameEl.dataset.acting = 'false'
      }
    } catch (e) {
      // A step left mid-action stops here quietly. Anything else leaves the
      // step on screen with its card, and the demo is mounted afresh when the
      // reader moves on, since `acting` is still set.
      if (e instanceof Stale) return
      console.error(e)
      // The demo never stood up, so there is no card to end the tutorial
      // from: it ends itself rather than leave the reader under an empty page.
      if (!d.isActive()) finish()
    }
  }

  // Idempotent: the X, Escape and Done reach it through `finish`, and
  // Driver's own `onDestroyed` reaches it again when it runs at all.
  function end() {
    if (!running) return
    running = false
    moves += 1
    cancelAnimationFrame(watching)
    root.unmount()
    container.remove()
    frameEl.remove()
    pointer.remove()
    host.ended()
    // The demo's last answers are left to land in its own cache before the
    // reader's world comes back.
    void world.settled().then(() => {
      setApiTransport(null)
      setOpenMeteoTransport(null)
      leaveScratch()
      setViewPrefsReadOnly(false)
    })
  }

  function finish() {
    d.destroy()
    end()
  }

  const d = driver({
    steps: TOUR_STEPS.map((step) => ({
      element: () => frameEl,
      popover: { title: step.title, description: step.text },
    })),
    // The reader watches: the tutorial does the pressing.
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
    // Navigation is ours. Driver sends the arrow keys here too.
    onNextClick: () => {
      if (index >= TOUR_STEPS.length - 1) finish()
      else void show(index + 1, acting)
    },
    onPrevClick: () => {
      if (index === 0) return
      const back = index - 1
      // Back over a step that acted means standing where it started and
      // acting it again; back from a step that acted, onto one that only
      // points, means standing where this one started.
      const fresh = acting || Boolean(ACTIONS[TOUR_STEPS[back].key] || ACTIONS[TOUR_STEPS[index].key])
      void show(back, fresh)
    },
    // The X and Escape. Driver asks here before it closes and then leaves the
    // closing to us, which is the one path it always takes: its own
    // `onDestroyed` is skipped when the close lands while a step is still
    // animating in.
    onDestroyStarted: () => finish(),
    onDestroyed: end,
  })

  watching = requestAnimationFrame(watch)
  void show(0, true)
}
