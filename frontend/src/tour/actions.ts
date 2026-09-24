import {
  type Stage,
  byText,
  centerOf,
  check,
  clickMap,
  find,
  frame,
  key,
  mapSettled,
  press,
  setValue,
  sleep,
  type,
  until,
} from './act'
import {
  CLICKED,
  DEMO_MODEL,
  FIRE_AT,
  HOURS,
  PLUME_TO,
  PASTED,
  RING,
  SEARCH_QUERY,
  castPlaces,
  type DemoData,
} from './scenario'
import { dayKey } from '../utils/calendarDates'
import { tourSelector } from '../utils/tourSteps'

// What each step of the tutorial does (#536), keyed on the step's name in
// `utils/tourSteps.ts`. A step with no entry only points. Each action runs on
// the demo copy of the app from the state `scenario.stateBefore` describes,
// and leaves it in the state the next step's `stateBefore` describes; the
// tests hold the two to each other.

export type Action = (stage: Stage, demo: DemoData, nowMs: number) => Promise<void>

const area = (stage: Stage, anchor: string) => find(stage, tourSelector(anchor))

// A drawer that slides in has to finish before a control in it is measured,
// and on a desktop, where it is docked, this resolves at once.
async function drawerOpen(stage: Stage): Promise<void> {
  const handle = stage.handle()
  if (handle.isDesktop) return
  handle.setSidebarOpen(true)
  await sleep(stage, 400)
}

async function drawerClosed(stage: Stage): Promise<void> {
  const handle = stage.handle()
  if (handle.isDesktop) return
  handle.setSidebarOpen(false)
  await sleep(stage, 400)
}

