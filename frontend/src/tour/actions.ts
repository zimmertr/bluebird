import {
  PACE,
  type Stage,
  type Target,
  boxOf,
  fitPopup,
  clickMap,
  find,
  frame,
  key,
  mapSettled,
  press,
  pressField,
  reveal,
  setValue,
  showValue,
  sleep,
  type,
  until,
} from './act'
import { type Box, clip } from './place'
import {
  AQI_BOUND,
  CLICKED,
  DEMO_MODEL,
  HOURS,
  PASTED,
  RING,
  type Replay,
  SEARCH_QUERY,
  castPlaces,
  type DemoData,
  overlayOutline,
} from './scenario'
import { dayKey } from '../utils/calendarDates'
import { tourSelector } from '../utils/tourSteps'

// What each step of the tutorial does (#536), keyed on the step's name in
// `utils/tourSteps.ts`. A step with no action only points. Each action runs on
// the demo copy of the app from the state `scenario.stateBefore` describes,
// and leaves it in the state the next step's `stateBefore` describes; the
// tests hold the two to each other.
//
// Nothing moves until the reader presses Next: a card is read first, then its
// action plays. So each action begins by lighting what it is about to touch.

export type Action = (stage: Stage, demo: DemoData, nowMs: number) => Promise<void>

// Every control a step presses is found by its `data-tour` marker, or an
// option in a list by the value it stands for (a model id, a day, a layer),
// never by the words on it: a relabelled button must not stall a step.
// `actions.test.ts` holds each marker named here to exactly one component.

const area = (stage: Stage, anchor: string) => find(stage, tourSelector(anchor))
const mapPopup = (stage: Stage) => find(stage, '.maplibregl-popup')
const searchMenu = (stage: Stage) => area(stage, 'search-results')
const modelList = (stage: Stage) => area(stage, 'model-list')
// The model list's card, which holds the Ranking and Comparing chips above the
// list itself.
const modelCard = (stage: Stage) => modelList(stage)?.parentElement ?? null
const modelTrigger = (stage: Stage) => area(stage, 'model-trigger') as HTMLButtonElement | null
const firstRowButton = (stage: Stage) =>
  area(stage, 'results')?.querySelector<HTMLButtonElement>(tourSelector('row-center')) ?? null
const highestAqi = (stage: Stage) => find<HTMLInputElement>(stage, 'input[id$="-air-quality-upper"]')
// The model list's Ranking and Comparing groups, above the list itself.
const modelChips = (stage: Stage) => modelCard(stage)?.querySelector('[role="toolbar"]') ?? null
// The results bar, which carries the count of places named so far.
const resultsBar = (stage: Stage) => find(stage, '[data-results-sheet]')

/** The smallest box around every one of `boxes`, or null where none is on screen. */
function union(...boxes: (Box | null | undefined)[]): Box | null {
  const on = boxes.filter((b): b is Box => Boolean(b))
  if (on.length === 0) return null
  return {
    left: Math.min(...on.map((b) => b.left)),
    top: Math.min(...on.map((b) => b.top)),
    right: Math.max(...on.map((b) => b.right)),
    bottom: Math.max(...on.map((b) => b.bottom)),
  }
}

const boxIf = (el: Element | null | undefined) => (el ? boxOf(el) : null)

// The air-quality row of the Metrics table, from its name to its highest box:
// the field alone is too small a light to find.
function aqiRow(stage: Stage): Box | null {
  const name = find(stage, 'input[type="radio"][value="aqi"]')?.closest('label')
  return union(boxIf(name), boxIf(highestAqi(stage)))
}

// The Layers button and the menu it opens, which hangs below it outside its box.
function layersAndMenu(stage: Stage): Box | null {
  const button = area(stage, 'layers')
  const menu = find(stage, 'input[value="smoke"]')?.closest('label')?.parentElement?.closest('div[class*="absolute"]')
  return union(boxIf(button?.parentElement), boxIf(menu))
}

