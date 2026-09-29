import type { Page } from '@playwright/test'
import { test, expect, DESTINATION_NAMES } from './fixtures'
import { TOUR_STEPS, phoneEdge, progressText } from '../src/utils/tourSteps'
import { AQI_BOUND } from '../src/tour/scenario'

// The tutorial (#536) acts every step out on a demo copy of the app. What is
// held here, at a desktop and at a phone width, is what makes it readable:
// every step's card shows first and stands in one place, nothing it lights or
// opens is under it, the keys move it, and the reader's page is exactly as it
// was afterwards, with nothing asked of the pod or of Open-Meteo meanwhile.
const STEPS = TOUR_STEPS.length
// Glacier Peak searched, Dome Peak clicked, five peaks in the ring, two pasted.
const DEMO_ROWS = 9
// The panel steps lit by the section they name, which is every panel step but
// the one that lights the open model list.
const SECTION_LIT = new Set(
  TOUR_STEPS.filter((s) => s.place === 'panel' && s.anchors.length === 1 && s.key !== 'model-rank').map((s) => s.key),
)
const OPEN_METEO = ['api.open-meteo.com', 'air-quality-api.open-meteo.com', 'archive-api.open-meteo.com']

type Box = { left: number; top: number; right: number; bottom: number }

// Every request the page sends from now on, for the ones the tutorial must
// not make: the pod's API and Open-Meteo.
function watchRequests(page: Page): string[] {
  const seen: string[] = []
  page.on('request', (r) => {
    const url = new URL(r.url())
    if (url.pathname.startsWith('/api/') || OPEN_METEO.includes(url.hostname)) seen.push(r.url())
  })
  return seen
}

// The address bar once the app has finished writing it: unchanged for longer
// than its write debounce.
async function settledUrl(page: Page): Promise<string> {
  let last = page.url()
  for (let quiet = 0; quiet < 1000; quiet += 250) {
    await page.waitForTimeout(250)
    if (page.url() !== last) {
      last = page.url()
      quiet = -250
    }
  }
  return last
}

async function storage(page: Page) {
  return page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }))
}

const card = (page: Page) => page.locator('[data-tour-card]')
const demoRows = (page: Page) => page.locator('[data-tour-sandbox] table tbody tr')
const rowNames = (page: Page) => demoRows(page).locator('button[aria-label^="Center map on"]').allTextContents()

// Waits until step `i`'s card is up and nothing is moving.
async function reading(page: Page, i: number) {
  await expect(card(page)).toHaveAttribute('data-step', TOUR_STEPS[i].key, { timeout: 30_000 })
  await expect(card(page)).toHaveAttribute('data-phase', 'read', { timeout: 30_000 })
  // The lit areas glide to their targets; the step is read once they stand.
  const drawn = () => page.locator('[data-tour-dim]').getAttribute('data-holes')
  let last = await drawn()
  for (let quiet = 0; quiet < 2; ) {
    await page.waitForTimeout(150)
    const now = await drawn()
    quiet = now === last ? quiet + 1 : 0
    last = now
  }
}

// What stands on screen: the card, what it lights, and every list, dialog and
// map popup the demo has open.
async function scene(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    }
    const reader = document.getElementById('root')!
    const cardEl = document.querySelector('[data-tour-card]')!
    const holes = JSON.parse(document.querySelector('[data-tour-dim]')?.getAttribute('data-holes') ?? '[]') as number[][]
    const open = [...document.querySelectorAll('[role="listbox"], [role="dialog"], .maplibregl-popup')]
      .filter((el) => !reader.contains(el) && el !== cardEl && el.getBoundingClientRect().height > 0)
      .map((el) => ({ what: el.getAttribute('aria-label') ?? el.className, box: box(el) }))
    return {
      card: box(cardEl),
      holes: holes.map(([left, top, right, bottom]) => ({ left, top, right, bottom })),
      open,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    }
  })
}

const meets = (a: Box, b: Box) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1

