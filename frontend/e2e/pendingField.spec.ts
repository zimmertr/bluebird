import { test, expect, drawRing, message, DESTINATION_NAMES, resultRows } from './fixtures'
import type { Route } from '@playwright/test'

// #782: a polygon search whose forecasts fail keeps what it found on screen as
// pending rows, and Try again fetches their forecasts without searching again.

// A daily limit, because it fails the run at once: a minutely one is waited
// out and asked again (`getJsonWithResume` in openMeteo.ts).
const QUOTA_SPENT = { reason: 'Daily API request limit exceeded. Please try again tomorrow.' }
const refuse = (route: Route) =>
  route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify(QUOTA_SPENT) })

test('a failed polygon run keeps its found destinations, and Try again forecasts them without searching again', async ({ page }) => {
  // Counted on the way to the fixture's own answer, which is registered first
  // and so matched after this.
  let discoveries = 0
  await page.route('**/api/destinations', (route) => {
    discoveries += 1
    return route.fallback()
  })
  await page.route('https://api.open-meteo.com/**', refuse)

  await page.goto('/')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await drawRing(page)
  await page.getByRole('checkbox', { name: 'Peaks', exact: true }).check()
  await page.getByRole('button', { name: 'Analyze' }).click()

  await expect(message(page, 'Open-Meteo quota reached. Try again later.')).toHaveCount(1)
  const retry = page.getByRole('button', { name: 'Try again' })
  await expect(retry).toBeEnabled()
  const table = page.locator('[data-results-table]')
  const rows = resultRows(page)
  await expect(rows).toHaveCount(DESTINATION_NAMES.length)
  for (const name of DESTINATION_NAMES) {
    const row = rows.filter({ hasText: name })
    await expect(row).toHaveCount(1)
    // The rank cell's dash and at least one metric cell's.
    const dashes = (await row.locator('td').allTextContents()).filter((text) => text.trim() === '—')
    expect(dashes.length).toBeGreaterThan(1)
  }
  // Pending rows rank nowhere, and a found one carries no remove button.
  await expect(table.getByRole('button', { name: /^Remove / })).toHaveCount(0)
  expect(discoveries).toBe(1)

  await page.unroute('https://api.open-meteo.com/**', refuse)
  await retry.click()

  // Ranked: each row's rank cell carries its number beside its remove button.
  const ranks = table.locator('tbody td:has(button[aria-label^="Remove "])')
  await expect(ranks).toHaveText(DESTINATION_NAMES.map((_, i) => String(i + 1)))
  await expect(rows).toHaveCount(DESTINATION_NAMES.length)
  await expect(message(page, 'Open-Meteo quota reached. Try again later.')).toHaveCount(0)
  expect(discoveries).toBe(1)
})
