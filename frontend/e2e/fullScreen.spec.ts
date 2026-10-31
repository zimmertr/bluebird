import { test, expect, resultRows, isoDay } from './fixtures'
import type { Page } from '@playwright/test'

// A phone's results sheet goes to full screen when its grip is dragged to the
// top of the screen and let go there (#837; record 0259), sliding over the
// map's rows and its Analyze button, and comes back down under the next drag. Driven by a pointer moving slowly, the way sheetDrag.spec.ts drags.

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

async function dragTo(page: Page, from: { x: number; y: number }, toY: number) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x, toY, { steps: 12 })
  await page.waitForTimeout(150)
  await page.mouse.up()
}

test('the results sheet goes full screen dragged to the top, and comes back down', async ({ page }) => {
  await page.goto(`/?mode=days&d1=${isoDay(1)}&d2=${isoDay(2)}&type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55`)
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  const analyze = page.getByRole('main').getByRole('button', { name: 'Analyze' })
  await analyze.tap()
  await expect(resultRows(page).first()).toBeAttached()

  const sheet = page.locator('[data-tour="results"]')
  // By CSS rather than by role: under a full-screen sheet both are inert,
  // which takes them out of the accessibility tree a role query reads.
  const controls = page.locator('button[aria-label="Open controls"]')
  const fab = page.locator('[data-tour="analyze"]')
  const resting = (await sheet.boundingBox())!
  expect(resting.y).toBeGreaterThan(300)
  await expect(controls).toBeVisible()
  await expect(analyze).toBeVisible()

  const grip = async () => {
    const box = (await page.locator('.cursor-ns-resize').last().boundingBox())!
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }

  // What stands on top at a control's centre: the sheet, or the control.
  const onTop = (locator: typeof controls) =>
    locator.evaluate((el) => {
      const box = el.getBoundingClientRect()
      const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      return top?.closest('[data-tour="results"]') ? 'sheet' : el.contains(top) ? 'control' : 'other'
    })
  await expect.poll(() => onTop(controls)).toBe('control')

  // To the top: the sheet slides over the rows and the button, which are
  // out of reach under it.
  await dragTo(page, await grip(), 2)
  // The sheet's panels are sized from its header's estimate, so its top is
  // within a pixel or two of the screen's.
  await expect.poll(async () => (await sheet.boundingBox())!.y).toBeLessThan(3)
  await expect.poll(() => onTop(controls)).toBe('sheet')
  await expect.poll(() => onTop(fab)).toBe('sheet')
  await expect(page.locator('[data-map-overlay][inert]')).toHaveCount(1)

  // Back down to the middle: it holds there, and they come back.
  await dragTo(page, await grip(), 420)
  await expect.poll(async () => (await sheet.boundingBox())!.y).toBeGreaterThan(300)
  await expect.poll(() => onTop(controls)).toBe('control')
  await expect.poll(() => onTop(fab)).toBe('control')
  await expect(page.locator('[data-map-overlay][inert]')).toHaveCount(0)
})

test('a release short of the top falls back to the strip under the chips', async ({ page }) => {
  await page.goto(`/?mode=days&d1=${isoDay(1)}&d2=${isoDay(2)}&type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55`)
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  const analyze = page.getByRole('main').getByRole('button', { name: 'Analyze' })
  await analyze.tap()
  await expect(resultRows(page).first()).toBeAttached()

  const sheet = page.locator('[data-tour="results"]')
  const box = (await page.locator('.cursor-ns-resize').last().boundingBox())!
  const grip = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  // The sheet's top let go 120px down the screen: over the rows, and well
  // short of the top. The grip stands under the sheet's bar, so the finger
  // goes that much lower.
  const below = grip.y - (await sheet.boundingBox())!.y
  await dragTo(page, grip, 120 + below)
  // The cap leaves the rows and the button's strip, 176px of map.
  const top = async () => (await sheet.boundingBox())!.y
  await expect.poll(top).toBeGreaterThan(170)
  expect(await top()).toBeLessThan(182)
  await expect(analyze).toBeVisible()
})
