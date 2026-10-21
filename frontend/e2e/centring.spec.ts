import { test, expect, expectRanked, DESTINATION_NAMES } from './fixtures'
import type { Locator, Page } from '@playwright/test'

// A row centred while a desk's layout moves (#714; record 0202). The first
// report opens its panes over the foot of the map, and through that move the
// map's canvas holds the window's height, centred on the map's column; where
// the move ends it takes the column's height. A centring flight fixes its
// target in the canvas's pixels when it starts, so one pressed inside the
// move flew its marker to the middle of the held canvas, which the resize
// left under the results bar with the card off the map (2026-10-21). The
// flight is aimed again at the resize (`map/centring.ts`).

test.use({ viewport: { width: 1440, height: 900 } })

const RING = '-121.9,47.4;-121.7,47.4;-121.7,47.55'

interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

const canvasBox = (page: Page) =>
  page.evaluate(() => {
    const r = document.querySelector('.maplibregl-canvas')!.getBoundingClientRect()
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
  })

const inside = (p: { x: number; y: number }, b: Box) => p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom

// Where the card's marker stands, read off the tip on whichever side of the
// marker the card opened, once the flight has stopped moving it.
async function settledMarker(card: Locator) {
  const read = () =>
    card.evaluate((el) => {
      const tip = el.querySelector('.maplibregl-popup-tip')!.getBoundingClientRect()
      const below = el.classList.contains('maplibregl-popup-anchor-top')
      return { x: Math.round(tip.left + tip.width / 2), y: Math.round(below ? tip.top : tip.bottom) }
    })
  let last = ''
  await expect
    .poll(
      async () => {
        const now = JSON.stringify(await read())
        const still = now === last
        last = now
        return still
      },
      { intervals: [400] },
    )
    .toBe(true)
  return JSON.parse(last) as { x: number; y: number }
}

// Analyze, and press the first row's "Center map on" from inside the page,
// in the first frame where the row is ranked and the canvas still runs on
// under the results: a press sent from the test waits on a round trip and can
// land after the move. With `close`, the card the press opens is closed by its
// own button in the same frame, before the resize comes.
async function pressInsideTheMove(page: Page, { close = false } = {}) {
  await page.goto(`/?type=peak&poly=${RING}`)
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  const pressed = page.evaluate(
    ({ name, close }) =>
      new Promise<{ canvasHeight: number; closed: boolean } | null>((resolve) => {
        const deadline = performance.now() + 20_000
        const frame = () => {
          if (performance.now() > deadline) return resolve(null)
          const canvas = document.querySelector('.maplibregl-canvas')?.getBoundingClientRect()
          const results = document.querySelector('[data-tour="results"]')?.getBoundingClientRect()
          const button = document.querySelector<HTMLButtonElement>(`[aria-label="Center map on ${name}"]`)
          // A ranked row's rank is the first cell that holds no input, as
          // `expectRanked` reads it; a pending row's is a dash.
          const rank = button?.closest('tr')?.querySelector(':scope > td:not(:has(input))')?.textContent?.trim()
          if (canvas && results && button && rank === '1' && canvas.bottom > results.top + 1) {
            button.click()
            const shut = close ? document.querySelector<HTMLButtonElement>('.maplibregl-popup-close-button') : null
            shut?.click()
            return resolve({ canvasHeight: canvas.height, closed: shut !== null })
          }
          requestAnimationFrame(frame)
        }
        requestAnimationFrame(frame)
      }),
    { name: DESTINATION_NAMES[0], close },
  )
  await page.getByRole('button', { name: 'Analyze' }).click()
  const atPress = await pressed
  expect(atPress, 'a press while the panes were opening').not.toBeNull()
  await expectRanked(page)
  // The move is over once the canvas stands on the results' top.
  await expect
    .poll(async () => {
      const canvas = await canvasBox(page)
      const results = await page.locator('[data-tour="results"]').boundingBox()
      return Math.round(canvas.bottom) === Math.round(results!.y)
    })
    .toBe(true)
  return atPress!
}

test("a row centred while the first report's panes open lands its marker and card on the settled map", async ({
  page,
}) => {
  const atPress = await pressInsideTheMove(page)
  const card = page.locator('.maplibregl-popup').filter({ hasText: DESTINATION_NAMES[0] })
  await expect(card).toHaveCount(1)
  const marker = await settledMarker(card)
  const canvas = await canvasBox(page)
  const box = (await card.boundingBox())!
  const cardBox: Box = { left: box.x, top: box.y, right: box.x + box.width, bottom: box.y + box.height }
  test.info().annotations.push({
    type: 'centred inside the move',
    description: JSON.stringify({ heightAtPress: atPress.canvasHeight, canvas, marker, card: cardBox }),
  })

  // The press came while the canvas held its taller box.
  expect(atPress.canvasHeight).toBeGreaterThan(canvas.bottom - canvas.top)
  // The marker on the settled map, and its card whole on it.
  expect(inside(marker, canvas), `marker ${JSON.stringify(marker)} on ${JSON.stringify(canvas)}`).toBe(true)
  // Half a pixel either way, for the card's fractional edges.
  const room = { left: canvas.left - 0.5, top: canvas.top - 0.5, right: canvas.right + 0.5, bottom: canvas.bottom + 0.5 }
  for (const corner of [
    { x: cardBox.left, y: cardBox.top },
    { x: cardBox.right, y: cardBox.bottom },
  ]) {
    expect(inside(corner, room), `card ${JSON.stringify(cardBox)} on ${JSON.stringify(canvas)}`).toBe(true)
  }
})

// The flight sent again at the resize must not open a card the reader closed
// while the first was in the air; the next report closes one the same way
// (`popup.spec.ts`). The marker still lands on the settled map.
test('a card closed while its centring is in the air stays closed when the map is resized', async ({ page }) => {
  const atPress = await pressInsideTheMove(page, { close: true })
  expect(atPress.closed, 'the card closed before the resize').toBe(true)
  const popups = page.locator('.maplibregl-popup')
  // The flight has landed once the link's camera, written after each settled
  // move, reads the same twice.
  let last: string | null = null
  await expect
    .poll(
      () => {
        const now = new URL(page.url()).searchParams.get('view')
        const still = now !== null && now === last
        last = now
        return still
      },
      { intervals: [1_000] },
    )
    .toBe(true)
  await expect(popups).toHaveCount(0)

  // Where the marker stands: a card opens at its marker, placed before its
  // own flight moves anything, so a second press read at once says where the
  // first flight left it.
  const marker = await page.evaluate((name) => {
    document.querySelector<HTMLButtonElement>(`[aria-label="Center map on ${name}"]`)!.click()
    const card = document.querySelector('.maplibregl-popup')!
    const tip = card.querySelector('.maplibregl-popup-tip')!.getBoundingClientRect()
    const below = card.classList.contains('maplibregl-popup-anchor-top')
    return { x: Math.round(tip.left + tip.width / 2), y: Math.round(below ? tip.top : tip.bottom) }
  }, DESTINATION_NAMES[0])
  const canvas = await canvasBox(page)
  test.info().annotations.push({
    type: 'closed inside the move',
    description: JSON.stringify({ heightAtPress: atPress.canvasHeight, canvas, marker }),
  })
  expect(atPress.canvasHeight).toBeGreaterThan(canvas.bottom - canvas.top)
  expect(inside(marker, canvas), `marker ${JSON.stringify(marker)} on ${JSON.stringify(canvas)}`).toBe(true)
})