// A table row, as far as its cells reach: the table itself can stand wider.
function rowCells(row: Element | null | undefined): Box | null {
  const cells = row ? [...row.children] : []
  if (cells.length === 0) return null
  return union(...cells.map(boxOf).filter((b) => b.right > b.left))
}

// The radius of a result's marker on the map, and a little room round it.
const MARKER_RADIUS_PX = 16

/**
 * A popup and the marker it stands on, as one lit area, so the reader sees
 * which place it belongs to. Marked as a popup for the browser suite.
 */
function popupAndMarker(stage: Stage, at: Point): Box | null {
  const popup = mapPopup(stage)
  if (!popup) return null
  const [dot] = onScreen(stage, [at])
  const marker = dot
    ? { left: dot[0] - MARKER_RADIUS_PX, top: dot[1] - MARKER_RADIUS_PX, right: dot[0] + MARKER_RADIUS_PX, bottom: dot[1] + MARKER_RADIUS_PX }
    : null
  const box = union(boxOf(popup), marker)
  return box && Object.assign(box, { popup: true })
}

// A drawer that slides in has to finish before a control in it is measured,
// and on a desktop, where it is docked, this resolves at once.
async function drawer(stage: Stage, open: boolean): Promise<void> {
  const handle = stage.handle()
  if (handle.isDesktop || handle.sidebarOpen === open) return
  handle.setSidebarOpen(open)
  await sleep(stage, 400)
}

/**
 * What a step lights while its card is read, where that is more than the
 * elements its anchors name: the map a step acts on, a popup, a table row.
 * Everything else lights its anchors.
 */
export const LIGHTS: Readonly<Record<string, (stage: Stage, demo: DemoData) => Target[]>> = {
  'map-click': (stage) => [stage.freeMap()],
  'map-add': (stage, demo) => [popupAndMarker(stage, clickedPoint(demo))],
  'draw-corners': (stage) => [stage.freeMap()],
  'model-rank': (stage) => [modelChips(stage) ?? area(stage, 'model')],
  // A phone's drawer covers the table while the field is read.
  bound: (stage) => (stage.handle().isDesktop ? [area(stage, 'results'), aqiRow(stage)] : [aqiRow(stage)]),
  row: (stage) => [rowCells(firstRowButton(stage)?.closest('tr'))],
  popup: (stage) => [popupAndMarker(stage, topPoint(stage))],
  // The three tools as the one run of the bar they stand in: each alone is a
  // sliver, and the bar leaves no room to grow them.
  tools: (stage) => [union(boxIf(area(stage, 'results-mode')), boxIf(area(stage, 'columns')), boxIf(area(stage, 'download')))],
  // The line of links the Tutorial link stands in: the link alone is a sliver.
  tutorial: (stage) => [area(stage, 'tutorial')?.parentElement],
  // The card is about the markers and what their colours mean.
  legend: (stage) => [area(stage, 'legend'), pointsBox(stage, stage.handle().results)],
}

// The margin a framed step leaves inside the free map, which already keeps
// its own gap from the card and the map's chrome: a marker's radius and the
// name under it.
const FRAME_PAD_PX = 32
// How much of the free map a framed set of places spans, at least, along its
// longer side. The browser suite holds the same share.
export const FRAMED_SPREAD = 0.7

const clickedPoint = (demo: DemoData): Point => {
  const { clicked } = castPlaces(demo)
  return { latitude: clicked.lat, longitude: clicked.lon }
}
const topPoint = (stage: Stage): Point => stage.handle().results[0] ?? { latitude: 0, longitude: 0 }

/** Where each of `points` stands on the screen now. */
function onScreen(stage: Stage, points: { latitude: number; longitude: number }[]): [number, number][] {
  const map = stage.handle().map
  return points.flatMap((p) => {
    const at = map?.project(p.longitude, p.latitude)
    return at ? [[at.x, at.y] as [number, number]] : []
  })
}

