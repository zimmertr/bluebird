import type { Route } from '@playwright/test'
import { test, expect, drawRing, message } from './fixtures'

// #580: a basemap style that fails to load used to leave a blank map with
// nothing saying so. The panel now says it in the Analyze button's messages, and the style is
// asked for again when the browser comes back online; the map then loads as it
// would have, which a drawn ring proves (the draw handlers mount on `load`).
test('a failed basemap style says so, and loads on reconnect', async ({ page }) => {
  const STYLE = 'https://tiles.openfreemap.org/styles/**'
  const refuse = (route: Route) => route.fulfill({ status: 503, body: '' })
  await page.route(STYLE, refuse)
  await page.goto('/')

  // The note joins the Analyze button's messages (record 0208): the live
  // region holds it, the badge counts it, and the list opens on it.
  const note = message(page, 'The map could not load. Try again later.')
  await expect(note).toHaveCount(1)
  const badge = page.getByRole('button', { name: /^\d+ messages?$/ })
  await badge.click()
  await expect(page.getByRole('group', { name: 'Messages' }).getByText('The map could not load. Try again later.')).toBeVisible()
  await page.keyboard.press('Escape')

  await page.unroute(STYLE, refuse)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(note).toHaveCount(0)
  await drawRing(page)
  await expect(page.getByRole('button', { name: 'Edit polygon' })).toBeVisible()
})

// Record 0348: a style host that stays down no longer leaves the map with no
// ring tool. Past its timed retries the map takes a fallback for the visit, so
// the draw handlers mount, and the note stays, because a reload is what brings
// the basemap back.
test('a basemap style that stays down still lets you draw a ring', async ({ page }) => {
  let asked = 0
  await page.route('https://tiles.openfreemap.org/styles/**', (route) => {
    asked += 1
    return route.fulfill({ status: 503, body: '' })
  })
  await page.goto('/')
  const note = message(page, 'The map could not load. Try again later.')
  await expect(note).toHaveCount(1)
  // The two retries' waits, 5 s and 15 s (STYLE_RETRY_S), run on the page's
  // clock a second at a time, so each timer is set by its refusal before the
  // time it waits for passes.
  await expect
    .poll(
      async () => {
        await page.clock.runFor(1_000)
        return asked
      },
      { timeout: 30_000 },
    )
    .toBe(3)
  await drawRing(page)
  await expect(page.getByRole('button', { name: 'Edit polygon' })).toBeVisible()
  await expect(note).toHaveCount(1)
})
