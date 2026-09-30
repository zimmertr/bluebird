import type { Page } from '@playwright/test'
import { test, expect, DESTINATION_NAMES } from './fixtures'
import { TOUR_STEPS, phoneEdge, progressText } from '../src/utils/tourSteps'
import { AQI_BOUND } from '../src/tour/scenario'
import { ACTIONS, FRAMED_SPREAD, LIGHTS } from '../src/tour/actions'
import { TOUR_HOLE_PAD_PX, TOUR_LIGHT_INSET_PX, TOUR_LIGHT_MIN_PX } from '../src/styles'
import { draggedMapFloorPx } from '../src/utils/resultsSheet'

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
  TOUR_STEPS.filter((s) => s.place === 'panel' && s.anchors.length === 1 && !LIGHTS[s.key]).map((s) => s.key),
)
// The steps about the table, the only ones that open the results; every other
// step keeps them folded to their bar.
const TABLE_OPEN = new Set(['results', 'bound', 'row'])
// Where a lit area's ring may reach: the inset, and the hole's own padding.
const EDGE = TOUR_LIGHT_INSET_PX + TOUR_HOLE_PAD_PX - 1
// The one step a desktop card at the map's left cannot stand near: the
// results tools sit at the right end of the results bar, which on a wide
// screen is the far side of the map.
const FAR_FROM_CARD = new Set(['tools'])
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

// The shortest distance between two boxes, 0 where they meet.
const distance = (a: Box, b: Box) =>
  Math.hypot(Math.max(0, b.left - a.right, a.left - b.right), Math.max(0, b.top - a.bottom, a.top - b.bottom))

const meets = (a: Box, b: Box) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1

// The rules every step keeps, at every width.
async function holdsTheRules(page: Page, i: number, still: Map<string, Box>) {
  const key = TOUR_STEPS[i].key
  const { card: c, holes, open, viewport } = await scene(page)
  expect(holes.length, `${key} lights something`).toBeGreaterThan(0)
  for (const h of holes) {
    expect(h.right - h.left, `${key} lights a target on screen`).toBeGreaterThan(0)
    // Its ring whole, inside the screen.
    expect(h.left >= EDGE && h.top >= EDGE && h.right <= viewport.width - EDGE && h.bottom <= viewport.height - EDGE, `${key}: ${JSON.stringify(h)} inside the screen`).toBe(true)
    // A small control is lit at the size of a touch target; a row or a
    // section, which is long, as itself.
    const [w, ht] = [h.right - h.left, h.bottom - h.top]
    if (Math.max(w, ht) < 4 * TOUR_LIGHT_MIN_PX) expect(Math.min(w, ht), `${key}: ${JSON.stringify(h)} large enough to find`).toBeGreaterThanOrEqual(TOUR_LIGHT_MIN_PX - 1)
    expect(meets(c, h), `${key}: the card covers what it lights ${JSON.stringify(h)}`).toBe(false)
  }
  for (const o of open) expect(meets(c, o.box), `${key}: the card covers ${o.what}`).toBe(false)
  // A map popup stands clear of the map's own chrome too: the button columns,
  // the legends and the player.
  const chrome = await mapChrome(page)
  for (const o of open.filter((o) => o.what.includes('maplibregl-popup'))) {
    for (const [name, box] of Object.entries(chrome)) {
      if (box) expect(meets(o.box, box), `${key}: a popup under the ${name}`).toBe(false)
    }
  }
  if (SECTION_LIT.has(key)) await litOnItsSection(page, key, TOUR_STEPS[i].anchors[0], holes[0])
  // On a wide screen the card stands near what it lights: within a third of
  // the screen's width of the nearest lit area.
  if (viewport.width >= 2000 && !FAR_FROM_CARD.has(key)) {
    const gap = Math.min(...holes.map((h) => distance(c, h)))
    expect(gap, `${key}: the card within a third of the screen of its light`).toBeLessThan(viewport.width / 3)
  }
  // The results hold one state: open only in the steps about the table.
  const table = await page.locator('[data-tour-sandbox] [data-tour="results"]').count()
  if (table > 0 || TABLE_OPEN.has(key)) {
    await expect(page.locator('[data-tour-sandbox] [data-tour="results"]'), `${key}: the table open or folded`).toBeVisible({ visible: TABLE_OPEN.has(key) })
  }
  // One place for the whole run, apart from a phone's two edges.
  const edge = viewport.width < 1024 ? phoneEdge(i) : 'map'
  const first = still.get(edge)
  if (first) expect(c, `${key}: the card stands where it stood`).toEqual(first)
  else still.set(edge, c)
  await expect(card(page).getByRole('heading')).toHaveText(TOUR_STEPS[i].section)
  // The count shows in a section of several steps only: "1 of 1" would read
  // as the length of the whole tutorial.
  if (TOUR_STEPS[i].sectionSize > 1) await expect(card(page)).toContainText(progressText(TOUR_STEPS[i]))
  else await expect(card(page)).not.toContainText(progressText(TOUR_STEPS[i]))
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
    const head = table.querySelector('thead')!.getBoundingClientRect().height
    const row = table.querySelector('tbody tr')!.getBoundingClientRect().height
    return { rows, aqiHeads, head, row }
  })
  if (desktop) {
    for (const r of seen.rows) expect(r.whole, `${r.name} shows whole`).toBe(true)
    expect(seen.aqiHeads, 'the air-quality columns show').toBe(true)
  }
  const shown = seen.rows.filter((r) => r.whole)
  expect(shown.length).toBeGreaterThan(0)
  if (!desktop) {
    // As many rows as the app's own tallest drag of the sheet shows, with the
    // card over the map's top rather than under the sheet's floor.
    const tallest = (page.viewportSize()?.height ?? 0) - draggedMapFloorPx(1)
    const fit = Math.min(seen.rows.length, Math.floor((tallest - seen.head) / seen.row))
    expect(shown.length, 'rows at the tallest drag').toBeGreaterThanOrEqual(fit)
  }
  for (const r of shown) expect(r.readable, `${r.name} shows its name and its average`).toBe(true)
  return seen.rows
}