/**
 * Fits the demo map so `points` fill the free map, and waits for it to land.
 * Leaves where each point stands, and the free map, for the browser suite,
 * which holds every point inside it and the points spread across it.
 */
async function frameAll(stage: Stage, points: { latitude: number; longitude: number }[]): Promise<void> {
  const map = await until(stage, () => stage.handle().map)
  await mapSettled(stage)
  // One flight per move: where the move before already framed them, the
  // camera stays.
  if (!framed(stage, points)) {
    map.fitToPoints(points, FRAME_PAD_PX)
    await sleep(stage, 100)
    await mapSettled(stage)
  }
  stage.root.dataset.tourFramed = JSON.stringify({
    points: onScreen(stage, points).map(([x, y]) => [Math.round(x), Math.round(y)]),
    free: stage.freeMap(),
  })
}

type Point = { latitude: number; longitude: number }

/**
 * Whether `points` already stand framed in the free map: every one inside it
 * by the frame's margin, and, for three or more, spread over most of it, so
 * the camera is not left far out.
 */
function framed(stage: Stage, points: Point[]): boolean {
  const free = stage.freeMap()
  const at = onScreen(stage, points)
  if (!free || at.length < points.length) return false
  const inside = at.every(
    ([x, y]) =>
      x >= free.left + FRAME_PAD_PX && x <= free.right - FRAME_PAD_PX && y >= free.top + FRAME_PAD_PX && y <= free.bottom - FRAME_PAD_PX,
  )
  if (!inside || at.length < 3) return inside
  const xs = at.map(([x]) => x)
  const ys = at.map(([, y]) => y)
  const spread = Math.max(
    (Math.max(...xs) - Math.min(...xs)) / (free.right - free.left),
    (Math.max(...ys) - Math.min(...ys)) / (free.bottom - free.top),
  )
  return spread >= FRAMED_SPREAD
}

/** The box of `points` on screen, with room for a marker and its name, inside the free map. */
function pointsBox(stage: Stage, points: Point[]): Target {
  const at = onScreen(stage, points)
  const free = stage.freeMap()
  if (at.length === 0 || !free) return null
  const xs = at.map(([x]) => x)
  const ys = at.map(([, y]) => y)
  const box = {
    left: Math.min(...xs) - FRAME_PAD_PX,
    top: Math.min(...ys) - FRAME_PAD_PX,
    right: Math.max(...xs) + FRAME_PAD_PX,
    bottom: Math.max(...ys) + FRAME_PAD_PX,
  }
  return clip(box, free)
}

/**
 * Where a step that only points stands the camera before its card is read,
 * so what the card names is on screen.
 */
export const FRAMES: Readonly<Record<string, (stage: Stage) => Promise<void>>> = {
  // The colored markers: every row the bound left, after the row step flew
  // in to one of them.
  async legend(stage) {
    await frameAll(stage, stage.handle().results)
  },
}

// Every place the analysis ranks, before it has ranked them: the two added
// on the map, the two pasted, and the recorded peaks inside the drawn ring,
// which is a rectangle.
function castPoints(demo: DemoData): Point[] {
  const { searched, clicked } = castPlaces(demo)
  const lngs = RING.map(([lng]) => lng)
  const lats = RING.map(([, lat]) => lat)
  const inRing = demo.pool.filter(
    (d) =>
      d.longitude >= Math.min(...lngs) && d.longitude <= Math.max(...lngs) && d.latitude >= Math.min(...lats) && d.latitude <= Math.max(...lats),
  )
  return [
    { latitude: searched.lat, longitude: searched.lon },
    { latitude: clicked.lat, longitude: clicked.lon },
    ...pastedPlaces(),
    ...inRing.map((d) => ({ latitude: d.latitude, longitude: d.longitude })),
  ]
}

// The flight to the ring's corners is short: the map is already over them.
const RING_FIT_MS = 800

