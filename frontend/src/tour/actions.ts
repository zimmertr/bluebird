import {
  PACE,
  type Stage,
  type Target,
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
  sleep,
  type,
  until,
} from './act'
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
export const LIGHTS: Readonly<Record<string, (stage: Stage) => Target[]>> = {
  'map-click': (stage) => [stage.freeMap()],
  'map-add': (stage) => [mapPopup(stage)],
  'draw-corners': (stage) => [stage.freeMap()],
  'model-rank': (stage) => [modelCard(stage) ?? area(stage, 'model')],
  bound: (stage) => [area(stage, 'results'), highestAqi(stage)],
  row: (stage) => [firstRowButton(stage)?.closest('tr')],
  popup: (stage) => [mapPopup(stage)],
}

/**
 * Fits the demo map to `points` and waits for it to land, then leaves where
 * each point stands on screen for the browser suite, which holds them all
 * inside the free map.
 */
async function frameAll(stage: Stage, points: { latitude: number; longitude: number }[]): Promise<void> {
  const map = await until(stage, () => stage.handle().map)
  map.fitToPoints(points)
  await sleep(stage, 100)
  await mapSettled(stage)
  stage.root.dataset.tourFramed = JSON.stringify(
    points.flatMap((p) => {
      const at = map.project(p.longitude, p.latitude)
      return at ? [[Math.round(at.x), Math.round(at.y)]] : []
    }),
  )
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
    stage.light(() => [mapPopup(stage)])
    await fitPopup(stage, () => mapPopup(stage))
  },

  async 'map-add'(stage) {
    const popup = await until(stage, () => mapPopup(stage))
    stage.light(() => [mapPopup(stage)])
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
    stage.light(() => [stage.freeMap()])
    const map = await until(stage, () => stage.handle().map)
    map.fitToPoints(RING.map(([lng, lat]) => ({ latitude: lat, longitude: lng })))
    await sleep(stage, 100)
    await mapSettled(stage)
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
    // A paste, so the app frames the pasted rows on the map as it does for a
    // reader's paste.
    field.dispatchEvent(new Event('paste', { bubbles: true }))
    setValue(field, PASTED)
    await sleep(stage, PACE.pressPauseMs)
  },

  async 'model-pick'(stage) {
    // The row while the list is shut, and the list, which covers it, once open.
    stage.light(() => [modelCard(stage) ?? area(stage, 'model')])
    await press(stage, await until(stage, () => modelTrigger(stage)))
    const option = await until(stage, () =>
      modelList(stage)?.querySelector<HTMLElement>(`[role="option"][id$="-option-${DEMO_MODEL}"]`),
    )
    await press(stage, option)
  },

  async 'model-rank'(stage) {
    stage.light(() => [modelCard(stage) ?? area(stage, 'model')])
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

  async analyze(stage) {
    const button = await until(stage, () => area(stage, 'analyze'))
    stage.light(() => [button])
    const before = stage.handle().analysisSeq
    await press(stage, button)
    stage.pointer.hide()
    stage.light(() => [find(stage, tourSelector('progress')) ?? button])
    await until(stage, () => stage.handle().analysisSeq > before && !stage.handle().loading, 30_000)
    // A phone's drawer closes on a finished analysis, onto the ranked markers.
    stage.light(() => [stage.handle().isDesktop ? button : stage.freeMap()])
  },

  async layers(stage, _demo, nowMs) {
    const button = await until(stage, () => area(stage, 'layers'))
    const cluster = button.parentElement
    stage.light(() => [cluster])
    await press(stage, button)
    for (const layer of ['fires', 'smoke']) {
      const box = await until(stage, () => cluster?.querySelector<HTMLInputElement>(`input[value="${layer}"]`))
      if (!box.checked) await press(stage, box)
    }
    await press(stage, button)
    stage.pointer.hide()
    stage.light(() => [stage.freeMap()])
    // The fire, the whole plume and every ranked peak in one view, so the
    // reader sees which peaks stand in the smoke.
    await frameAll(stage, [...stage.handle().results, ...overlayOutline(nowMs)])
  },

  async bound(stage) {
    const table = () => area(stage, 'results')
    stage.light(() => [table(), highestAqi(stage)])
    // On a phone the bound is in the drawer, which covers the table: it opens
    // for the typing and closes again so the reader sees the rows leave.
    await drawer(stage, true)
    const field = await until(stage, () => highestAqi(stage))
    // The drawer covers a phone's table while it is open, so only the field is lit.
    if (!stage.handle().isDesktop) stage.light(() => [field])
    await reveal(stage, field)
    await pressField(stage, field)
    // Set whole rather than a digit at a time: a highest AQI of 1, then 10, on
    // the way to 100 would empty the table twice before the rows it is about
    // were seen to leave.
    setValue(field, String(AQI_BOUND))
    await sleep(stage, PACE.pressPauseMs)
    stage.pointer.hide()
    await drawer(stage, false)
    stage.light(() => [table()])
    await frame(stage)
  },

  async row(stage) {
    const center = await until(stage, () => firstRowButton(stage))
    stage.light(() => [center.closest('tr')])
    await press(stage, center)
    stage.pointer.hide()
    // The popup needs more map than the open results leave, so they fold as
    // the map flies: the next step is about the popup.
    const handle = stage.handle()
    if (!handle.resultsCollapsed) handle.toggleCollapsed()
    await until(stage, () => mapPopup(stage), 3000)
    stage.light(() => [mapPopup(stage)])
    await sleep(stage, 100)
    await mapSettled(stage)
    await fitPopup(stage, () => mapPopup(stage))
  },
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
