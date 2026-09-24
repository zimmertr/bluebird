import { test, expect, DESTINATION_NAMES } from './fixtures'

// The tutorial (#536). Two promises matter beyond each card showing: every
// step's target is on screen when it is reached (a missing one is skipped,
// which would show as a jump in the count), and the tutorial leaves the page
// exactly as it found it, having spent nothing upstream.
const STEPS = 16
const DEMO_ROWS = 22
const OPEN_METEO = ['api.open-meteo.com', 'air-quality-api.open-meteo.com', 'archive-api.open-meteo.com']

function isoDay(offset: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

test('the welcome dialog starts a tutorial that walks every step and leaves nothing behind', async ({ page, traffic }) => {
  // Registered after the fixture's, so this one wins: a first visit.
  await page.addInitScript(() => localStorage.removeItem('bluebird_forecast_welcomed'))
  await page.goto('/')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  const before = page.url()

  await page.getByRole('button', { name: 'Take the tutorial' }).click()
  const card = page.locator('.driver-popover')
  await expect(card.getByRole('button', { name: 'Previous' })).toBeDisabled()
  // Starting the tutorial counts as having been welcomed. Read from storage,
  // since the fixture sets the flag again on every load.
  expect(await page.evaluate(() => localStorage.getItem('bluebird_forecast_welcomed'))).not.toBeNull()
  for (let i = 1; i <= STEPS; i++) {
    await expect(card.locator('.driver-popover-progress-text')).toHaveText(`${i} of ${STEPS}`)
    if (i === 9) await expect(page.locator('table tbody tr')).toHaveCount(DEMO_ROWS)
    await card.getByRole('button', { name: i === STEPS ? 'Done' : 'Next' }).click()
  }

  await expect(card).toHaveCount(0)
  await expect(page.locator('table tbody tr')).toHaveCount(0)
  expect(page.url()).toBe(before)
  for (const host of OPEN_METEO) expect(traffic.answered[host] ?? 0, host).toBe(0)

})

test('on a phone, the footer link tours over a report and puts it back', async ({ page, traffic }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  const d1 = isoDay(1)
  await page.goto(`/?mode=days&d1=${d1}&d2=${d1}&type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55&analyze=1`)
  const rows = page.locator('table tbody tr')
  await expect(rows).toHaveCount(DESTINATION_NAMES.length)
  await expect.poll(() => new URL(page.url()).searchParams.has('analyze')).toBe(false)
  const before = page.url()
  const spent = OPEN_METEO.map((host) => traffic.answered[host] ?? 0)

  await page.getByRole('button', { name: 'Open controls' }).click()
  await page.getByRole('button', { name: 'Tutorial' }).click()
  const card = page.locator('.driver-popover')
  const progress = card.locator('.driver-popover-progress-text')
  await expect(progress).toHaveText(`1 of ${STEPS}`)
  // The arrow keys drive the same steps the buttons do. Driver ignores a key
  // while a step is still animating in (400 ms), as it would for a reader
  // pressing that fast, so each press waits the animation out.
  for (let i = 2; i <= 9; i++) {
    await page.waitForTimeout(500)
    await page.keyboard.press('ArrowRight')
    await expect(progress).toHaveText(`${i} of ${STEPS}`)
  }
  await expect(rows).toHaveCount(DEMO_ROWS)
  await expect(page.locator('[data-tour="results"]')).toBeInViewport()

  // At once, while the step may still be animating in: the close must land
  // whatever Driver is doing.
  await card.getByRole('button', { name: 'End tutorial' }).click()
  await expect(card).toHaveCount(0)
  await expect(rows).toHaveCount(DESTINATION_NAMES.length)
  expect(page.url()).toBe(before)
  expect(OPEN_METEO.map((host) => traffic.answered[host] ?? 0)).toEqual(spent)
})