export const ACTIONS: Readonly<Record<string, Action>> = {
  async search(stage) {
    const box = await until(stage, () => area(stage, 'search'))
    const menu = () => find(stage, '[role="listbox"][aria-label="Search results"]')
    stage.light(() => [box, menu()])
    const input = await until(stage, () => box.querySelector<HTMLInputElement>('input'))
    await type(stage, input, SEARCH_QUERY)
    key(input, 'Enter')
    // The first result is the Washington volcano; the rest of the menu is the
    // other four Glacier Peaks the search knows.
    const first = await until(stage, () => menu()?.querySelector<HTMLButtonElement>('button'))
    await sleep(stage, 700)
    await press(stage, first)
    await mapSettled(stage)
  },

  async map(stage, demo) {
    const { clicked } = castPlaces(demo)
    stage.light(() => [area(stage, 'map')])
    const map = await until(stage, () => stage.handle().map)
    map.flyTo(clicked.lon, clicked.lat, CLICKED.zoom)
    await sleep(stage, 200)
    await mapSettled(stage)
    const at = map.poiAt(clicked.label, clicked.lon, clicked.lat)
    const add = () => find(stage, '.maplibregl-popup [data-poi-action="add"]')
    if (at) {
      await clickMap(stage, at)
      await until(stage, add, 2000).catch(() => null)
    }
    const button = add()
    if (button) {
      await sleep(stage, 600)
      await press(stage, button)
      return
    }
    // The label was not drawn where a click could land (MapLibre's placement
    // decides at run time), so the peak is added the way the button would.
    stage.handle().addPlace(clicked)
  },

  async polygon(stage) {
    const section = await until(stage, () => area(stage, 'polygon'))
    stage.light(() => [area(stage, 'polygon')])
    await press(stage, await until(stage, () => byText(section, 'button', 'Draw polygon')))
    // A phone's drawer closes as drawing starts, so the ring is placed on a
    // map the reader can see.
    const map = await until(stage, () => stage.handle().map)
    map.fitToPoints(RING.map(([lng, lat]) => ({ latitude: lat, longitude: lng })))
    stage.light(() => [area(stage, 'map')])
    await sleep(stage, 300)
    await mapSettled(stage)
    for (const [lng, lat] of RING) {
      const at = map.project(lng, lat)
      if (at) await clickMap(stage, at)
    }
    await drawerOpen(stage)
    stage.light(() => [area(stage, 'polygon')])
    await frame(stage)
    const polygonSection = await until(stage, () => area(stage, 'polygon'))
    await press(stage, await until(stage, () => byText(polygonSection, 'button', 'Done')))
    const peaks = await until(stage, () => polygonSection.querySelector<HTMLInputElement>('input[value="peak"]'))
    if (!peaks.checked) await press(stage, peaks)
  },

  async coordinates(stage) {
    const section = await until(stage, () => area(stage, 'coordinates'))
    stage.light(() => [section])
    const field = await until(stage, () => section.querySelector('textarea'))
    field.scrollIntoView({ block: 'nearest' })
    await stage.pointer.glide(centerOf(field))
    stage.pointer.press()
    await sleep(stage, 300)
    // A paste, so the app frames the pasted rows on the map as it does for a
    // reader's paste.
    field.dispatchEvent(new Event('paste', { bubbles: true }))
    setValue(field, PASTED)
    await sleep(stage, 800)
  },

  async model(stage) {
    const section = await until(stage, () => area(stage, 'model'))
    const list = () => find(stage, '[role="listbox"][aria-label="Forecast model"]')
    const card = () => list()?.parentElement
    stage.light(() => [section, card()])
    const trigger = await until(stage, () => section.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]'))
    await press(stage, trigger)
    const option = await until(stage, () => list()?.querySelector<HTMLElement>(`[role="option"][id$="-option-${DEMO_MODEL}"]`))
    await sleep(stage, 500)
    await press(stage, option)
    // Ticked, the model joins the chart. Its chip under Comparing makes it the
    // ranking model, and the one it replaces is then taken off.
    const toolbar = () => card()?.querySelector('[role="toolbar"]')
    const chips = () => [...(toolbar()?.querySelectorAll<HTMLButtonElement>('button:not([aria-label])') ?? [])]
    const promote = await until(stage, () => chips().length === 2 && chips()[1])
    await sleep(stage, 400)
    await press(stage, promote)
    const remove = await until(stage, () => {
      const drops = [...(toolbar()?.querySelectorAll<HTMLButtonElement>('button[aria-label^="Remove"]') ?? [])]
      return drops.length === 2 && !drops[1].disabled && drops[1]
    })
    await sleep(stage, 400)
    await press(stage, remove)
    await sleep(stage, 400)
    await press(stage, trigger)
  },

  async calendar(stage, _demo, nowMs) {
    const section = await until(stage, () => area(stage, 'calendar'))
    stage.light(() => [area(stage, 'calendar')])
    await press(stage, await until(stage, () => byText(section, 'button', 'Dates')))
    const tomorrow = dayKey(new Date(nowMs + 86_400_000))
    const cell = () => section.querySelector<HTMLButtonElement>(`[data-day="${tomorrow}"]`)
    // Tomorrow is next month's first day at the end of a month.
    await until(stage, () => section.querySelector('[data-day]'))
    const next = section.querySelector<HTMLButtonElement>('button[aria-label="Next month"]')
    if (!cell() && next) await press(stage, next)
    await press(stage, await until(stage, cell))
    await press(stage, await until(stage, () => byText(section, 'button', 'Hourly')))
    const times = await until(stage, () => {
      const found = section.querySelectorAll<HTMLInputElement>('input[type="time"]')
      return found.length === 2 && found
    })
    for (const [field, value] of [[times[0], HOURS.start], [times[1], HOURS.end]] as const) {
      await stage.pointer.glide(centerOf(field))
      stage.pointer.press()
      setValue(field, value)
      await sleep(stage, 400)
    }
  },

  async metrics(stage) {
    const section = await until(stage, () => area(stage, 'metrics'))
    stage.light(() => [section])
    const radio = await until(stage, () => section.querySelector<HTMLInputElement>('input[type="radio"][value="aqi"]'))
    await sleep(stage, 300)
    await press(stage, radio)
  },

  async analyze(stage) {
    const button = await until(stage, () => area(stage, 'analyze'))
    stage.light(() => [button])
    await press(stage, button)
    const before = stage.handle().analysisSeq
    stage.light(() => [find(stage, tourSelector('progress')) ?? button])
    await until(stage, () => stage.handle().analysisSeq > before && !stage.handle().loading, 30_000)
    // A phone's drawer closes on a finished analysis, onto the ranked markers.
    stage.light(() => [stage.handle().isDesktop ? button : area(stage, 'map')])
  },

  async layers(stage) {
    const button = await until(stage, () => area(stage, 'layers'))
    const cluster = button.parentElement
    stage.light(() => [cluster])
    await press(stage, button)
    for (const layer of ['fires', 'smoke']) {
      const box = await until(stage, () => cluster?.querySelector<HTMLInputElement>(`input[value="${layer}"]`))
      await sleep(stage, 300)
      if (!box.checked) await press(stage, box)
    }
    await sleep(stage, 500)
    await press(stage, button)
    stage.light(() => [area(stage, 'map')])
    stage.pointer.hide()
    // The fire, the whole plume and every ranked peak in one view, so the
    // reader sees which peaks stand in the smoke.
    stage.handle().map?.fitToPoints([
      ...stage.handle().results,
      { latitude: FIRE_AT.lat, longitude: FIRE_AT.lon },
      { latitude: PLUME_TO.lat, longitude: PLUME_TO.lon },
    ])
    await sleep(stage, 300)
    await mapSettled(stage)
  },

  async row(stage) {
    const table = await until(stage, () => area(stage, 'results'))
    const center = await until(stage, () => table.querySelector<HTMLButtonElement>('button[aria-label^="Center map on"]'))
    const row = center.closest('tr')
    stage.light(() => [row])
    await sleep(stage, 400)
    await press(stage, center)
    await until(stage, () => find(stage, '.maplibregl-popup'), 3000).catch(() => null)
    await mapSettled(stage)
  },

  async popup(stage) {
    const popup = () => find(stage, '.maplibregl-popup')
    if (!popup()) {
      const [top] = stage.handle().results
      if (top) stage.handle().map?.focusResult(top)
    }
    await drawerClosed(stage)
    const link = await until(stage, () => popup()?.querySelector<HTMLAnchorElement>('a[href*="windy.com"]'))
    stage.light(() => [popup()])
    await mapSettled(stage)
    // Rests on a number without clicking it: a click opens Windy in a tab.
    await stage.pointer.glide(centerOf(link))
    check(stage)
  },
}
