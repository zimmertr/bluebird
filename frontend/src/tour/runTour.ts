import { Fragment, StrictMode, createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../App'
import ErrorBoundary from '../components/ErrorBoundary'
import type { SandboxHandle } from '../hooks/useTour'
import { setPopoverReserve } from '../hooks/usePopover'
import { TOUR } from '../styles'
import { setApiTransport } from '../utils/apiFetch'
import { NO_INSETS } from '../utils/mapFraming'
import type { CameraView } from '../utils/mapView'
import { enterScratch, leaveScratch, setOpenMeteoTransport } from '../utils/openMeteo'
import { TOUR_STEPS, phoneEdge, stepLayout, tourSelector } from '../utils/tourSteps'
import { setViewPrefsReadOnly } from '../utils/viewPrefs'
import { PACE, Stale, type Stage, type Target, boxOf, find, frame, reveal, scrollParent, sleep, until } from './act'
import { ACTIONS, LIGHTS, REPLAYS } from './actions'
import Card, { type Phase } from './Card'
import demoData from './demoData.json'
import Dim from './Dim'
import { createDemoWorld } from './fixtures'
import { type Box, type CardPlace, cameraInsets, cardPlace, clip, freeMap } from './place'
import { createPointer } from './pointer'
import { type DemoData, keepsPopup, stateBefore } from './scenario'

// One run of the tutorial (#536). Everything here, the demo data included, is
// one chunk that `useTour` imports when a reader starts the tutorial, so no one
// who never opens it downloads any of it.
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
// A step opens with its card and its lit area, and nothing moves: the reader
// reads, and Next plays the step's action. Next again while it plays finishes
// it at once, where it was going. Previous mounts the demo afresh in the state
// the step before starts from (`scenario.stateBefore`), with the camera it had,
// so no screen depends on how the reader moved through the steps.

/** What the reader's app lends a run. */
export interface TourHost {
  /** Called once, however the run ends. */
  ended: () => void
}

// A Next this soon after the one that started an action is the same press
// landing twice, not a request to finish it.
const DOUBLE_PRESS_MS = 250

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

  // The card and the dim, in a root of their own so a mount of the demo never
  // re-renders them, and after the demo so they stand over it.
  const chrome = document.createElement('div')
  document.body.appendChild(chrome)
  const chromeRoot = createRoot(chrome)
  const cardRef = createRef<HTMLDivElement>()
  const pointer = createPointer()

  let running = true
  // Bumped by every move, so an action of a step already left stops at its
  // next wait instead of acting on the screen the reader has moved to.
  let moves = 0
  let index = 0
  let phase: Phase = 'loading'
  let place: CardPlace | null = null
  let focusKey = 0
  let actedAt = 0
  // A Next pressed while the demo was still mounting, played once it stands.
  let queued = false
  // Set when an action failed, so moving on mounts afresh.
  let broken = false
  // Where the camera stood as each step opened, for a mount back at it.
  const cameras: (CameraView | null)[] = []

  // ── Pace ──────────────────────────────────────────────────────────────────

  let hurried = false
  let hurry: () => void = () => {}
  let hurriedGate = new Promise<void>((resolve) => (hurry = resolve))

  function setInstant(on: boolean) {
    world.setInstant(on)
    handle.current?.map?.setInstant(on || reduced)
  }

  function hurryNow() {
    if (hurried) return
    hurried = true
    setInstant(true)
    handle.current?.map?.hurry()
    pointer.hide()
    hurry()
  }

  function unhurry() {
    hurried = false
    hurriedGate = new Promise<void>((resolve) => (hurry = resolve))
    setInstant(false)
  }

  // ── What is lit, and where the card stands ───────────────────────────────

  let targets: () => Target[] = () => []

  // Each target as the part of it on screen: inside the viewport, and inside
  // the panel that scrolls it, so a section taller than the panel is lit only
  // where it shows.
  function holes(): Box[] {
    const view = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
    return targets()
      .map((t) => {
        if (!(t instanceof Element)) return t ?? null
        if (!t.isConnected) return null
        const scroller = scrollParent(t)
        return clip(boxOf(t), scroller ? boxOf(scroller) : view)
      })
      .map((b) => (b ? clip(b, view) : null))
      .filter((b): b is Box => b !== null && b.right - b.left > 1 && b.bottom - b.top > 1)
  }

  const mapBox = () => {
    const el = container.querySelector(tourSelector('map'))
    return el ? boxOf(el) : null
  }
  const cardBox = () => (cardRef.current ? boxOf(cardRef.current) : null)
  // Where the map stops being map at its bottom: the player, and on a phone
  // the results sheet standing on it.
  const coveredTop = () => {
    const tops = [Infinity]
    const player = container.querySelector(tourSelector('player'))
    if (player) tops.push(boxOf(player).top)
    const sheet = container.querySelector('[data-results-sheet]')
    if (sheet && !handle.current?.isDesktop) tops.push(boxOf(sheet).top)
    return Math.min(...tops)
  }

  function render() {
    chromeRoot.render(
      createElement(
        Fragment,
        null,
        createElement(Dim, { holes, reduced }),
        place &&
          createElement(Card, {
            index,
            phase,
            place,
            focusKey,
            cardRef,
            onNext: next,
            onPrevious: previous,
            onEnd: end,
          }),
      ),
    )
  }

  // Where the card stands for step `at`: one place for the whole run on a
  // desktop, and one edge or the other on a phone.
  function placeCard(at: number) {
    const map = mapBox()
    const h = handle.current
    if (!map || !h) return
    place = cardPlace({
      viewportW: window.innerWidth,
      viewportH: window.innerHeight,
      isDesktop: h.isDesktop,
      map,
      edge: phoneEdge(at),
    })
    render()
  }

  // Nothing of the demo stands under the card. On a desktop the card is on
  // the map, so the camera frames clear of it. On a phone the card spans an
  // edge, so the map and the drawer end where it begins: the map's own chrome
  // (the legend, the buttons, the player) moves with the map and stays in
  // view, and a list opened from the drawer is placed in what is left.
  function clearCard() {
    const h = handle.current
    const card = cardBox()
    const map = mapBox()
    if (!h || !card || !map || !place) return
    const phone = !h.isDesktop
    const top = phone && place.edge === 'top' ? card.bottom : 0
    const bottom = phone && place.edge === 'bottom' ? window.innerHeight - card.top : 0
    h.map?.setCameraInsets(phone ? NO_INSETS : cameraInsets(card, map))
    setPopoverReserve({ top, bottom })
    const mapEl = container.querySelector<HTMLElement>(tourSelector('map'))
    if (mapEl) {
      mapEl.style.marginTop = top ? `${top}px` : ''
      mapEl.style.marginBottom = bottom ? `${bottom}px` : ''
    }
    const drawerEl = container.querySelector<HTMLElement>('[data-drawer]')
    if (drawerEl) {
      drawerEl.style.top = top ? `${top}px` : ''
      drawerEl.style.bottom = bottom ? `${bottom}px` : ''
    }
  }

  function stage(move: number): Stage {
    return {
      root: container,
      readerRoot,
      handle: () => {
        if (!handle.current) throw new Error('The demo app is not mounted.')
        return handle.current
      },
      alive: () => running && move === moves,
      instant: () => reduced || hurried,
      get hurried() {
        return hurriedGate
      },
      pointer,
      light: (next) => {
        targets = next
      },
      card: cardBox,
      freeMap: () => {
        const card = cardBox()
        const map = mapBox()
        return card && map && place ? freeMap(card, map, place.edge, coveredTop()) : null
      },
    }
  }

  // ── The demo app ──────────────────────────────────────────────────────────

  // Mounts the demo in the state step `at` starts from, and waits until it
  // stands: limits applied, map drawn, the analysis done where one has already
  // run by then, and whatever a press had left open opened again.
  async function mount(at: number, s: Stage): Promise<void> {
    const { initial, autoAnalyze, replay } = stateBefore(at, demo, nowMs)
    const view = cameras[at]
    handle.current = null
    mounts += 1
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(
          ErrorBoundary,
          null,
          createElement(App, {
            key: mounts,
            sandbox: { initial: view ? { ...initial, view } : initial, autoAnalyze, handle },
          }),
        ),
      ),
    )
    const ready = await until(s, () => handle.current?.settled && handle.current.map && handle.current, 15_000)
    await ready.map?.whenIdle()
    setInstant(hurried)
    placeCard(at)
    await frame(s)
    clearCard()
    if (autoAnalyze) {
      await until(s, () => handle.current && handle.current.analysisSeq > 0 && !handle.current.loading, 30_000)
    }
    if (replay) {
      await stand(s, at)
      await played(() => REPLAYS[replay](s, demo, nowMs))
    }
  }

  // Runs `act` at once, with the pointer hidden, and the pace back after.
  async function played(act: () => Promise<void>): Promise<void> {
    const was = hurried
    hurried = true
    setInstant(true)
    pointer.hide()
    try {
      await act()
    } finally {
      hurried = was
      setInstant(was)
    }
  }

  // Stands the drawer, the results and the panel the way a step needs them.
  async function stand(s: Stage, at: number): Promise<void> {
    const h = s.handle()
    const step = TOUR_STEPS[at]
    if (h.analysisSeq > 0) h.setShowResults(true)
    const layout = stepLayout(step, h.isDesktop, h.showResults)
    const slides = h.sidebarOpen !== layout.drawerOpen
    h.setSidebarOpen(layout.drawerOpen)
    if (layout.collapsed !== null && h.showResults && h.resultsCollapsed !== layout.collapsed) h.toggleCollapsed()
    if (!keepsPopup(at)) h.map?.closePopups()
    await frame(s)
    await frame(s)
    placeCard(at)
    await frame(s)
    clearCard()
    if (slides && !h.isDesktop) await sleep(s, 400)
    if (step.place === 'panel' && step.anchors.length > 0) {
      const section = await until(s, () => find(s, tourSelector(step.anchors[0])))
      await reveal(s, section)
    }
  }

  function lightStep(s: Stage, at: number) {
    const step = TOUR_STEPS[at]
    const own = LIGHTS[step.key]
    s.light(own ? () => own(s) : () => step.anchors.map((a) => find(s, tourSelector(a))))
  }

  // ── Moving between steps ──────────────────────────────────────────────────

  // Shows step `at` with its card, and nothing moving. `fresh` mounts the
  // demo at the state the step starts from; otherwise the screen already is.
  async function open(at: number, fresh: boolean): Promise<void> {
    moves += 1
    const s = stage(moves)
    index = at
    phase = fresh ? 'loading' : 'read'
    unhurry()
    pointer.hide()
    render()
    try {
      if (fresh) await mount(at, s)
      else {
        // A step with no action of its own, stepped back to: what it shows
        // open is opened again, since the step after it closed it.
        const { replay } = stateBefore(at, demo, nowMs)
        await stand(s, at)
        if (replay === 'popup' || replay === 'poi') await played(() => REPLAYS[replay](s, demo, nowMs))
      }
      await stand(s, at)
      cameras[at] = s.handle().map?.camera() ?? cameras[at] ?? null
      lightStep(s, at)
      phase = 'read'
      focusKey += 1
      render()
      if (queued) {
        queued = false
        next()
      }
    } catch (e) {
      if (e instanceof Stale) return
      console.error(e)
      // The demo never stood up, so there is no card to end the tutorial
      // from: it ends itself rather than leave the reader under an empty page.
      if (!place) end()
      else {
        phase = 'read'
        render()
      }
    }
  }

  async function act(at: number): Promise<void> {
    const s = stage(moves)
    const action = ACTIONS[TOUR_STEPS[at].key]
    phase = 'acting'
    actedAt = performance.now()
    render()
    try {
      await action(s, demo, nowMs)
      const finishedEarly = hurried
      unhurry()
      pointer.hide()
      if (!finishedEarly) {
        phase = 'hold'
        render()
        await sleep(s, PACE.holdMs)
      }
      if (at === TOUR_STEPS.length - 1) end()
      else void open(at + 1, false)
    } catch (e) {
      if (e instanceof Stale) return
      console.error(e)
      // The step is left as it stands, with its card. Moving on mounts the
      // next step's state afresh, since this one never finished.
      unhurry()
      phase = 'read'
      broken = true
      focusKey += 1
      render()
    }
  }

  function next() {
    if (!running) return
    if (phase === 'loading') {
      queued = true
      return
    }
    if (phase === 'acting') {
      if (performance.now() - actedAt >= DOUBLE_PRESS_MS) hurryNow()
      return
    }
    if (phase === 'hold') {
      hurryNow()
      return
    }
    const step = TOUR_STEPS[index]
    if (ACTIONS[step.key] && !broken) {
      void act(index)
      return
    }
    if (index === TOUR_STEPS.length - 1) {
      end()
      return
    }
    const fresh = broken
    broken = false
    void open(index + 1, fresh)
  }

  function previous() {
    if (!running || index === 0) return
    const back = index - 1
    // A step read and not yet played stands where the step before it ended:
    // stepping back onto one with no action of its own is the same screen.
    // Anything else stands where the step before started, which only a mount
    // can promise.
    const fresh = phase !== 'read' || broken || Boolean(ACTIONS[TOUR_STEPS[back].key])
    broken = false
    queued = false
    void open(back, fresh)
  }

  // ── Keys ──────────────────────────────────────────────────────────────────

  // The reader's keys, never the tutorial's own synthetic ones, and a held key
  // once. A focused card button takes Space and Enter itself, so they press
  // the button that has focus.
  function onKey(e: KeyboardEvent) {
    if (!e.isTrusted) return
    const handled = [' ', 'Enter', 'ArrowRight', 'ArrowLeft', 'Escape'].includes(e.key)
    if (!handled) return
    const onButton =
      document.activeElement instanceof HTMLButtonElement && Boolean(cardRef.current?.contains(document.activeElement))
    if ((e.key === ' ' || e.key === 'Enter') && onButton) return
    e.preventDefault()
    e.stopPropagation()
    if (e.repeat) return
    if (e.key === 'Escape') end()
    else if (e.key === 'ArrowLeft') previous()
    else next()
  }
  window.addEventListener('keydown', onKey, true)

  // A resize or a turned phone moves the card, the one time it moves.
  function onResize() {
    if (!running || !handle.current) return
    placeCard(index)
    requestAnimationFrame(() => {
      clearCard()
      if (phase === 'read') {
        const s = stage(moves)
        void stand(s, index).catch(() => {})
      }
    })
  }
  window.addEventListener('resize', onResize)

  // ── Ending ────────────────────────────────────────────────────────────────

  function end() {
    if (!running) return
    running = false
    moves += 1
    hurry()
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('resize', onResize)
    root.unmount()
    container.remove()
    chromeRoot.unmount()
    chrome.remove()
    pointer.remove()
    setPopoverReserve({ top: 0, bottom: 0 })
    host.ended()
    // Focus goes back to where the tutorial can be started again, once the
    // reader's app is no longer inert.
    const back = () => readerRoot?.querySelector<HTMLElement>(tourSelector('tutorial'))
    let tries = 0
    const refocus = () => {
      const inert = readerRoot?.querySelector('[inert]')
      if (inert && tries++ < 60) requestAnimationFrame(refocus)
      else back()?.focus({ preventScroll: true })
    }
    requestAnimationFrame(refocus)
    // The demo's last answers are left to land in its own cache before the
    // reader's world comes back.
    void world.settled().then(() => {
      setApiTransport(null)
      setOpenMeteoTransport(null)
      leaveScratch()
      setViewPrefsReadOnly(false)
    })
  }

  render()
  void open(0, true)
}
