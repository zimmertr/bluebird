import { Fragment, StrictMode, createElement, createRef } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../App'
import ErrorBoundary from '../components/ErrorBoundary'
import type { SandboxHandle } from '../hooks/useTour'
import { setPopoverReserve } from '../hooks/usePopover'
import { TOUR, TOUR_HOLE_PAD_PX, TOUR_LIGHT_INSET_PX, TOUR_LIGHT_MIN_PX } from '../styles'
import { setApiTransport } from '../utils/apiFetch'
import { NO_INSETS } from '../utils/mapFraming'
import type { CameraView } from '../utils/mapView'
import { enterScratch, leaveScratch, setOpenMeteoTransport } from '../utils/openMeteo'
import { TOUR_STEPS, phoneEdge, stepLayout, tourSelector } from '../utils/tourSteps'
import { setViewPrefsReadOnly } from '../utils/viewPrefs'
import { PACE, Stale, type Stage, type Target, boxOf, check, find, frame, reveal, scrollParent, sleep, until } from './act'
import { ACTIONS, FRAMES, LIGHTS, REPLAYS, RESULTS } from './actions'
import Card, { type Phase } from './Card'
import demoData from './demoData.json'
import Dim from './Dim'
import { createDemoWorld } from './fixtures'
import {
  type Box,
  CARD_GAP,
  type CardPlace,
  type Held,
  NOTHING_HELD,
  cameraInsets,
  cardPlace,
  clip,
  freeMap,
} from './place'
import { createPointer } from './pointer'
import { DEMO_VIEW, type DemoData, keepsPopup, stateBefore } from './scenario'

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
// How long a new card's words wait after its light has moved.
const TEXT_AFTER_LIGHT_MS = 200
// How many frames a lit area's size holds before the light follows a change.
const STEADY_FRAMES = 3
// A lit area whose long side is under this is a small control, not a row or
// a section, and is grown to `TOUR_LIGHT_MIN_PX` each way.
const SMALL_LONG_SIDE_PX = 4 * TOUR_LIGHT_MIN_PX