// What a step framed (the layers step's fire, plume and peaks; the rows the
// legend step colours) stands in the free map, clear of the card and the map's
// own chrome.
async function framedClear(page: Page) {
  const framed = JSON.parse((await page.locator('[data-tour-sandbox]').getAttribute('data-tour-framed')) ?? '{}') as {
    points: number[][]
    free: Box
  }
  const { points, free } = framed
  expect(points.length).toBeGreaterThan(0)
  const { card: c } = await scene(page)
  const chrome = await mapChrome(page)
  // A marker is drawn around its point.
  const R = 8
  const pad = (b: Box) => ({ left: b.left - R, top: b.top - R, right: b.right + R, bottom: b.bottom + R })
  const held = [c, chrome.column, chrome.buttons, chrome.player, chrome.legend].filter((b): b is Box => b !== null)
  for (const [x, y] of points) {
    expect(x >= free.left && x <= free.right && y >= free.top && y <= free.bottom, `${x},${y} in the free map ${JSON.stringify(free)}`).toBe(true)
    for (const b of held.map(pad)) {
      expect(x > b.left && x < b.right && y > b.top && y < b.bottom, `${x},${y} under ${JSON.stringify(b)}`).toBe(false)
    }
  }
  // Spread across it: on the axis the fit is bound by, the points span most of
  // the free map, so the markers stand apart.
  if (points.length < 3) return
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const spread = Math.max(
    (Math.max(...xs) - Math.min(...xs)) / (free.right - free.left),
    (Math.max(...ys) - Math.min(...ys)) / (free.bottom - free.top),
  )
  expect(spread, 'the framed points fill the free map').toBeGreaterThanOrEqual(FRAMED_SPREAD)
}

// While an acted step holds: what it changed is lit, one light for each thing
// and no other, each shows whole, on screen, clear of the card, and on the map
// clear of the map's own chrome.
async function resultHeld(page: Page, key: string) {
  const read = () =>
    page.evaluate(() => {
      const demo = document.querySelector<HTMLElement>('[data-tour-sandbox]')!
      const holes = JSON.parse(document.querySelector('[data-tour-dim]')?.getAttribute('data-holes') ?? '[]') as number[][]
      const result = JSON.parse(demo.dataset.tourResult ?? '[]') as { box: Box; map: boolean; popup: boolean; whole: boolean }[]
      return { holes, result }
    })
  const lit = (hole: number[], b: Box) =>
    hole[0] <= b.left + 3 && hole[1] <= b.top + 3 && hole[2] >= b.right - 3 && hole[3] >= b.bottom - 3
  let got = await read()
  for (let tries = 0; tries < 8 && !(got.result.length > 0 && got.result.every((r) => got.holes.some((h) => lit(h, r.box)))); tries++) {
    await page.waitForTimeout(80)
    got = await read()
  }
  const { holes, result } = got
  expect(result.length, `${key} names what it changed`).toBeGreaterThan(0)
  expect(holes.length, `${key}: one light per result, no other`).toBe(result.length)
  const { card: c, viewport } = await scene(page)
  const chrome = await mapChrome(page)
  for (const r of result) {
    const b = r.box
    expect(holes.some((h) => lit(h, b)), `${key}: ${JSON.stringify(b)} lit`).toBe(true)
    expect(r.whole, `${key}: ${JSON.stringify(b)} shows whole`).toBe(true)
    expect(b.left >= -2 && b.top >= -2 && b.right <= viewport.width + 2 && b.bottom <= viewport.height + 2, `${key}: on screen`).toBe(true)
    expect(meets(c, b), `${key}: ${JSON.stringify(b)} under the card`).toBe(false)
    if (r.map) {
      for (const [name, box] of Object.entries(chrome)) {
        if (box) expect(meets(b, box), `${key}: ${JSON.stringify(b)} under the ${name}`).toBe(false)
      }
    }
  }
}