export const ACTIONS: Readonly<Record<string, Action>> = {
  async search(stage) {
    const box = await until(stage, () => area(stage, 'search'))
    stage.light(() => [box, searchMenu(stage)])
    const input = await until(stage, () => box.querySelector<HTMLInputElement>('input'))
    await type(stage, input, SEARCH_QUERY)
    key(input, 'Enter')
    // The first result is the Washington volcano; the rest of the menu is the
    // other four Glacier Peaks the search knows.
    const first = await until(stage, () => searchMenu(stage)?.querySelector<HTMLButtonElement>('button'))
    await press(stage, first)
    stage.pointer.hide()
    // The map flies to the pick, into the free map, which is where it lands.
    stage.light(() => [stage.freeMap()])
    await sleep(stage, 100)
    await mapSettled(stage)
  },

  async 'map-click'(stage, demo) {
    const { clicked } = castPlaces(demo)
    stage.light(() => [stage.freeMap()])
    const map = await until(stage, () => stage.handle().map)
    map.flyTo(clicked.lon, clicked.lat, CLICKED.zoom, PACE.flightMs)
    await sleep(stage, 100)
    await mapSettled(stage)
    // The label's own hit box where placement drew one; its summit otherwise.
    const at = map.poiAt(clicked.label, clicked.lon, clicked.lat) ?? map.project(clicked.lon, clicked.lat)
    if (at) await clickMap(stage, at)
    // Placement decides at run time whether a click can land on a label, so
    // where none answered, the popup is opened the way the click would have.
    if (!(await until(stage, () => mapPopup(stage), 1500).catch(() => null))) map.openPoi(clicked)
    await until(stage, () => mapPopup(stage))
    await fitPopup(stage, () => mapPopup(stage))
    stage.light(() => [popupAndMarker(stage, clickedPoint(demo))])
  },

  async 'map-add'(stage, demo) {
    const popup = await until(stage, () => mapPopup(stage))
    stage.light(() => [popupAndMarker(stage, clickedPoint(demo))])
    const add = await until(stage, () => popup.querySelector<HTMLButtonElement>('[data-poi-action="add"]'))
    await press(stage, add)
  },

  async 'draw-start'(stage) {
    stage.light(() => [area(stage, 'polygon')])
    await press(stage, await until(stage, () => area(stage, 'draw-start')))
    // A phone's drawer closes as drawing starts, so the ring is placed on a
    // map the reader can see.
  },

  async 'draw-corners'(stage) {
    const ring = RING.map(([lng, lat]) => ({ latitude: lat, longitude: lng }))
    stage.light(() => [stage.freeMap()])
    const map = await until(stage, () => stage.handle().map)
    map.fitToPoints(ring, undefined, RING_FIT_MS)
    await sleep(stage, 100)
    await mapSettled(stage)
    // Where the corners land, so the ring is drawn in the light.
    stage.light(() => [pointsBox(stage, ring)])
    // Corners follow one another quicker than a press on a control: it is one
    // gesture, and the reader has seen the first corner land.
    for (const [lng, lat] of RING) {
      const at = map.project(lng, lat)
      if (at) await clickMap(stage, at, 250)
    }
  },

  async 'draw-done'(stage) {
    stage.light(() => [area(stage, 'polygon')])
    await press(stage, await until(stage, () => area(stage, 'draw-finish')))
    const peaks = await until(stage, () => area(stage, 'polygon')?.querySelector<HTMLInputElement>('input[value="peak"]'))
    if (!peaks.checked) await press(stage, peaks)
  },

  async paste(stage) {
    const section = await until(stage, () => area(stage, 'coordinates'))
    stage.light(() => [section])
    const field = await until(stage, () => section.querySelector('textarea'))
    await pressField(stage, field)
    await sleep(stage, PACE.pressPauseMs)
    // A paste, so the app frames the pasted rows on the map as it does for a
    // reader's paste; on a desktop the light takes in where they land.
    if (stage.handle().isDesktop) stage.light(() => [section, pointsBox(stage, pastedPlaces())])
    field.dispatchEvent(new Event('paste', { bubbles: true }))
    setValue(field, PASTED)
    await sleep(stage, PACE.pressPauseMs)
  },

  async 'model-pick'(stage) {
    // The row while the list is shut, and the list, which covers it, once open.
    stage.light(() => [modelCard(stage) ?? area(stage, 'model')])
    await press(stage, await until(stage, () => modelTrigger(stage)))
    // The box that changes, not the row's words beside it.
    const box = await until(stage, () =>
      modelList(stage)?.querySelector<HTMLInputElement>(`[role="option"][id$="-option-${DEMO_MODEL}"] input[type="checkbox"]`),
    )
    await press(stage, box)
  },

  async 'model-rank'(stage) {
    stage.light(() => [modelChips(stage) ?? area(stage, 'model')])
    // Ticked, the model joined the chart. Its chip under Comparing makes it the
    // ranking model, and the one it replaced is then taken off.
    const chip = () =>
      modelCard(stage)?.querySelector<HTMLButtonElement>(`${tourSelector('model-chip')}[data-model="${DEMO_MODEL}"]`)
    await press(stage, await until(stage, chip))
    // The model it replaced, now compared beside it, is taken off.
    const old = await until(stage, () =>
      [...(modelCard(stage)?.querySelectorAll<HTMLButtonElement>(tourSelector('model-remove')) ?? [])].find(
        (b) => b.dataset.model !== DEMO_MODEL && !b.disabled,
      ),
    )
    await press(stage, old)
    await press(stage, await until(stage, () => modelTrigger(stage)))
  },

  async 'window-day'(stage, _demo, nowMs) {
    const section = await until(stage, () => area(stage, 'calendar'))
    stage.light(() => [area(stage, 'calendar')])
    await press(stage, await until(stage, () => area(stage, 'window-dates')))
    const tomorrow = dayKey(new Date(nowMs + 86_400_000))
    const cell = () => section.querySelector<HTMLButtonElement>(`[data-day="${tomorrow}"]`)
    // Tomorrow is next month's first day at the end of a month.
    await until(stage, () => section.querySelector('[data-day]'))
    const next = area(stage, 'next-month')
    if (!cell() && next) await press(stage, next)
    await press(stage, await until(stage, cell))
  },

  async 'window-hours'(stage) {
    const section = await until(stage, () => area(stage, 'calendar'))
    stage.light(() => [area(stage, 'calendar')])
    await press(stage, await until(stage, () => area(stage, 'window-hourly')))
    const times = await until(stage, () => {
      const found = section.querySelectorAll<HTMLInputElement>('input[type="time"]')
      return found.length === 2 && found
    })
    for (const [field, value] of [[times[0], HOURS.start], [times[1], HOURS.end]] as const) {
      await pressField(stage, field)
      setValue(field, value)
      await sleep(stage, PACE.pressPauseMs)
    }
  },

  async analyze(stage, demo) {
    const button = await until(stage, () => area(stage, 'analyze'))
    stage.light(() => [button])
    const before = stage.handle().analysisSeq
    await press(stage, button)
    stage.pointer.hide()
    // The map frames every place the analysis ranks while it runs, so the
    // coloured markers arrive in the light.
    const cast = castPoints(demo)
    stage.handle().map?.fitToPoints(cast, FRAME_PAD_PX)
    stage.light(() => [find(stage, tourSelector('progress')) ?? button, pointsBox(stage, cast)])
    await until(stage, () => stage.handle().analysisSeq > before && !stage.handle().loading, 30_000)
  },

  async layers(stage, _demo, nowMs) {
    const button = await until(stage, () => area(stage, 'layers'))
    const overlay = overlayOutline(nowMs)
    // The camera goes to where the fire will be drawn while the pointer goes
    // to Layers, so both switches are seen to draw what they turn on.
    stage.handle().map?.fitToPoints(overlay, FRAME_PAD_PX)
    stage.light(() => [layersAndMenu(stage), pointsBox(stage, overlay)])
    await press(stage, button)
    await mapSettled(stage)
    for (const layer of ['fires', 'smoke']) {
      const box = await until(stage, () => button.parentElement?.querySelector<HTMLInputElement>(`input[value="${layer}"]`))
      if (!box.checked) await press(stage, box)
    }
    await press(stage, button)
  },

  async bound(stage) {
    const table = () => area(stage, 'results')
    stage.light(() => (stage.handle().isDesktop ? [table(), aqiRow(stage)] : [aqiRow(stage)]))
    // On a phone the bound is in the drawer, which covers the table: it stays
    // open for the typing and closes so the reader sees the rows that are left.
    await drawer(stage, true)
    const field = await until(stage, () => highestAqi(stage))
    await reveal(stage, field)
    await pressField(stage, field)
    // Typed a figure at a time as the reader sees it, and handed to the app
    // once whole: the app applies a bound on every keystroke, and a highest
    // AQI of 1, then 15, on the way to 150 would empty the table twice.
    for (let i = 1; i <= String(AQI_BOUND).length; i++) {
      showValue(field, String(AQI_BOUND).slice(0, i))
      await sleep(stage, PACE.typeMs)
    }
    await sleep(stage, PACE.pressPauseMs)
    setValue(field, String(AQI_BOUND))
    await sleep(stage, PACE.pressPauseMs)
    stage.pointer.hide()
    await drawer(stage, false)
    stage.light(() => [table()])
    await frame(stage)
  },

  async row(stage) {
    const center = await until(stage, () => firstRowButton(stage))
    stage.light(() => [rowCells(center.closest('tr'))])
    await press(stage, center)
    stage.pointer.hide()
    // The map flies to the row while the results fold, and the popup it opens
    // is lit once it stands in the free map, not chased on the way.
    stage.light(() => [stage.freeMap()])
    const handle = stage.handle()
    if (!handle.resultsCollapsed) handle.toggleCollapsed()
    await until(stage, () => mapPopup(stage), 3000)
    await sleep(stage, 100)
    await mapSettled(stage)
    await fitPopup(stage, () => mapPopup(stage))
  },
}

