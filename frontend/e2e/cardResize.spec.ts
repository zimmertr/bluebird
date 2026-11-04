import type { Locator, Page } from '@playwright/test'
import { test, expect, expectRanked, DESTINATION_NAMES, FIRE_DETECTION } from './fixtures'

// A card on the map is sized by the handle in its bottom-right corner (TJ,
// 2026-11-03, record 0270). The unit suites pin the bounds and the drag's
// arithmetic against stubs; this drags the built card's handle with a real
// pointer and checks that the card grew, stands on its point, and that the
// next card opens at the size the drag left; and that the drag's bounds are
// the reader's (TJ, 2026-11-04): a ranked card dragged far up and left stops
// at the width it opened at and a quarter of the map, its lines whole, and a
// short card dragged down stands taller than what it holds, past the three
// quarters of the map the app caps a card by, up to the free map's height.
// At a desk only: a
// finger's drag is the same pointer events, and the phone's 32px box is the
// role's, which `styles.test.ts` pins.

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
// body, its tip and the map's canvas, in the page's pixels; whether the body
// scrolls, and how much of it its sections fill; the text of every line the
// card cuts with its ellipsis, and whether its title is one; and the two
// heights a drag stands a body between (`dragBodyRange` in
// utils/popup/popupFit.ts): a quarter of the canvas, a desk's visible map,
// and the free map, the canvas less the fit's 8px at each edge, the marker's
// 8 and the tip's 10, less the card's header and tip.
async function measure(card: Locator) {
  return card.evaluate((el) => {
    const box = (e: Element | null) => {
      const r = e!.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }
    }
    const body = el.querySelector<HTMLElement>('[data-popup-body]')!
    const canvas = document.querySelector<HTMLElement>('.maplibregl-canvas')!
    const last = body.lastElementChild!.getBoundingClientRect()
    const isCut = (e: Element) => getComputedStyle(e).textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1
    const title = el.querySelector('.maplibregl-popup-content strong')!
    return {
      card: box(el.querySelector('.maplibregl-popup-content')),
      body: box(body),
      tip: box(el.querySelector('.maplibregl-popup-tip')),
      map: box(canvas),
      scrolls: body.scrollHeight > body.clientHeight + 1,
      emptyBelow: body.getBoundingClientRect().bottom - last.bottom,
      cut: [...el.querySelectorAll('*')].filter(isCut).map((e) => e.textContent),
      titleCut: isCut(title),
      floor: Math.floor(canvas.clientHeight / 4),
      freeMap: canvas.clientHeight - 34 - ((el as HTMLElement).offsetHeight - body.offsetHeight),
    }
  })
}

// A drag on the handle from its middle by `dx` and `dy`, in steps, as a hand
// drags; the handle's box before it.
async function drag(page: Page, card: Locator, dx: number, dy: number) {
  const grip = (await card.locator('[data-card-resize]').boundingBox())!
  const from = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 6 })
  await page.mouse.up()
  return { grip, from }
}

