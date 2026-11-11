import type { Locator, Page } from '@playwright/test'
import { test, expect, expectRanked, DESTINATION_NAMES, FIRE_DETECTION } from './fixtures'

// A card on the map is sized by the handle in its bottom-right corner (TJ,
// 2026-11-03, record 0270). The unit suites pin the bounds and the drag's
// arithmetic against stubs; this drags the built card's handle with a real
// pointer and checks that the card grew, stands on its point, and that the
// next card opens at its own size, not the one the drag left (TJ,
// 2026-11-04); that a ranked card dragged far up and left stops at the width
// it opened at and a quarter of the map, its lines whole; that a card dragged
// far down and right stops at the map's edge, never running off it; that a
// short card dragged down stands taller than what it holds, up to the room
// where it stands; and that a double click on the handle puts the card back
// at its opening size. At a desk only: a finger's drag is the same pointer events, and the
// phone's 32px box is the role's, which `styles.test.ts` pins.

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
// and the room where the card stands (`standingRoom`), from the card's top
// to the canvas's foot less the fit's 8px for a card hanging below its
// point, or from the canvas's top plus 8 to the card's foot for one standing
// above it, less the card's header.
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
      // The nearest surface over the map (`data-map-overlay`) beside the
      // card, across from its left or right side within its height, and how
      // far off: a drag that widens the card stops 8px short of it.
      // The same for a surface under the card, across from its foot within
      // its width.
      under: (() => {
        const card = el.querySelector('.maplibregl-popup-content')!.getBoundingClientRect()
        const gaps = [...document.querySelectorAll('[data-map-overlay]')]
          .map((o) => o.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0 && r.left < card.right + 8 && r.right > card.left - 8 && r.top >= card.bottom)
          .map((r) => r.top - card.bottom)
        return gaps.length ? Math.min(...gaps) : null
      })(),
      beside: (() => {
        const card = el.querySelector('.maplibregl-popup-content')!.getBoundingClientRect()
        const gaps = [...document.querySelectorAll('[data-map-overlay]')]
          .map((o) => o.getBoundingClientRect())
          .filter((r) => r.width > 0 && r.height > 0 && r.top < card.bottom + 8 && r.bottom > card.top - 8)
          .map((r) => (r.left >= card.right ? r.left - card.right : r.right <= card.left ? card.left - r.right : -1))
          .filter((gap) => gap >= 0)
        return gaps.length ? Math.min(...gaps) : null
      })(),
      room: (() => {
        const content = el.querySelector('.maplibregl-popup-content')!.getBoundingClientRect()
        const map = canvas.getBoundingClientRect()
        const tip = el.querySelector('.maplibregl-popup-tip')!.getBoundingClientRect()
        const header = content.height - body.getBoundingClientRect().height
        const below = tip.top < content.top
        return (below ? map.bottom - 8 - content.top : content.bottom - (map.top + 8)) - header
      })(),
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

// That a drag widened the card by `by`, or stopped it 8px short of a surface
// over the map beside it, as the drag's bounds do (`clearSize`).
function widened(before: Awaited<ReturnType<typeof measure>>, after: Awaited<ReturnType<typeof measure>>, by: number) {
  const note = JSON.stringify({ before: before.card, after: after.card, beside: after.beside })
  if (after.card.width > before.card.width + by) return
  expect(after.beside, note).not.toBeNull()
  expect(Math.abs(after.beside! - 8), note).toBeLessThanOrEqual(2)
}

