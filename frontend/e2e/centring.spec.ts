import { test, expect, expectRanked, DESTINATION_NAMES, forecastButton } from './fixtures'
import type { Locator, Page } from '@playwright/test'

// A row centred while a desk's layout moves (#714; record 0202). The results'
// column coming back from the map's edge narrows the map, and until MapLibre
// resizes its canvas the canvas keeps the width it had. A centring flight
// fixes its target in the canvas's pixels when it starts, so one pressed
// inside the move flew its marker to the middle of the wider canvas, which
// the resize left under the column with the card off the map (2026-10-21,
// when the move was the chart's pane opening under the map, record 0312,
// which the compact column retired, record 0321). The flight is aimed again
// at the resize (`map/centring.ts`).

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

// Analyze, fold the column away, and bring it back from the map's edge,
// pressing the first row's "Center map on" from inside the page as soon as
// the row stands while the canvas still has the map's old width: a press
// sent from the test waits on a round trip and can land after the resize.
// The row is watched for as the DOM changes, not only once a frame, because
// the column comes back whole rather than moving, and the resize that
// follows it can land before the next frame's callback. With `close`, the card the press opens is closed by its own button
// in the same frame, before the resize comes.
const column = (page: Page) => page.locator('[data-tour="results"]')

async function pressInsideTheMove(page: Page, { close = false } = {}) {
  await page.goto(`/?type=peak&poly=${RING}`)
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  // The ground's first tiles drawn (record 0317), so a cold worker's first
  // frames of shading do not swallow the move this presses inside.
  await page.waitForLoadState('networkidle')
  await forecastButton(page).click()
  await expectRanked(page)
  await page.getByRole('button', { name: 'Collapse results' }).click()
  await expect(column(page)).toHaveCount(0)
  const atPress = await page.evaluate(
    ({ name, close }) =>
      new Promise<{ canvasWidth: number; closed: boolean } | null>((resolve) => {
        const deadline = performance.now() + 20_000
        let done = false
        const check = () => {
          if (done) return
          if (performance.now() > deadline) {
            done = true
            observer.disconnect()
            return resolve(null)
          }
          const canvas = document.querySelector('.maplibregl-canvas')?.getBoundingClientRect()
          const results = document.querySelector('[data-tour="results"]')?.getBoundingClientRect()
          const button = document.querySelector<HTMLButtonElement>(`[aria-label="Center map on ${name}"]`)
          if (canvas && results && button && canvas.right > results.left + 1) {
            done = true
            observer.disconnect()
            button.click()
            const shut = close ? document.querySelector<HTMLButtonElement>('.maplibregl-popup-close-button') : null
            shut?.click()
            return resolve({ canvasWidth: canvas.width, closed: shut !== null })
          }
        }
        const observer = new MutationObserver(check)
        observer.observe(document.body, { childList: true, subtree: true })
        document.querySelector<HTMLButtonElement>('[aria-label="Expand results"]')!.click()
        const frame = () => {
          check()
          if (!done) requestAnimationFrame(frame)
        }
        frame()
      }),
    { name: DESTINATION_NAMES[0], close },
  )
  expect(atPress, 'a press while the column was coming back').not.toBeNull()
  // The move is over once the canvas stands on the column's left edge.
  await expect
    .poll(async () => {
      const canvas = await canvasBox(page)
      const results = await column(page).boundingBox()
      return results !== null && Math.round(canvas.right) === Math.round(results.x)
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
    description: JSON.stringify({ widthAtPress: atPress.canvasWidth, canvas, marker, card: cardBox }),
  })

  // The press came while the canvas held its wider box.
  expect(atPress.canvasWidth).toBeGreaterThan(canvas.right - canvas.left)
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
    description: JSON.stringify({ widthAtPress: atPress.canvasWidth, canvas, marker }),
  })
  expect(atPress.canvasWidth).toBeGreaterThan(canvas.right - canvas.left)
  expect(inside(marker, canvas), `marker ${JSON.stringify(marker)} on ${JSON.stringify(canvas)}`).toBe(true)
})
