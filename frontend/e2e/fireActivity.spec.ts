import { test, expect, FIRE_DETECTION } from './fixtures'
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

// A click on a star opens its card (the maintainer, 2026-10-29), as a click on
// every other thing on the map does: `Hotspot` over the detection's four
// lines, the pointer over the star saying so first. The fixtures' one
// detection stands at the middle of the view, where the canvas's middle is.
for (const [name, width, height] of [
  ['a desk', 1440, 900],
  ['a phone', 390, 844],
] as const) {
  test(`a click on a star opens its Hotspot card at ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto(`/?view=${FIRE_DETECTION.lng},${FIRE_DETECTION.lat},12&fireactivity=1`)
    const canvas = page.locator('.maplibregl-canvas')
    await expect(canvas).toBeVisible()
    const box = (await canvas.boundingBox())!
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    // The star draws once the answer lands, which nothing on the page
    // announces, so the pointer is asked until it says so.
    await expect
      .poll(async () => {
        await page.mouse.move(at.x - 2, at.y)
        await page.mouse.move(at.x, at.y)
        return canvas.evaluate((el) => (el as HTMLElement).style.cursor)
      })
      .toBe('pointer')
    await page.mouse.click(at.x, at.y)
    const card = page.locator('.maplibregl-popup')
    await expect(card).toHaveCount(1)
    await expect(card.locator('strong').first()).toHaveText('Hotspot')
    const body = card.locator('[data-popup-body]')
    for (const label of ['Detected', 'Satellite', 'Confidence', 'Fire power']) {
      await expect(body.getByText(label, { exact: true })).toBeVisible()
    }
    await expect(body).toContainText('(3 hours ago)')
    await expect(body).toContainText('NOAA-20 VIIRS')
    await expect(body).toContainText('Nominal')
    await expect(body).toContainText('12 MW')
    // A click on bare map clears it, as it clears every card: at the
    // canvas's left edge, clear of the card over the star and of the chips.
    await page.mouse.click(box.x + 30, box.y + box.height / 2)
    await expect(card).toHaveCount(0)
  })
}