/**
 * What each acted step changes, shown and lit once its action ends: a panel
 * section scrolled whole into view, a popup, or places on the map framed into
 * the free map and lit as one box. Every step in `ACTIONS` names one, which
 * `actions.test.ts` holds, so a step never ends with its light on what it
 * pressed while what that press did stands dim or off the screen. Each answers
 * what to light, measured again every frame.
 */
export type Result = (stage: Stage, demo: DemoData, nowMs: number) => Promise<() => Target[]>

// A panel section, scrolled so all of it shows where it fits, or, taller than
// the panel, from the end `from` names.
function section(anchor: string, from: 'top' | 'bottom' = 'top'): Result {
  return async (stage) => {
    const el = await until(stage, () => area(stage, anchor))
    await reveal(stage, el, undefined, from)
    return () => [area(stage, anchor)]
  }
}

// Places on the map, framed into the free map.
function places(which: (stage: Stage, demo: DemoData, nowMs: number) => Point[]): Result {
  return async (stage, demo, nowMs) => {
    const points = which(stage, demo, nowMs)
    await frameAll(stage, points)
    return () => [pointsBox(stage, points)]
  }
}

const popupResult =
  (at: (stage: Stage, demo: DemoData) => Point): Result =>
  async (stage, demo) =>
  () => [popupAndMarker(stage, at(stage, demo))]

