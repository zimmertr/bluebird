import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// A phone sheet's grip and title drag it (#696; record 0146), the way the
// results sheet's grips drag the results: up to a held height, and down to
// shut. Driven by a pointer moving slowly, so no release reads as a flick.

async function drag(page: Page, from: { x: number; y: number }, dy: number) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  const steps = 12
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x, from.y + (dy * i) / steps)
    await page.waitForTimeout(16)
  }
  // Still before letting go, so the release has no speed.
  await page.waitForTimeout(150)
  await page.mouse.up()
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the Layers sheet rises under its grip, holds, and shuts dragged down from its title', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    await page.getByRole('button', { name: 'Layers', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'Layers' })
    await expect(sheet).toBeVisible()
    const before = (await sheet.boundingBox())!
    const grip = (await sheet.locator(':scope > div').first().boundingBox())!

    // Up a third of the room over it, between its own height and the top:
    // it stays there. A fixed distance would reach the top as the menu grows.
    const rise = Math.round(before.y / 3)
    await drag(page, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, -rise)
    const held = (await sheet.boundingBox())!
    expect(Math.round(held.height - before.height)).toBe(rise)
    expect(Math.round(held.y + held.height)).toBe(Math.round(before.y + before.height))

    // Down from the title, past its own height to the foot: it shuts.
    const title = (await sheet.getByRole('heading', { name: 'Layers' }).boundingBox())!
    await drag(page, { x: title.x + 4, y: title.y + title.height / 2 }, held.height - 20)
    await expect(sheet).toHaveCount(0)
  })
})