function grown(b: Box): Box {
  const w = b.right - b.left
  const h = b.bottom - b.top
  if (Math.max(w, h) >= SMALL_LONG_SIDE_PX) return b
  const dx = Math.max(0, TOUR_LIGHT_MIN_PX - w) / 2
  const dy = Math.max(0, TOUR_LIGHT_MIN_PX - h) / 2
  return { left: b.left - dx, top: b.top - dy, right: b.right + dx, bottom: b.bottom + dy }
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
  // The step whose text the card shows. It follows `index` once the new
  // step's light stands, so the eye goes to the light first.
  let shown = 0
  // Bumped as each card opens, which pulses its light once.
  let pulse = 0
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
  // Set while the demo's table is sized to its rows, so a later step puts it back.
  let tableSized = false

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
  //
  // A small one is grown about its middle to a size the eye finds, and every
  // one is kept far enough inside the screen that its ring is drawn whole.
  function measure(list: Target[]): Box[] {
    const view = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
    const edge = TOUR_LIGHT_INSET_PX + TOUR_HOLE_PAD_PX
    const inside = { left: edge, top: edge, right: view.right - edge, bottom: view.bottom - edge }
    return shownPart(list).map((b) => clip(grown(b), inside) ?? b)
  }

  // Whether a target stands on the map itself: a popup there, or a box of
  // the map (`place.onMap`), as against the panel or the map's own chrome.
  function onMap(t: Target): boolean {
    if (t instanceof Element) return Boolean(t.closest('.maplibregl-popup'))
    return Boolean(t && (t as { map?: boolean }).map)
  }

  // Each target as far as it shows: inside its scrolling panel and the screen.
  function shownPart(list: Target[]): Box[] {
    const view = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
    return list
      .map((t) => {
        if (!(t instanceof Element)) return t ?? null
        if (!t.isConnected) return null
        const scroller = scrollParent(t)
        return clip(boxOf(t), scroller ? boxOf(scroller) : view)
      })
      .map((b) => (b ? clip(b, view) : null))
      .filter((b): b is Box => b !== null && b.right - b.left > 1 && b.bottom - b.top > 1)
  }

  // What the dim cuts out, a frame at a time. A phone's drawer that is
  // sliding carries its sections away with it, so nothing in it is lit until
  // it stands still. A lit area that is changing size (a section opening, a
  // notice pushing it, a panel scrolling) goes dark until its new size has
  // held for a few frames.
  let drawerWas: Box | null = null
  let lastRaw: Box[] = []
  let heldFor: number[] = []
  function holes(): Box[] {
    const drawer = container.querySelector('[data-drawer]')
    const now = drawer ? boxOf(drawer) : null
    const sliding = Boolean(now && drawerWas && Math.abs(now.left - drawerWas.left) + Math.abs(now.top - drawerWas.top) > 0.5)
    drawerWas = now
    // Nothing on the map is lit while the camera moves: the light is on
    // where the step's subject stands still.
    const moving = handle.current?.map?.moving() ?? false
    if (moving) container.dataset.mapMoving = ''
    else delete container.dataset.mapMoving
    const raw = measure(
      targets().filter((t) => !(sliding && t instanceof Element && drawer?.contains(t)) && !(moving && onMap(t))),
    )
    if (raw.length !== lastRaw.length) {
      lastRaw = raw
      heldFor = raw.map(() => STEADY_FRAMES)
      return raw
    }
    const size = (b: Box) => [b.right - b.left, b.bottom - b.top]
    raw.forEach((b, i) => {
      const [w, h] = size(b)
      const [pw, ph] = size(lastRaw[i])
      heldFor[i] = Math.abs(w - pw) < 1 && Math.abs(h - ph) < 1 ? heldFor[i] + 1 : 0
    })
    lastRaw = raw
    // Moving whole, a lit area is followed at once; changing size, it goes
    // dark until it has held, so the light is never on a place that is gone.
    return raw.filter((_, i) => heldFor[i] >= STEADY_FRAMES)
  }

  // Resolves once nothing that moves the screen is moving: the drawer, the
  // results and the map's own box unchanged over a few frames, and the map
  // itself at rest.
  async function settled(s: Stage): Promise<void> {
    const read = () =>
      JSON.stringify(
        ['[data-drawer]', '[data-results-sheet]', tourSelector('map')].map((sel) => {
          const el = container.querySelector(sel)
          return el ? boxOf(el) : null
        }),
      )
    let last = read()
    let still = 0
    const deadline = performance.now() + 2000
    while (still < 3 && performance.now() < deadline) {
      await frame(s)
      const now = read()
      still = now === last ? still + 1 : 0
      last = now
    }
    await s.handle().map?.whenIdle()
    check(s)
  }

  // Resolves once the light has glided onto its targets, so a hold counted
  // from here shows the result lit for all of it. Bounded, since a target
  // that keeps moving (a map still easing) would otherwise hold the step.
  async function landed(s: Stage): Promise<void> {
    const deadline = performance.now() + 800
    while (performance.now() < deadline && !hurried) {
      const drawn = JSON.parse(document.querySelector('[data-tour-dim]')?.getAttribute('data-holes') ?? '[]') as number[][]
      const aim = measure(targets())
      const near = (d: number[], b: Box) => [b.left, b.top, b.right, b.bottom].every((v, i) => Math.abs(v - d[i]) <= 1)
      if (drawn.length === aim.length && aim.every((b, i) => near(drawn[i], b))) return
      await frame(s)
    }
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

  // What the map's own chrome takes of each edge (`place.Held`), measured now:
  // a legend joins the column with each layer turned on.
  function held(): Held {
    const map = mapBox()
    if (!map || !handle.current) return NOTHING_HELD
    const shown = (selector: string) => {
      const el = container.querySelector(selector)
      const box = el ? boxOf(el) : null
      return box && box.right > box.left && box.bottom > box.top ? box : null
    }
    const column = shown('[data-map-column]')
    const buttons = shown('.maplibregl-ctrl-top-right')
    const legend = shown(tourSelector('legend'))
    if (handle.current.isDesktop) {
      const leftEdge = Math.max(column?.right ?? map.left, legend?.right ?? map.left)
      return {
        top: 0,
        left: leftEdge > map.left ? leftEdge - map.left + CARD_GAP : 0,
        right: buttons ? map.right - buttons.left + CARD_GAP : 0,
      }
    }
    const topEdge = Math.max(column?.bottom ?? map.top, buttons?.bottom ?? map.top, legend?.bottom ?? map.top)
    return { top: topEdge > map.top ? topEdge - map.top + CARD_GAP : 0, left: 0, right: 0 }
  }

  // The part of the map clear of the card, the map's chrome and whatever
  // covers its bottom edge.
  function freeNow(): Box | null {
    const card = cardBox()
    const map = mapBox()
    if (!card || !map || !place) return null
    const free = freeMap(card, map, place.edge, coveredTop(), held())
    // Never more than two thirds of it, so the place still has room to land.
    const room = Math.min(popupRoom, ((free.bottom - free.top) * 2) / 3)
    return Object.assign({ ...free, top: free.top + room }, { map: true })
  }
  // Set while a flight carries a place whose popup opens above it.
  let popupRoom = 0

  function render() {
    chromeRoot.render(
      createElement(
        Fragment,
        null,
        createElement(Dim, { holes, reduced, pulse }),
        place &&
          createElement(Card, {
            index: shown,
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
      cardH: cardRef.current?.offsetHeight || undefined,
    })
    render()
  }

  // Nothing of the demo stands under the card. The camera frames into the free
  // map, read at each move, so a fit lands clear of the card and of the map's
  // own chrome as it stands then. On a phone the card spans an edge and lies
  // over the map the way anything laid over a map does, so the map, its chrome
  // and the results sheet keep the heights the app gives them; only the
  // drawer ends where the card begins, and a list opened from it is placed in
  // what is left.
  function clearCard() {
    const h = handle.current
    const card = cardBox()
    const map = mapBox()
    if (!h || !card || !map || !place) return
    const phone = !h.isDesktop
    const top = phone && place.edge === 'top' ? card.bottom : 0
    const bottom = phone && place.edge === 'bottom' ? window.innerHeight - card.top : 0
    h.map?.setCameraInsets(() => {
      const free = freeNow()
      const now = mapBox()
      return free && now ? cameraInsets(free, now) : NO_INSETS
    })
    setPopoverReserve({ top, bottom })
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
      freeMap: freeNow,
      reservePopup: (px) => {
        popupRoom = px
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
            sandbox: { initial: view ? { ...initial, view } : initial, view: DEMO_VIEW, autoAnalyze, handle },
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
    // The player as `stateBefore` has it, for a step reached without a mount.
    h.setShowPlayer(stateBefore(at, demo, nowMs).initial.showPlayer ?? null)
    const layout = stepLayout(step, h.isDesktop, h.showResults)
    const slides = h.sidebarOpen !== layout.drawerOpen
    h.setSidebarOpen(layout.drawerOpen)
    // Folded before any results exist too, so the bar a search brings arrives
    // folded rather than opening and folding again.
    if (h.resultsCollapsed !== layout.collapsed) h.toggleCollapsed()
    if (!keepsPopup(at)) h.map?.closePopups()
    await frame(s)
    await frame(s)
    placeCard(at)
    await frame(s)
    clearCard()
    if (slides && !h.isDesktop) await sleep(s, 400)
    await FRAMES[step.key]?.(s)
    if (layout.wholeTable) await wholeTable(s)
    else if (tableSized) {
      h.sizeTable(null)
      tableSized = false
      await frame(s)
    }
    if (step.place === 'panel' && step.anchors.length > 0) {
      const section = await until(s, () => find(s, tourSelector(step.anchors[0])))
      await reveal(s, section)
    }
  }

  // Sizes the demo's table to show every row it holds, as far as the app
  // lets it: a desktop keeps the map's resting floor, and a phone's sheet
  // stops where a reader's drag would.
  async function wholeTable(s: Stage): Promise<void> {
    const h = s.handle()
    const table = await until(s, () => find<HTMLElement>(s, tourSelector('results')))
    await frame(s)
    const px = table.offsetHeight + table.scrollHeight - table.clientHeight
    if (px > table.offsetHeight + 1) {
      h.sizeTable(px)
      tableSized = true
      await frame(s)
      await frame(s)
    }
  }

  // What the browser suite reads during a hold: each thing the step changed,
  // as its box on screen, whether it stands on the map and is a popup there,
  // and whether it shows whole (or, taller than its panel, from its top).
  function publishResult(list: Target[]) {
    container.dataset.tourResult = JSON.stringify(
      list.flatMap((t) => {
        const [box] = measure([t])
        if (!box) return []
        const popup = t instanceof Element ? Boolean(t.closest('.maplibregl-popup')) : Boolean((t as { popup?: boolean }).popup)
        const map = !(t instanceof Element) || popup
        let whole = true
        if (t instanceof Element) {
          const [part] = shownPart([t])
          const raw = boxOf(t)
          const scroller = scrollParent(t)
          const room = scroller ? boxOf(scroller) : null
          const all = Math.abs(raw.top - part.top) <= 1 && Math.abs(raw.bottom - part.bottom) <= 1
          const taller = room !== null && raw.bottom - raw.top > room.bottom - room.top
          const fromTop = taller && Math.abs(part.top - room.top) <= 10
          const fromBottom = taller && Math.abs(part.bottom - room.bottom) <= 10
          whole = all || fromTop || fromBottom
        }
        return [{ box, map, popup, whole }]
      }),
    )
  }

  function lightStep(s: Stage, at: number) {
    const step = TOUR_STEPS[at]
    const own = LIGHTS[step.key]
    s.light(own ? () => own(s, demo) : () => step.anchors.map((a) => find(s, tourSelector(a))))
  }

  // ── Moving between steps ──────────────────────────────────────────────────

  // Shows step `at` with its card, and nothing moving. `fresh` mounts the
  // demo at the state the step starts from; otherwise the screen already is.
  async function open(at: number, fresh: boolean): Promise<void> {
    moves += 1
    const s = stage(moves)
    index = at
    // Not read until it stands and is lit: the lights glide on from the step
    // before, and until they land they are that step's.
    phase = 'loading'
    delete container.dataset.tourFramed
    delete container.dataset.tourResult
    unhurry()
    pointer.hide()
    render()
    try {
      if (fresh) await mount(at, s)
      // The new step's light from as early as it can stand, so a flight into
      // it is never watched in the dark.
      lightStep(s, at)
      if (!fresh) {
        // A step with no action of its own, stepped back to: what it shows
        // open is opened again, since the step after it closed it.
        const { replay } = stateBefore(at, demo, nowMs)
        await stand(s, at)
        if (replay === 'popup' || replay === 'poi') await played(() => REPLAYS[replay](s, demo, nowMs))
      }
      await stand(s, at)
      cameras[at] = s.handle().map?.camera() ?? cameras[at] ?? null
      lightStep(s, at)
      await landed(s)
      // The light first, and the words a moment after, so the eye is already
      // where the words send it.
      if (shown !== at) await sleep(s, TEXT_AFTER_LIGHT_MS)
      shown = at
      phase = 'read'
      pulse += 1
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
      pointer.hide()
      // What the step changed, once the screen has stopped moving: shown in
      // the free map or scrolled whole into view, and lit in place of what
      // was pressed.
      await settled(s)
      const was = JSON.stringify(measure(targets()))
      const lit = await RESULTS[TOUR_STEPS[at].key](s, demo, nowMs)
      s.light(lit)
      const finishedEarly = hurried
      unhurry()
      if (!finishedEarly) {
        await landed(s)
        check(s)
        phase = 'hold'
        render()
        await frame(s)
        publishResult(lit())
        // Long enough to see what the light moved onto, where it moved.
        await sleep(s, JSON.stringify(measure(targets())) === was ? PACE.holdMs : PACE.resultMs)
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