// The pasted lines, as the places they name.
const pastedPlaces = (): Point[] =>
  PASTED.split('\n').map((line) => {
    const [lat, lon] = line.split(',').map(Number)
    return { latitude: lat, longitude: lon }
  })

export const RESULTS: Readonly<Record<string, Result>> = {
  search: places((_stage, demo) => {
    const { searched } = castPlaces(demo)
    return [{ latitude: searched.lat, longitude: searched.lon }]
  }),
  'map-click': popupResult((_stage, demo) => clickedPoint(demo)),
  // The popup's work is done: it closes, as the reader would close it, and
  // the new pin is lit, with the results bar that counts it on a desktop. A
  // phone's bar stands under the card.
  async 'map-add'(stage, demo) {
    stage.handle().map?.closePopups()
    await frame(stage)
    const pin = [clickedPoint(demo)]
    return () => [pointsBox(stage, pin), stage.handle().isDesktop ? resultsBar(stage) : null]
  },
  // A desktop shows draw mode in the panel; a phone's drawer closes, and what
  // the app shows then is the map, waiting for the first corner.
  async 'draw-start'(stage, demo, nowMs) {
    if (stage.handle().isDesktop) return section('polygon')(stage, demo, nowMs)
    return () => [stage.freeMap()]
  },
  async 'draw-corners'(stage) {
    const ring = RING.map(([lng, lat]) => ({ latitude: lat, longitude: lng }))
    return () => [pointsBox(stage, ring)]
  },
  'draw-done': section('polygon'),
  // The pasted lines, and on a desktop the places they add, which the app
  // frames itself.
  async paste(stage, demo, nowMs) {
    const lit = await section('coordinates')(stage, demo, nowMs)
    if (!stage.handle().isDesktop) return lit
    await mapSettled(stage)
    return () => [...lit(), pointsBox(stage, pastedPlaces())]
  },
  async 'model-pick'(stage) {
    return () => [modelCard(stage) ?? area(stage, 'model')]
  },
  'model-rank': section('model'),
  // The picked day is somewhere in the grid, and a phone's panel cannot show
  // the grid's last row together with the When row above it: the grid wins.
  'window-day': section('calendar', 'bottom'),
  'window-hours': section('calendar', 'bottom'),
  // The ranked markers, and on a desktop the results bar that opened under
  // them. A phone's bar stands under the card.
  async analyze(stage, demo, nowMs) {
    const lit = await places((s) => s.handle().results)(stage, demo, nowMs)
    return () => [...lit(), stage.handle().isDesktop ? resultsBar(stage) : null]
  },
  // The fire and its whole plume, near enough to read.
  layers: places((_stage, _demo, nowMs) => overlayOutline(nowMs)),
  async bound(stage) {
    return () => [area(stage, 'results')]
  },
  row: popupResult((stage) => topPoint(stage)),
}

/**
 * Plays a press again on a freshly mounted demo, for what a link cannot hold
 * (`scenario.Replay`). Runs instantly with the pointer hidden, since the reader
 * saw it the first time.
 */
export const REPLAYS: Readonly<Record<Replay, Action>> = {
  async poi(stage, demo) {
    stage.handle().map?.openPoi(castPlaces(demo).clicked)
    await until(stage, () => mapPopup(stage))
    await fitPopup(stage, () => mapPopup(stage))
  },
  // Draw polygon, and over a placed ring the same button, which reads Edit.
  async draw(stage) {
    ;(await until(stage, () => area(stage, 'draw-start'))).click()
    await frame(stage)
  },
  async 'edit-ring'(stage) {
    ;(await until(stage, () => area(stage, 'draw-start'))).click()
    await frame(stage)
  },
  async 'model-list'(stage) {
    ;(await until(stage, () => modelTrigger(stage))).click()
    await until(stage, () => modelList(stage))
  },
  async popup(stage) {
    const [top] = stage.handle().results
    if (top) stage.handle().map?.focusResult(top)
    await until(stage, () => mapPopup(stage), 3000)
    await mapSettled(stage)
    await fitPopup(stage, () => mapPopup(stage))
  },
}
