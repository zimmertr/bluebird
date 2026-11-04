import type { Locator, Page } from '@playwright/test'
import { test, expect, expectRanked, DESTINATION_NAMES } from './fixtures'

// A card on the map is sized by the handle in its bottom-right corner (TJ,
// 2026-11-03, record 0270). The unit suites pin the bounds and the drag's
// arithmetic against stubs; this drags the built card's handle with a real
// pointer and checks that the card grew, stands on its point, and keeps its
// body inside the map and under three quarters of it, and that the next card
// opens at the size the drag left. At a desk only: a finger's drag is the same
// pointer events, and the phone's 32px box is the role's, which
// `styles.test.ts` pins.

test.use({ viewport: { width: 1280, height: 800 } })

const RING = '-121.9,47.4;-121.7,47.4;-121.7,47.55'

// The marker's card for a row, once the map has stopped moving: centring a
// row flies the map and then pans it for the card, and the card rides along.
async function centredCard(page: Page, name: string): Promise<Locator> {
  await page.getByRole('button', { name: `Center map on ${name}` }).click()
  const card = page.locator('.maplibregl-popup').filter({ hasText: name })
  await expect(card).toHaveCount(1)
  let last = ''
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await card.boundingBox())
        const still = now === last
        last = now
        return still
      },
      { intervals: [400] },
    )
    .toBe(true)
  return card
}

// At a desk the report's panes open over the foot of the map about half a
// second after the ranking lands (record 0202), and a row centred before then
// aims at the taller canvas. Wait until the canvas stands on the results.
async function resultsOpened(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const canvas = document.querySelector('.maplibregl-canvas')?.getBoundingClientRect()
        const results = document.querySelector('[data-tour="results"]')?.getBoundingClientRect()
        return canvas !== undefined && results !== undefined && Math.round(canvas.bottom) === Math.round(results.top)
      }),
    )
    .toBe(true)
}

// The card's box (MapLibre's content box, which the tip stands outside), its
// body, its tip and the map's canvas, in the page's pixels.
async function measure(card: Locator) {
  return card.evaluate((el) => {
    const box = (e: Element | null) => {
      const r = e!.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }
    }
    return {
      card: box(el.querySelector('.maplibregl-popup-content')),
      body: box(el.querySelector('[data-popup-body]')),
      tip: box(el.querySelector('.maplibregl-popup-tip')),
      map: box(document.querySelector('.maplibregl-canvas')),
    }
  })
}

test('a drag on a card’s corner sizes it, inside the map, and the next card opens at that size', async ({ page }) => {
  await page.goto(`/?type=peak&poly=${RING}`)
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Analyze' }).click()
  await expectRanked(page)
  await resultsOpened(page)

  const card = await centredCard(page, DESTINATION_NAMES[0])
  const handle = card.locator('[data-card-resize]')
  // Pointer-only: nothing for a screen reader to name or a keyboard to reach.
  await expect(handle).toHaveAttribute('aria-hidden', 'true')
  const before = await measure(card)
  const grip = (await handle.boundingBox())!
  // The handle stands in the card's bottom-right corner.
  expect(Math.abs(grip.x + grip.width - before.card.right)).toBeLessThanOrEqual(1)
  expect(Math.abs(grip.y + grip.height - before.card.bottom)).toBeLessThanOrEqual(1)

  // 60px right and 30 up, in steps, as a hand drags. Up, because the drag
  // holds the body between a quarter and three quarters of the map rather
  // than to where its card stands, so a body the fit had capped against the
  // results could be dragged past them.
  const from = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 60, from.y - 30, { steps: 6 })
  await page.mouse.up()

  const after = await measure(card)
  test.info().annotations.push({ type: 'card resize', description: JSON.stringify({ before, after }) })
  // The card stands centred on its point, so it grows 60px a side and the
  // tip stays where it was.
  expect(after.card.width).toBeGreaterThan(before.card.width + 100)
  // Within a pixel: MapLibre rounds a popup's place to whole pixels.
  expect(Math.abs(after.tip.left + after.tip.width / 2 - (before.tip.left + before.tip.width / 2))).toBeLessThanOrEqual(1)
  // The body fits the map, and under three quarters of its height.
  for (const box of [after.card, after.body]) {
    expect(box.left).toBeGreaterThanOrEqual(after.map.left)
    expect(box.right).toBeLessThanOrEqual(after.map.right)
    expect(box.top).toBeGreaterThanOrEqual(after.map.top)
    expect(box.bottom).toBeLessThanOrEqual(after.map.bottom)
  }
  expect(after.body.height).toBeLessThanOrEqual(after.map.height * 0.75 + 1)
  // Shorter for the drag up, and never under its floor, a quarter of the map.
  expect(after.body.height).toBeLessThanOrEqual(before.body.height)
  expect(after.body.height).toBeGreaterThanOrEqual(Math.min(before.body.height, after.map.height * 0.25) - 1)

  // The next card opens at the width the drag left.
  await card.locator('.maplibregl-popup-close-button').click()
  const next = await centredCard(page, DESTINATION_NAMES[1])
  expect(Math.abs((await measure(next)).card.width - after.card.width)).toBeLessThanOrEqual(1)
})