// How many of the surfaces that stand over the map (`data-map-overlay`: the
// rows, the legend, the scale and the credits) the card's box reaches under.
async function overlaid(card: Locator): Promise<number> {
  return card.evaluate((el) => {
    const box = el.querySelector('.maplibregl-popup-content')!.getBoundingClientRect()
    return [...document.querySelectorAll('[data-map-overlay]')]
      .map((o) => o.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .filter((r) => r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top).length
  })
}

test('a drag on a card’s corner sizes it, and the next card opens at its own size', async ({ page }) => {
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
  // tip stays where it was, unless a surface over the map beside it stops
  // it 8px short (TJ, 2026-11-04).
  widened(before, after, 100)
  // Within a pixel: MapLibre rounds a popup's place to whole pixels.
  expect(Math.abs(after.tip.left + after.tip.width / 2 - (before.tip.left + before.tip.width / 2))).toBeLessThanOrEqual(1)
  // The body takes the pointer's travel up, whatever cap it opened under,
  // down to the quarter of the map a drag stops at.
  expect(Math.abs(after.body.height - Math.max(before.body.height - 30, after.floor))).toBeLessThanOrEqual(1)

  // The size was that card's alone: the same row's card opens at the size it
  // first opened at, as a pinned chart card does.
  await card.locator('.maplibregl-popup-close-button').click()
  const next = await measure(await centredCard(page, DESTINATION_NAMES[0]))
  expect(Math.abs(next.card.width - before.card.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(next.body.height - before.body.height)).toBeLessThanOrEqual(1)
})

// A double click on the handle puts the card back at the size it opened at
// (TJ, 2026-11-04, record 0270): the card stands at its opening width and
// height on its point again.
test('a double click on a card’s corner puts it back at its opening size', async ({ page }) => {
  await page.goto(`/?type=peak&poly=${RING}`)
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Analyze' }).click()
  await expectRanked(page)
  await resultsOpened(page)

  const card = await centredCard(page, DESTINATION_NAMES[0])
  const before = await measure(card)
  await drag(page, card, 80, 120)
  const dragged = await measure(card)
  widened(before, dragged, 100)

  const grip = (await card.locator('[data-card-resize]').boundingBox())!
  await page.mouse.dblclick(grip.x + grip.width / 2, grip.y + grip.height / 2)
  // The re-fit can pan the map, and the card rides along: read it once still.
  await expect
    .poll(async () => Math.round((await measure(card)).card.width), { intervals: [200] })
    .toBe(Math.round(before.card.width))
  const reset = await measure(card)
  test.info().annotations.push({ type: 'card reset', description: JSON.stringify({ before, dragged, reset }) })
  expect(Math.abs(reset.body.height - before.body.height)).toBeLessThanOrEqual(1)
  expect(reset.cut).toEqual(before.cut)

  // The same row's card again opens at the size it first opened at.
  await card.locator('.maplibregl-popup-close-button').click()
  const again = await measure(await centredCard(page, DESTINATION_NAMES[0]))
  expect(Math.abs(again.card.width - before.card.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(again.body.height - before.body.height)).toBeLessThanOrEqual(1)
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

// Dragged far down and right, a card stops at the map's edge: its width at
// twice the distance from its point to the nearer side, its body at the room
// on its side of its point, so it never runs off the map and under the
// panel or the results (TJ, 2026-11-04).
test('a card dragged far down and right stops at the map’s edge', async ({ page }) => {
  await page.goto(`/?type=peak&poly=${RING}`)
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Analyze' }).click()
  await expectRanked(page)
  await resultsOpened(page)

  const card = await centredCard(page, DESTINATION_NAMES[0])
  await drag(page, card, 2000, 2000)
  const after = await measure(card)
  test.info().annotations.push({ type: 'card at the edge', description: JSON.stringify(after) })
  expect(after.card.left).toBeGreaterThanOrEqual(after.map.left + 7)
  expect(after.card.right).toBeLessThanOrEqual(after.map.right - 7)
  expect(after.card.top).toBeGreaterThanOrEqual(after.map.top + 7)
  expect(after.card.bottom).toBeLessThanOrEqual(after.map.bottom - 7)
  // Nor under the scale, the credits or anything else that stands over the
  // map, where its handle could not be reached again.
  expect(await overlaid(card)).toBe(0)
})

// A wheel over a card zooms the map (TJ, 2026-11-04): a card rides its
// point, so a zoom out draws it under the cursor, and the zoom stopped dead
// on it. Over the card's header, which scrolls nothing, every notch is
// handed to the map's own box.
test('a wheel over a card is handed to the map', async ({ page }) => {
  await page.goto(`/?type=peak&poly=${RING}`)
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Analyze' }).click()
  await expectRanked(page)
  await resultsOpened(page)

  const card = await centredCard(page, DESTINATION_NAMES[0])
  const scale = page.locator('.maplibregl-ctrl-scale').first()
  const before = await scale.textContent()
  // Every wheel the map's own box hears from the card, handed on there
  // since the card stands outside it.
  await page.evaluate(() => {
    const w = window as unknown as { heard: number }
    w.heard = 0
    const box = document.querySelector('.maplibregl-canvas-container')!
    box.addEventListener('wheel', (e) => {
      if (e.target === box) w.heard += 1
    })
  })
  // Over the title, which scrolls nothing, a few notches as a wheel turns.
  const title = (await card.locator('strong').first().boundingBox())!
  await page.mouse.move(title.x + 10, title.y + title.height / 2)
  for (let i = 0; i < 4; i += 1) {
    await page.mouse.wheel(0, 100)
    await page.waitForTimeout(60)
  }
  const heard = await page.evaluate(() => (window as unknown as { heard: number }).heard)
  expect(heard).toBe(4)
  // The map zooms on them: measured in Chrome on the PR's preview, where the
  // scale went from 30 km to 50 km under three notches over a card. Here the
  // page's installed clock can hold MapLibre's easing, so the scale is
  // recorded rather than held to.
  await page.waitForTimeout(500)
  test.info().annotations.push({ type: 'scale', description: `${before} to ${await scale.textContent()}` })
  await expect(card).toBeVisible()
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
  // Up to the room where it stands, or 8px over a surface over the map
  // under it, the scale or the credits, where its handle would be out of
  // reach (TJ, 2026-11-04).
  const note = JSON.stringify({ before: before.body, after: after.body, room: before.room, under: after.under })
  const most = Math.min(before.body.height + 150, before.room)
  expect(after.body.height, note).toBeLessThanOrEqual(most + 2)
  if (after.body.height < most - 2) expect(Math.abs((after.under ?? 0) - 8), note).toBeLessThanOrEqual(2)
  expect(after.body.height, note).toBeGreaterThan(before.body.height + 60)
  expect(await overlaid(card)).toBe(0)
  expect(after.scrolls).toBe(false)
  // The surface the drag added stands under the last section.
  expect(after.emptyBelow).toBeGreaterThan(before.emptyBelow + (after.body.height - before.body.height) - 10)
})

// On a short map a ranked card opens capped, and a drag down opens its body
// as far as the room where it stands, past whatever the open's cap was, and
// no further.
test.describe('at a short viewport', () => {
  test.use({ viewport: { width: 1280, height: 600 } })

  test('a capped ranked card dragged down opens to the room where it stands', async ({ page }) => {
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
    expect(after.body.height).toBeGreaterThanOrEqual(before.body.height - 1)
    // Short of the room only where the scale or the credits stand in it.
    expect(after.body.height).toBeLessThanOrEqual(Math.min(before.body.height + travel, before.room) + 2)
    expect(await overlaid(card)).toBe(0)
    expect(after.card.bottom).toBeLessThanOrEqual(after.map.bottom - 7)
  })
})
