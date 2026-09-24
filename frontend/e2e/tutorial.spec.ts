import type { Page } from '@playwright/test'
import { test, expect, DESTINATION_NAMES } from './fixtures'
import { TOUR_STEPS } from '../src/utils/tourSteps'

// The tutorial (#536) acts every step out on a demo copy of the app. Three
// promises matter beyond each card showing: every step's action finishes, a
// step left early or stepped back to stands where a walk from the start would
// have left it, and the reader's page is exactly as it was afterwards, with
// nothing asked of the pod or of Open-Meteo while the demo ran.
const STEPS = TOUR_STEPS.length
// Glacier Peak searched, Dome Peak clicked, five peaks in the ring, two pasted.
const DEMO_ROWS = 9
// Beside the fire; the air-quality ranking puts all three last.
const NEAR_FIRE = ['Glacier Peak', 'Kennedy Peak', 'Gamma Peak']
const OPEN_METEO = ['api.open-meteo.com', 'air-quality-api.open-meteo.com', 'archive-api.open-meteo.com']

function isoDay(offset: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

// Every request the page sends from now on, for the ones the tutorial must
// not make: the pod's API and Open-Meteo.
function watchRequests(page: Page): string[] {
  const seen: string[] = []
  page.on('request', (r) => {
    const url = new URL(r.url())
    if (url.pathname.startsWith('/api/') || url.hostname.endsWith('open-meteo.com')) seen.push(r.url())
  })
  return seen
}

async function storage(page: Page) {
  return page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }))
}

// Waits until step `key` is on screen and its action has finished.
async function settled(page: Page, key: string) {
  await expect(page.locator(`[data-tour-frame][data-step="${key}"][data-acting="false"]`)).toHaveCount(1, {
    timeout: 30_000,
  })
}

const demoRows = (page: Page) => page.locator('[data-tour-sandbox] table tbody tr')

test('the welcome dialog starts a tutorial that acts out every step and leaves nothing behind', async ({ page, traffic }) => {
  test.setTimeout(240_000)
  // Registered after the fixture's, so this one wins: a first visit.
  await page.addInitScript(() => localStorage.removeItem('bluebird_forecast_welcomed'))
  await page.goto('/')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Take the tutorial' }).click()
  const url = page.url()
  // Starting the tutorial counts as having been welcomed; everything after
  // that is the demo's and must leave storage alone.
  expect(await page.evaluate(() => localStorage.getItem('bluebird_forecast_welcomed'))).not.toBeNull()
  const kept = await storage(page)
  const requests = watchRequests(page)

  const card = page.locator('.driver-popover')
  for (const [i, step] of TOUR_STEPS.entries()) {
    await settled(page, step.key)
    await expect(card.locator('.driver-popover-progress-text')).toHaveText(`${i + 1} of ${STEPS}`)
    await expect(card.locator('.driver-popover-title')).toHaveText(step.title)
    if (step.key === 'results') {
      await expect(demoRows(page)).toHaveCount(DEMO_ROWS)
      const names = await demoRows(page).locator('button[aria-label^="Center map on"]').allTextContents()
      expect(names.slice(-NEAR_FIRE.length).sort()).toEqual([...NEAR_FIRE].sort())
    }
    if (step.key === 'layers') {
      // Both overlays on: the legend carries a line for each.
      const legend = page.locator('[data-tour-sandbox] [data-tour="legend"]')
      await expect(legend).toContainText('Active wildfire')
      await expect(legend).toContainText('Smoke')
    }
    await card.getByRole('button', { name: i === STEPS - 1 ? 'Done' : 'Next' }).click()
  }

  await expect(card).toHaveCount(0)
  await expect(page.locator('[data-tour-frame]')).toHaveCount(0)
  await expect(page.locator('table tbody tr')).toHaveCount(0)
  expect(page.url()).toBe(url)
  expect(await storage(page)).toEqual(kept)
  expect(requests).toEqual([])
  for (const host of OPEN_METEO) expect(traffic.answered[host] ?? 0, host).toBe(0)
})

test('on a phone, a step left early or stepped back to stands as a walk would leave it, and the X puts the report back', async ({ page, traffic }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 360, height: 640 })
  const d1 = isoDay(1)
  await page.goto(`/?mode=days&d1=${d1}&d2=${d1}&type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55&analyze=1`)
  const rows = page.locator('#root table tbody tr')
  await expect(rows).toHaveCount(DESTINATION_NAMES.length)
  await expect.poll(() => new URL(page.url()).searchParams.has('analyze')).toBe(false)
  const url = page.url()
  const spent = OPEN_METEO.map((host) => traffic.answered[host] ?? 0)

  await page.getByRole('button', { name: 'Open controls' }).click()
  await page.getByRole('button', { name: 'Tutorial' }).click()
  const card = page.locator('.driver-popover')
  const progress = card.locator('.driver-popover-progress-text')
  await expect(progress).toHaveText(`1 of ${STEPS}`)
  const requests = watchRequests(page)

  // Next while the search is still typing: the map step starts from a demo
  // that already holds the searched peak.
  await card.getByRole('button', { name: 'Next' }).click()
  await settled(page, 'map')
  await expect(progress).toHaveText(`2 of ${STEPS}`)
  await expect(demoRows(page).filter({ hasText: 'Glacier Peak' })).toHaveCount(1)
  await expect(demoRows(page).filter({ hasText: 'Dome Peak' })).toHaveCount(1)

  // The arrow keys drive the same steps the buttons do. Driver ignores a key
  // while a step is still animating in (400 ms), as it would for a reader
  // pressing that fast.
  await page.waitForTimeout(500)
  await page.keyboard.press('ArrowRight')
  await settled(page, 'polygon')
  await expect(progress).toHaveText(`3 of ${STEPS}`)

  // Back over a step that acted: it is acted again from where it started,
  // so the clicked peak is added once, not twice.
  await card.getByRole('button', { name: 'Previous' }).click()
  await settled(page, 'map')
  await expect(progress).toHaveText(`2 of ${STEPS}`)
  await expect(demoRows(page).filter({ hasText: 'Dome Peak' })).toHaveCount(1)

  await card.getByRole('button', { name: 'End tutorial' }).click()
  await expect(card).toHaveCount(0)
  await expect(page.locator('[data-tour-frame]')).toHaveCount(0)
  await expect(rows).toHaveCount(DESTINATION_NAMES.length)
  expect(page.url()).toBe(url)
  expect(requests).toEqual([])
  expect(OPEN_METEO.map((host) => traffic.answered[host] ?? 0)).toEqual(spent)
})