test('a drag on a card’s corner sizes it, and the next card opens at that size', async ({ page }) => {
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

  // 60px right and 30 up.
  await drag(page, card, 60, -30)

  const after = await measure(card)
  test.info().annotations.push({ type: 'card resize', description: JSON.stringify({ before, after }) })
  // The card stands centred on its point, so it grows 60px a side and the
  // tip stays where it was.
  expect(after.card.width).toBeGreaterThan(before.card.width + 100)
  // Within a pixel: MapLibre rounds a popup's place to whole pixels.
  expect(Math.abs(after.tip.left + after.tip.width / 2 - (before.tip.left + before.tip.width / 2))).toBeLessThanOrEqual(1)
  // The body takes the pointer's travel up, whatever cap it opened under,
  // down to the quarter of the map a drag stops at.
  expect(Math.abs(after.body.height - Math.max(before.body.height - 30, after.floor))).toBeLessThanOrEqual(1)

  // The next card opens at the width and the height the drag left.
  await card.locator('.maplibregl-popup-close-button').click()
  const next = await measure(await centredCard(page, DESTINATION_NAMES[1]))
  expect(Math.abs(next.card.width - after.card.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(next.body.height - Math.min(after.body.height, next.freeMap))).toBeLessThanOrEqual(1)
})

// Dragged far up and left, a ranked card stops at the width it opened at,
// which is what its own lines asked for, and its body at a quarter of the
// map, scrolling the forecast under it: the maintainer's drag to the old
// floors left a 180px card with its title, coordinates and heading cut and a
// 48px body cut mid-row (TJ, 2026-11-04).
test('a ranked card dragged far up and left stops at its opening width and a quarter of the map', async ({ page }) => {
  await page.goto(`/?type=peak&poly=${RING}`)
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Analyze' }).click()
  await expectRanked(page)
  await resultsOpened(page)

  const card = await centredCard(page, DESTINATION_NAMES[0])
  const before = await measure(card)
  const grip = (await card.locator('[data-card-resize]').boundingBox())!
  // To the page's top left corner, far past the card's own size.
  await drag(page, card, 5 - (grip.x + grip.width / 2), 5 - (grip.y + grip.height / 2))
  const after = await measure(card)
  test.info().annotations.push({ type: 'card shrunk', description: JSON.stringify({ before, after }) })
  expect(Math.abs(after.card.width - before.card.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(after.body.height - after.floor)).toBeLessThanOrEqual(1)
  expect(after.scrolls).toBe(true)
  // Nothing the card showed whole is cut, the title least of all.
  expect(after.titleCut).toBe(false)
  expect(after.cut).toEqual(before.cut)
})

// A short card dragged down stands taller than what it holds, the card's
// surface under its last section, rather than refusing a height it has no
// content for: the spot's card on a satellite fire detection, one section
// before any analysis.
test('a short card dragged down stands taller than what it holds', async ({ page }) => {
  await page.goto(`/?view=${FIRE_DETECTION.lng},${FIRE_DETECTION.lat},12&fireactivity=1`)
  const canvas = page.locator('.maplibregl-canvas')
  await expect(canvas).toBeVisible()
  const box = (await canvas.boundingBox())!
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  // The star draws once the answer lands, which nothing announces.
  await expect
    .poll(async () => {
      await page.mouse.move(at.x - 2, at.y)
      await page.mouse.move(at.x, at.y)
      return canvas.evaluate((el) => (el as HTMLElement).style.cursor)
    })
    .toBe('pointer')
  await page.mouse.click(at.x, at.y)
  const card = page.locator('.maplibregl-popup')
  await expect(card.getByText('Fire activity: Hotspot', { exact: true })).toBeVisible()
  // Read once the open's pan has settled.
  await page.waitForTimeout(600)
  const before = await measure(card)
  expect(before.scrolls).toBe(false)

  await drag(page, card, 0, 150)
  const after = await measure(card)
  test.info().annotations.push({ type: 'card grown', description: JSON.stringify({ before, after }) })
  expect(Math.abs(after.body.height - Math.min(before.body.height + 150, after.freeMap))).toBeLessThanOrEqual(1)
  expect(after.scrolls).toBe(false)
  // The surface the drag added stands under the last section.
  expect(after.emptyBelow).toBeGreaterThan(before.emptyBelow + 140)
})

// On a short map a ranked card opens capped, and a drag down opens its body
// as far as the free map's height, past whatever the open's cap was, and no
// further.
test.describe('at a short viewport', () => {
  test.use({ viewport: { width: 1280, height: 600 } })

  test('a capped ranked card dragged down opens to the free map’s height', async ({ page }) => {
    await page.goto(`/?type=peak&poly=${RING}`)
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    await page.getByRole('button', { name: 'Analyze' }).click()
    await expectRanked(page)
    await resultsOpened(page)

    const card = await centredCard(page, DESTINATION_NAMES[0])
    const before = await measure(card)
    const grip = (await card.locator('[data-card-resize]').boundingBox())!
    const travel = 598 - (grip.y + grip.height / 2)
    await drag(page, card, 0, travel)
    const after = await measure(card)
    test.info().annotations.push({ type: 'capped card grown', description: JSON.stringify({ before, after }) })
    expect(after.body.height).toBeGreaterThan(before.body.height)
    expect(Math.abs(after.body.height - Math.min(before.body.height + travel, after.freeMap))).toBeLessThanOrEqual(1)
    expect(after.body.height).toBeLessThanOrEqual(after.freeMap + 1)
  })
})