// Each time the card's words change, how many areas are lit then and 300 ms
// later, read in the page so no wait of the suite's own blurs it.
async function watchTexts(page: Page) {
  await page.evaluate(() => {
    const log: { step: string; now: number; later: number }[] = []
    ;(window as unknown as { __texts: typeof log }).__texts = log
    const lit = () => (JSON.parse(document.querySelector('[data-tour-dim]')?.getAttribute('data-holes') ?? '[]') as unknown[]).length
    let step: string | null = null
    new MutationObserver(() => {
      const now = document.querySelector('[data-tour-card]')?.getAttribute('data-step') ?? null
      if (now === null || now === step) return
      step = now
      const entry = { step: now, now: lit(), later: -1 }
      log.push(entry)
      setTimeout(() => (entry.later = lit()), 300)
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-step'], childList: true })
  })
  return () => page.evaluate(() => (window as unknown as { __texts: { step: string; now: number; later: number }[] }).__texts)
}

// Every frame of the walk, read in the page: a light on the map while the
// camera moves (nothing on the map is lit then); more than one light while
// the Layers menu is open (the menu alone is lit); and, on a phone, a light
// across the edge of the drawer's scrolling panel (a light left where its
// subject was before the layout moved it); and the card over the app's
// progress box. The progress box stands over
// both the map and the panel and is lit as itself. This reads the lights as
// the dim drew them in its own frame, which may be the frame before the
// layout it is compared with, so a fault counts once it holds for two.
async function watchLights(page: Page) {
  await page.evaluate(() => {
    const bad = new Set<string>()
    let before = new Map<string, string>()
    ;(window as unknown as { __lightFaults: () => string[] }).__lightFaults = () => [...bad]
    const box = (el: Element | null | undefined) => {
      const r = el?.getBoundingClientRect()
      return r && r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null
    }
    type B = { left: number; top: number; right: number; bottom: number }
    const inside = (x: number, y: number, b: B | null) => Boolean(b && x >= b.left && x <= b.right && y >= b.top && y <= b.bottom)
    const tick = () => {
      const demo = document.querySelector<HTMLElement>('[data-tour-sandbox]')
      const dim = document.querySelector('[data-tour-dim]')
      if (!demo || !dim) {
        requestAnimationFrame(tick)
        return
      }
      const step = document.querySelector('[data-tour-card]')?.getAttribute('data-step') ?? ''
      // Keyed by the step and the rule, so a light that glides still counts.
      const now = new Map<string, string>()
      const progress = box(demo.querySelector('[data-tour="progress"]'))
      const holes = (JSON.parse(dim.getAttribute('data-holes') ?? '[]') as number[][])
        .map(([left, top, right, bottom]) => ({ left, top, right, bottom }))
        .filter((h) => !inside((h.left + h.right) / 2, (h.top + h.bottom) / 2, progress))
      const map = box(demo.querySelector('[data-tour="map"]'))
      // The analyze step is about the progress box, which the card never covers.
      const cardBox = box(document.querySelector('[data-tour-card]'))
      if (progress && cardBox && progress.left < cardBox.right && cardBox.left < progress.right && progress.top < cardBox.bottom && cardBox.top < progress.bottom) {
        now.set(`${step} progress`, `${step}: the card ${JSON.stringify(cardBox)} over the progress box ${JSON.stringify(progress)}`)
      }
      const menu = demo.querySelector('input[value="smoke"]')
      const menuOpen = Boolean(box(menu))
      if (menuOpen && holes.length > 1) now.set(`${step} menu`, `${step}: ${holes.length} lights with the Layers menu open`)
      if (demo.dataset.mapMoving !== undefined && map) {
        const chrome = [
          '[data-map-column]', '.maplibregl-ctrl-top-right', '[data-tour="legend"]', '[data-drawer]', '[data-results-sheet]',
          '[data-tour="search"]', '[data-tour="player"]',
        ].map((sel) => box(demo.querySelector(sel)))
        const layers = demo.querySelector('[data-tour="layers"]')?.parentElement
        chrome.push(box(layers), box(menu?.closest('label')?.parentElement))
        for (const h of holes) {
          const x = (h.left + h.right) / 2
          const y = (h.top + h.bottom) / 2
          if (inside(x, y, map) && !chrome.some((c) => inside(x, y, c))) now.set(`${step} moving`, `${step}: ${JSON.stringify(h)} lit on a moving map`)
        }
      }
      const drawer = box(demo.querySelector('[data-drawer]'))
      const metrics = demo.querySelector('[data-tour="metrics"]')
      let scroller: Element | null = metrics?.parentElement ?? null
      while (scroller && !(['auto', 'scroll'].includes(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight)) {
        scroller = scroller.parentElement
      }
      const room = box(scroller)
      const open = document.querySelector('[role="listbox"]')
      if (innerWidth < 1024 && drawer && drawer.left >= 0 && room && !box(open)) {
        for (const h of holes) {
          if (h.right <= room.left || h.left >= room.right) continue
          const across = (edge: number) => h.top < edge - 2 && h.bottom > edge + 2
          if (across(room.top) || across(room.bottom)) now.set(`${step} edge`, `${step}: ${JSON.stringify(h)} across the panel's edge`)
        }
      }
      for (const rule of now.keys()) if (before.has(rule)) bad.add(before.get(rule)!)
      before = now
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  return () => page.evaluate(() => (window as unknown as { __lightFaults: () => string[] }).__lightFaults())
}

async function lightsKeptTheRules(faults: () => Promise<string[]>) {
  expect(await faults()).toEqual([])
}

// No step's words are read in the dark: its light stands within 300 ms.
async function lightBeforeText(texts: () => Promise<{ step: string; later: number }[]>) {
  const log = await texts()
  expect(log.length).toBeGreaterThanOrEqual(STEPS - 1)
  for (const t of log) if (t.later >= 0) expect(t.later, `${t.step} lit as its words show`).toBeGreaterThan(0)
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
  if (ACTIONS[key]) {
    await expect(card(page)).toHaveAttribute('data-phase', 'hold', { timeout: 30_000 })
    await resultHeld(page, key)
    if (key === 'layers' || key === 'analyze' || key === 'search') await framedClear(page)
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
    // The colored markers: every row the bound left is on the map, in view,
    // and lit beside the legend.
    if (key === 'legend') {
      await framedClear(page)
      // The key the card is about: the colour of each band.
      await expect(page.locator('[data-tour-sandbox] [data-tour="legend"]')).toContainText('AQI')
      const { holes } = await scene(page)
      expect(holes).toHaveLength(2)
      const { points } = JSON.parse((await page.locator('[data-tour-sandbox]').getAttribute('data-tour-framed')) ?? '{}')
      for (const [x, y] of points as number[][]) {
        expect(x >= holes[1].left && x <= holes[1].right && y >= holes[1].top && y <= holes[1].bottom, `${x},${y} lit`).toBe(true)
      }
    }
    // No player until the player step, on every screen.
    const player = page.locator('[data-tour-sandbox] [data-tour="player"]')
    await expect(player).toHaveCount(i >= TOUR_STEPS.findIndex((s) => s.key === 'player') ? 1 : 0)
    if (key === 'row') {
      const names = await rowNames(page)
      expect(names).toHaveLength(DEMO_ROWS - over.length)
      for (const name of over) expect(names).not.toContain(name)
    }
    await onward(page, i)
  }
}

for (const [width, height] of [[1280, 800], [1366, 768], [2560, 1440]]) {
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
  const texts = await watchTexts(page)
  const lights = await watchLights(page)

  await walk(page)

  await lightBeforeText(texts)
  await lightsKeptTheRules(lights)
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
  const texts = await watchTexts(page)
  const lights = await watchLights(page)

  await walk(page)

  await lightBeforeText(texts)
  await lightsKeptTheRules(lights)
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