// The rules every step keeps, at every width.
async function holdsTheRules(page: Page, i: number, still: Map<string, Box>) {
  const key = TOUR_STEPS[i].key
  const { card: c, holes, open, viewport } = await scene(page)
  expect(holes.length, `${key} lights something`).toBeGreaterThan(0)
  for (const h of holes) {
    expect(h.right - h.left, `${key} lights a target on screen`).toBeGreaterThan(0)
    expect(h.left >= -6 && h.top >= -6 && h.right <= viewport.width + 6 && h.bottom <= viewport.height + 6, `${key}: ${JSON.stringify(h)} in view`).toBe(true)
    expect(meets(c, h), `${key}: the card covers what it lights ${JSON.stringify(h)}`).toBe(false)
  }
  for (const o of open) expect(meets(c, o.box), `${key}: the card covers ${o.what}`).toBe(false)
  // A map popup stands clear of the map's own button columns too.
  const chrome = await mapChrome(page)
  for (const o of open.filter((o) => o.what.includes('maplibregl-popup'))) {
    for (const [name, box] of Object.entries(chrome)) {
      if (box && name !== 'legend' && name !== 'player') expect(meets(o.box, box), `${key}: a popup under the ${name}`).toBe(false)
    }
  }
  if (SECTION_LIT.has(key)) await litOnItsSection(page, key, TOUR_STEPS[i].anchors[0], holes[0])
  // One place for the whole run, apart from a phone's one switch of edge.
  const edge = viewport.width < 1024 ? phoneEdge(i) : 'map'
  const first = still.get(edge)
  if (first) expect(c, `${key}: the card stands where it stood`).toEqual(first)
  else still.set(edge, c)
  await expect(card(page).getByRole('heading')).toHaveText(TOUR_STEPS[i].section)
  await expect(card(page)).toContainText(progressText(TOUR_STEPS[i]))
}

// The map's own chrome in the demo, each as its box on screen, or null.
async function mapChrome(page: Page) {
  return page.evaluate(() => {
    const demo = document.querySelector('[data-tour-sandbox]')!
    const box = (selector: string) => {
      const el = demo.querySelector(selector)
      const r = el?.getBoundingClientRect()
      return r && r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null
    }
    return {
      column: box('[data-map-column]'),
      buttons: box('.maplibregl-ctrl-top-right'),
      legend: box('[data-tour="legend"]'),
      player: box('[data-tour="player"]'),
    }
  })
}

// A panel step lights exactly its section as far as it shows, and shows all
// of it where it fits: whole in its scrolling panel, or its top at the top.
async function litOnItsSection(page: Page, key: string, anchor: string, hole: Box) {
  const { section, visible, fits } = await page.evaluate((anchor) => {
    const el = document.querySelector(`[data-tour-sandbox] [data-tour="${anchor}"]`)!
    const r = el.getBoundingClientRect()
    let scroller: Element | null = null
    for (let at = el.parentElement; at; at = at.parentElement) {
      const { overflowY } = getComputedStyle(at)
      if ((overflowY === 'auto' || overflowY === 'scroll') && at.scrollHeight > at.clientHeight) {
        scroller = at
        break
      }
    }
    const s = scroller?.getBoundingClientRect() ?? { left: 0, top: 0, right: innerWidth, bottom: innerHeight, height: innerHeight }
    const visible = {
      left: Math.max(r.left, s.left, 0),
      top: Math.max(r.top, s.top, 0),
      right: Math.min(r.right, s.right, innerWidth),
      bottom: Math.min(r.bottom, s.bottom, innerHeight),
    }
    return {
      section: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
      visible,
      fits: r.height <= s.height - 16 ? 'whole' : { top: s.top },
    }
  }, anchor)
  for (const side of ['left', 'top', 'right', 'bottom'] as const) {
    expect(Math.abs(hole[side] - visible[side]), `${key}: the light's ${side} is on its section`).toBeLessThanOrEqual(2)
  }
  if (fits === 'whole') expect(visible, `${key}: its section shows whole`).toEqual(section)
  else expect(Math.abs(section.top - fits.top - 8), `${key}: its section's top at the top`).toBeLessThanOrEqual(2)
}

