import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// The fire activity key (#799) is one line like Smoke's: the layer's name and
// three starburst chips, 12, 24 and 48, side by side. The chip menus are
// 224px wide so the line holds, and a phone's Legend sheet is wider still.
// One row means the three chips' boxes share a top.
async function chipTops(page: Page) {
  // The section's line, found through its credit, the one link to FIRMS.
  const row = page.getByRole('link', { name: 'FIRMS' }).locator('xpath=ancestor::div[1]')
  await expect(row).toContainText('Fire activity')
  await expect(row.getByText('12', { exact: true })).toBeVisible()
  return row.locator('svg').evaluateAll((stars) => stars.map((star) => star.parentElement!.getBoundingClientRect().top))
}

for (const [name, width, height] of [
  ['a desk', 1440, 900],
  ['a phone', 390, 844],
] as const) {
  test(`the fire activity key's three chips stand in one row at ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/?view=-121.76,46.853,8&fireactivity=1')
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    if (width < 600) await page.getByRole('button', { name: 'Legend', exact: true }).click()
    const tops = await chipTops(page)
    test.info().annotations.push({ type: `chip tops at ${width}`, description: JSON.stringify(tops) })
    expect(tops).toHaveLength(3)
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(2)
  })
}
