import { test, expect, expectRanked, resultRows, typeCell, DESTINATION_NAMES } from './fixtures'
import type { Page } from '@playwright/test'

// A press on a results row opens that destination's marker popup (#696;
// record 0143), at a desk and on a phone, where the sheet first drops to its
// bar. A press on a control in the row is that control's alone.

async function analyze(page: Page, phone: boolean) {
  await page.goto('/?type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  const where = phone ? page.getByRole('main') : page.locator('aside')
  await where.getByRole('button', { name: 'Analyze', exact: true }).click()
  // Every test here reads a row by its position, so not before it is ranked.
  await expectRanked(page)
}

test('a click on a row opens its popup, and its chart box does not, at 1280 px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await analyze(page, false)
  const popups = page.locator('.maplibregl-popup')
  const row = resultRows(page).nth(1)
  await row.getByRole('checkbox').click()
  await expect(popups).toHaveCount(0)
  const name = (await row.getByRole('button', { name: /^Center map on / }).textContent())!.trim()
  // The row's ground: the Type cell, which holds no
  // link or button.
  await (await typeCell(page, row)).click()
  await expect(popups).toHaveCount(1)
  await expect(popups).toContainText(name)
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('a tap on a row lowers the sheet and opens the popup', async ({ page }) => {
    await analyze(page, true)
    const row = resultRows(page).nth(1)
    const name = (await row.getByRole('button', { name: /^Center map on / }).textContent())!.trim()
    await (await typeCell(page, row)).tap()
    await expect(page.getByRole('button', { name: 'Expand results' }).first()).toBeVisible()
    await expect(page.locator('.maplibregl-popup')).toContainText(name)
  })

  // A finger has no hover to show the × beside the rank, so the row's remove
  // is the card's (#696): the tap opens it, and its button takes the row out
  // the way the × does.
  test('a row is removed from the card its tap opens', async ({ page }) => {
    await analyze(page, true)
    const row = resultRows(page).nth(1)
    const name = (await row.getByRole('button', { name: /^Center map on / }).textContent())!.trim()
    await expect(row.getByRole('button', { name: `Remove ${name}` })).toBeHidden()
    await (await typeCell(page, row)).tap()
    const popup = page.locator('.maplibregl-popup')
    // The card is the row's, or the remove below takes another one out.
    await expect(popup).toHaveCount(1)
    await expect(popup).toContainText(name)
    await popup.getByRole('button', { name: 'Remove from analysis' }).tap()
    await expect(popup).toHaveCount(0)
    // The tap lowered the sheet to its bar; raised again, the table is a row
    // shorter.
    await page.getByRole('button', { name: 'Expand results' }).first().tap()
    await expect(resultRows(page)).toHaveCount(DESTINATION_NAMES.length - 1)
    await expect(page.getByRole('button', { name: `Center map on ${name}` })).toHaveCount(0)
  })
})
