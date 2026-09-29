import type { Page } from '@playwright/test'
import { test, expect, DESTINATION_NAMES } from './fixtures'
import { TOUR_STEPS, phoneEdge, progressText } from '../src/utils/tourSteps'

// The tutorial (#536) acts every step out on a demo copy of the app. What is
// held here, at a desktop and at a phone width, is what makes it readable:
// every step's card shows first and stands in one place, nothing it lights or
// opens is under it, the keys move it, and the reader's page is exactly as it
// was afterwards, with nothing asked of the pod or of Open-Meteo meanwhile.
const STEPS = TOUR_STEPS.length
// Glacier Peak searched, Dome Peak clicked, five peaks in the ring, two pasted.
const DEMO_ROWS = 9
// Under the smoke, from the worst: the air-quality ranking puts them last,
// and a highest AQI of 100 takes exactly these four away.
const IN_SMOKE = ['Gamma Peak', 'Glacier Peak', 'Kennedy Peak', 'Helmet Butte']
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
  // The lit areas follow their targets a frame at a time.
  await page.waitForTimeout(400)
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
  // One place for the whole run, apart from a phone's one switch of edge.
  const edge = viewport.width < 1024 ? phoneEdge(i) : 'map'
  const first = still.get(edge)
  if (first) expect(c, `${key}: the card stands where it stood`).toEqual(first)
  else still.set(edge, c)
  await expect(card(page).getByRole('heading')).toHaveText(TOUR_STEPS[i].section)
  await expect(card(page)).toContainText(progressText(TOUR_STEPS[i]))
}

// Moves on from step `i`, by a button or a key in turn, and waits for the next.
async function onward(page: Page, i: number) {
  const way = i % 4
  if (i === STEPS - 1) await card(page).getByRole('button', { name: 'Done' }).click()
  else if (way === 0) await card(page).getByRole('button', { name: 'Next' }).click()
  else if (way === 1) await page.keyboard.press('ArrowRight')
  else if (way === 2) await page.keyboard.press('Enter')
  else await page.keyboard.press('Space')
  if (i < STEPS - 1) await expect(card(page)).not.toHaveAttribute('data-step', TOUR_STEPS[i].key, { timeout: 30_000 })
}

// The whole run, step by step, with what the story promises checked on the way.
async function walk(page: Page) {
  const still = new Map<string, Box>()
  for (let i = 0; i < STEPS; i++) {
    await reading(page, i)
    await holdsTheRules(page, i, still)
    const key = TOUR_STEPS[i].key
    if (key === 'results') {
      await expect(demoRows(page)).toHaveCount(DEMO_ROWS)
      const names = await rowNames(page)
      expect(names.slice(-IN_SMOKE.length)).toEqual([...IN_SMOKE].reverse())
      // Both overlays on: the legend carries a line for each.
      const legend = page.locator('[data-tour-sandbox] [data-tour="legend"]')
      await expect(legend).toContainText('Active wildfire')
      await expect(legend).toContainText('Smoke')
    }
    if (key === 'row') {
      const names = await rowNames(page)
      expect(names).toHaveLength(DEMO_ROWS - IN_SMOKE.length)
      for (const name of IN_SMOKE) expect(names).not.toContain(name)
    }
    await onward(page, i)
  }
}

test('the welcome dialog starts a tutorial that acts out every step and leaves nothing behind', async ({ page, traffic }) => {
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1280, height: 800 })
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
  // The search finished: the name is in the box, and a place gives the demo
  // its results sheet.
  const sheet = page.locator('[data-tour-sandbox] [data-results-sheet]')
  await expect(search).toHaveValue('Glacier Peak')
  await expect(sheet).toHaveCount(1)

  // Back over a step that acted: the demo stands where that step started.
  await page.keyboard.press('ArrowLeft')
  await reading(page, 0)
  await expect(search).toHaveValue('')
  await expect(sheet).toHaveCount(0)

  await page.keyboard.press('Escape')
  await expect(card(page)).toHaveCount(0)
  await expect(page.locator('[data-tour-sandbox]')).toHaveCount(0)
  expect(requests).toEqual([])
})