// The table in a ranking step: every row whole on a desktop, with the three
// air-quality columns; on a phone, each row that shows with its name and its
// average beside it. Answers the names in order and each row's worst hour.
async function rankingRows(page: Page, desktop: boolean) {
  const seen = await page.evaluate(() => {
    const table = document.querySelector('[data-tour-sandbox] [data-tour="results"]')!
    const t = table.getBoundingClientRect()
    const inside = (r: DOMRect) => r.top >= t.top - 1 && r.bottom <= t.bottom + 1 && r.bottom <= innerHeight + 1
    const across = (r: DOMRect) => r.left >= t.left - 1 && r.right <= Math.min(t.right, innerWidth) + 1
    const heads = [...table.querySelectorAll('thead th')]
    const col = (key: string) => heads.findIndex((th) => th.getAttribute('data-col') === key)
    const rows = [...table.querySelectorAll<HTMLTableRowElement>('tbody tr')].map((tr) => {
      const name = tr.querySelector('button[aria-label^="Center map on"]')!
      const avg = tr.cells[col('aqi_avg')]
      return {
        name: name.textContent ?? '',
        max: Number(tr.cells[col('aqi_max')].textContent),
        whole: inside(tr.getBoundingClientRect()),
        readable: across(name.getBoundingClientRect()) && across(avg.getBoundingClientRect()),
      }
    })
    const aqiHeads = ['aqi_avg', 'aqi_min', 'aqi_max'].every((k) => across(heads[col(k)].getBoundingClientRect()))
    return { rows, aqiHeads }
  })
  if (desktop) {
    for (const r of seen.rows) expect(r.whole, `${r.name} shows whole`).toBe(true)
    expect(seen.aqiHeads, 'the air-quality columns show').toBe(true)
  }
  const shown = seen.rows.filter((r) => r.whole)
  expect(shown.length).toBeGreaterThan(0)
  for (const r of shown) expect(r.readable, `${r.name} shows its name and its average`).toBe(true)
  return seen.rows
}

// What a step framed (the layers step's fire, plume and peaks; the rows the
// legend step colours) stands in the free map, clear of the card and the map's
// own chrome.
async function framedClear(page: Page, desktop: boolean) {
  const points = JSON.parse((await page.locator('[data-tour-sandbox]').getAttribute('data-tour-framed')) ?? '[]') as number[][]
  expect(points.length).toBeGreaterThan(2)
  const { card: c } = await scene(page)
  const chrome = await mapChrome(page)
  const map = await page.locator('[data-tour-sandbox] [data-tour="map"]').boundingBox()
  // A marker is drawn around its point.
  const R = 8
  const pad = (b: Box) => ({ left: b.left - R, top: b.top - R, right: b.right + R, bottom: b.bottom + R })
  // On a phone the legend hangs down the button column over what little map
  // there is, so only the column's buttons are held clear there.
  const held = [c, chrome.column, chrome.buttons, chrome.player, desktop ? chrome.legend : null].filter((b): b is Box => b !== null)
  for (const [x, y] of points) {
    expect(x >= map!.x + R && x <= map!.x + map!.width - R && y >= map!.y + R && y <= map!.y + map!.height - R, `${x},${y} on the map`).toBe(true)
    for (const b of held.map(pad)) {
      expect(x > b.left && x < b.right && y > b.top && y < b.bottom, `${x},${y} under ${JSON.stringify(b)}`).toBe(false)
    }
  }
}

// Moves on from step `i`, by a button or a key in turn, and waits for the next.
async function onward(page: Page, i: number) {
  const way = i % 4
  const key = TOUR_STEPS[i].key
  if (i === STEPS - 1) await card(page).getByRole('button', { name: 'Done' }).click()
  else if (way === 0) await card(page).getByRole('button', { name: 'Next' }).click()
  else if (way === 1) await page.keyboard.press('ArrowRight')
  else if (way === 2) await page.keyboard.press('Enter')
  else await page.keyboard.press('Space')
  if (key === 'layers') {
    await expect(card(page)).toHaveAttribute('data-phase', 'hold', { timeout: 30_000 })
    await framedClear(page, (page.viewportSize()?.width ?? 0) >= 1024)
  }
  if (i < STEPS - 1) await expect(card(page)).not.toHaveAttribute('data-step', key, { timeout: 30_000 })
}

// The whole run, step by step, with what the story promises checked on the way.
async function walk(page: Page) {
  const still = new Map<string, Box>()
  const desktop = (page.viewportSize()?.width ?? 0) >= 1024
  // The rows the bound takes away: those whose worst hour is over it.
  let over: string[] = []
  for (let i = 0; i < STEPS; i++) {
    await reading(page, i)
    await holdsTheRules(page, i, still)
    const key = TOUR_STEPS[i].key
    if (key === 'results') {
      await expect(demoRows(page)).toHaveCount(DEMO_ROWS)
      const rows = await rankingRows(page, desktop)
      over = rows.filter((r) => r.max > AQI_BOUND).map((r) => r.name)
      // The bound has something to take away, and it is the bad end of the ranking.
      expect(over.length).toBeGreaterThan(0)
      expect(rows.slice(-over.length).map((r) => r.name)).toEqual(over)
      // Both overlays on: the legend carries a line for each.
      const legend = page.locator('[data-tour-sandbox] [data-tour="legend"]')
      await expect(legend).toContainText('Active wildfire')
      await expect(legend).toContainText('Smoke')
    }
    if (key === 'bound') await rankingRows(page, desktop)
    // The colored markers: every row the bound left is on the map, in view.
    if (key === 'legend') await framedClear(page, desktop)
    if (key === 'row') {
      const names = await rowNames(page)
      expect(names).toHaveLength(DEMO_ROWS - over.length)
      for (const name of over) expect(names).not.toContain(name)
    }
    await onward(page, i)
  }
}

