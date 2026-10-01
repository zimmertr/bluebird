import type { Route } from '@playwright/test'
import { test, expect, drawRing } from './fixtures'

// #580: a basemap style that fails to load used to leave a blank map with
// nothing saying so. The panel now says it below Analyze, and the style is
// asked for again when the browser comes back online; the map then loads as it
// would have, which a drawn ring proves (the draw handlers mount on `load`).
test('a failed basemap style says so, and loads on reconnect', async ({ page }) => {
  const STYLE = 'https://tiles.openfreemap.org/styles/**'
  const refuse = (route: Route) => route.fulfill({ status: 503, body: '' })
  await page.route(STYLE, refuse)
  await page.goto('/')

  const note = page.getByText('The map could not load. Try again later.')
  await expect(note).toBeVisible()

  await page.unroute(STYLE, refuse)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(note).toBeHidden()
  await drawRing(page)
  await expect(page.getByRole('button', { name: 'Edit polygon' })).toBeVisible()
})
