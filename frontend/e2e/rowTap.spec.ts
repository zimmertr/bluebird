import { test, expect, resultRows, DESTINATION_NAMES } from './fixtures'
import type { Page } from '@playwright/test'

// A press on a results row opens that destination's marker popup (#696;
// record 0143), at a desk and on a phone, where the sheet first drops to its
// bar. A press on a control in the row is that control's alone.

async function analyze(page: Page, phone: boolean) {
  await page.goto('/?type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  const where = phone ? page.getByRole('main') : page.locator('aside')
  await where.getByRole('button', { name: 'Analyze', exact: true }).click()
  await expect(resultRows(page)).toHaveCount(DESTINATION_NAMES.length)
}

test('a click on a row opens its popup, and its chart box does not, at 1280 px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await analyze(page, false)
  const popups = page.locator('.maplibregl-popup')
  const row = resultRows(page).nth(1)
  await row.getByRole('checkbox').click()
  await expect(popups).toHaveCount(0)
  const name = (await row.getByRole('button', { name: /^Center map on / }).textContent())!.trim()
  // The row's ground: the cell after the name, the Type, which holds no
  // link or button.
  await row.locator('td').nth(3).click()
  await expect(popups).toHaveCount(1)
  await expect(popups).toContainText(name)
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('a tap on a row lowers the sheet and opens the popup', async ({ page }) => {
    await analyze(page, true)
    const row = resultRows(page).nth(1)
    const name = (await row.getByRole('button', { name: /^Center map on / }).textContent())!.trim()
    await row.locator('td').nth(3).tap()
    await expect(page.getByRole('button', { name: 'Expand results' }).first()).toBeVisible()
    await expect(page.locator('.maplibregl-popup')).toContainText(name)
  })
})