for (const [width, height] of [[1280, 800], [1366, 768]]) {
test(`at ${width}x${height} the welcome dialog starts a tutorial that acts out every step and leaves nothing behind`, async ({ page, traffic }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width, height })
  // Registered after the fixture's, so this one wins: a first visit.
  await page.addInitScript(() => localStorage.removeItem('bluebird_forecast_welcomed'))
  await page.goto('/')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Take the tutorial' }).click()
  const url = await settledUrl(page)
  // Starting the tutorial counts as having been welcomed; everything after
  // that is the demo's and must leave storage alone.
  expect(await page.evaluate(() => localStorage.getItem('bluebird_forecast_welcomed'))).not.toBeNull()
  const kept = await storage(page)
  const requests = watchRequests(page)

  await walk(page)

  await expect(card(page)).toHaveCount(0)
  await expect(page.locator('[data-tour-dim]')).toHaveCount(0)
  await expect(page.locator('[data-tour-sandbox]')).toHaveCount(0)
  await expect(page.locator('table tbody tr')).toHaveCount(0)
  // Focus goes back to where the tutorial can be opened again.
  await expect(page.locator('#root [data-tour="tutorial"]')).toBeFocused()
  expect(page.url()).toBe(url)
  expect(await storage(page)).toEqual(kept)
  expect(requests).toEqual([])
  for (const host of OPEN_METEO) expect(traffic.answered[host] ?? 0, host).toBe(0)
})
}

test('on a phone every step keeps the rules, and the reader\'s report comes back', async ({ page, traffic }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 360, height: 640 })
  const d1 = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  await page.goto(`/?mode=days&d1=${d1}&d2=${d1}&type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55&analyze=1`)
  const rows = page.locator('#root table tbody tr')
  await expect(rows).toHaveCount(DESTINATION_NAMES.length)
  await expect.poll(() => new URL(page.url()).searchParams.has('analyze')).toBe(false)
  const url = await settledUrl(page)
  const kept = await storage(page)
  const spent = OPEN_METEO.map((host) => traffic.answered[host] ?? 0)

  await page.getByRole('button', { name: 'Open controls' }).click()
  await page.getByRole('button', { name: 'Tutorial' }).click()
  const requests = watchRequests(page)

  await walk(page)

  await expect(card(page)).toHaveCount(0)
  await expect(rows).toHaveCount(DESTINATION_NAMES.length)
  expect(page.url()).toBe(url)
  expect(await storage(page)).toEqual(kept)
  expect(requests).toEqual([])
  expect(OPEN_METEO.map((host) => traffic.answered[host] ?? 0)).toEqual(spent)
})

test('Next finishes a step at once, Previous stands where the step before began, and Escape ends it', async ({ page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 360, height: 640 })
  await page.goto('/')
  // The drawer opens on a fresh page, with the footer's Tutorial in it.
  await page.getByRole('button', { name: 'Tutorial' }).click()
  const requests = watchRequests(page)
  await reading(page, 0)

  // Nothing moves until Next: the search box is empty while the card is read.
  const search = page.locator('[data-tour-sandbox] [data-tour="search"] input')
  await expect(search).toHaveValue('')
  await page.keyboard.press('ArrowRight')
  await expect(card(page)).toHaveAttribute('data-phase', 'acting')
  // Held keys and a second press on the heels of the first do nothing more.
  await page.waitForTimeout(400)
  const started = Date.now()
  await page.keyboard.press('ArrowRight')
  await reading(page, 1)
  expect(Date.now() - started, 'a hurried step lands at once').toBeLessThan(6_000)
  // The search finished: the chosen place's name is in the box.
  await expect(search).toHaveValue('Glacier Peak')

  // Back over a step that acted: the demo stands where that step started.
  await page.keyboard.press('ArrowLeft')
  await reading(page, 0)
  await expect(search).toHaveValue('')

  await page.keyboard.press('Escape')
  await expect(card(page)).toHaveCount(0)
  await expect(page.locator('[data-tour-sandbox]')).toHaveCount(0)
  expect(requests).toEqual([])
})
