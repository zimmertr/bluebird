import { test, expect, resultRows, DESTINATION_NAMES } from './fixtures'
import type { Page } from '@playwright/test'

// The desk panel pushes the map's edge (#714; record 0202): it stays in the
// row while it is shut and its margin takes its 360px back, so the map's
// column narrows and widens in the frames the panel moves in, over the
// panel's 300ms both ways, and nothing is painted over anything. A press on
// Table, Chart or Both opens and closes the results panes at the same speed.
// Measured on the live layout, frame by frame, since jsdom lays nothing out.

const PANEL_PX = 360
const PANEL_S = '0.3s'

// Every frame for `ms` after a press, read in the frame: the panel's right
// edge, the map column's left edge and width, the results' top, and the
// width of the map's canvas, which changes only when the map is resized.
function framesAfter(page: Page, press: string, ms: number) {
  return page.evaluate(
    async ([selector, windowMs]) => {
      const aside = document.querySelector('aside')!
      const map = document.querySelector('main')!.firstElementChild!
      const results = document.querySelector('[data-tour="results"]')
      const canvas = document.querySelector('.maplibregl-canvas') as HTMLCanvasElement
      const frames: {
        panelRight: number
        mapLeft: number
        mapWidth: number
        mapBottom: number
        resultsTop: number
        canvasWidth: number
      }[] = []
      ;(document.querySelector(selector) as HTMLElement).click()
      const t0 = performance.now()
      await new Promise<void>((resolve) => {
        const tick = () => {
          const m = map.getBoundingClientRect()
          frames.push({
            panelRight: aside.getBoundingClientRect().right,
            mapLeft: m.left,
            mapWidth: m.width,
            mapBottom: m.bottom,
            resultsTop: results ? results.getBoundingClientRect().top : NaN,
            canvasWidth: canvas.width,
          })
          if (performance.now() - t0 < windowMs) requestAnimationFrame(tick)
          else resolve()
        }
        requestAnimationFrame(tick)
      })
      return frames
    },
    [press, ms] as const,
  )
}

const transitionOf = (page: Page) =>
  page.locator('aside').evaluate((el) => {
    const s = getComputedStyle(el)
    return { property: s.transitionProperty, duration: s.transitionDuration }
  })

test.use({ viewport: { width: 1440, height: 900 } })

test('the desk panel pushes the map both ways at one speed', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  const width = page.viewportSize()!.width

  // Open: the panel is 360px and the map's column starts at its edge.
  await expect(page.locator('aside')).toHaveJSProperty('offsetWidth', PANEL_PX)
  const open = await transitionOf(page)
  expect(open).toEqual({ property: 'margin-left', duration: PANEL_S })

  const closing = await framesAfter(page, 'button[aria-label="Close controls"]', 800)
  const shut = await transitionOf(page)
  expect(shut).toEqual(open)
  // In every frame the map's left edge is the panel's right edge: the panel
  // pushes the map rather than sliding over it, and at least one frame was
  // drawn with the panel part way out.
  for (const f of closing) expect(Math.abs(f.mapLeft - Math.max(0, f.panelRight))).toBeLessThan(1)
  expect(closing.some((f) => f.panelRight > 5 && f.panelRight < PANEL_PX - 5)).toBe(true)
  const closed = closing[closing.length - 1]
  expect(closed.panelRight).toBeLessThanOrEqual(0)
  expect(closed.mapWidth).toBe(width)

  const opening = await framesAfter(page, 'button[aria-label="Open controls"]', 800)
  for (const f of opening) expect(Math.abs(f.mapLeft - Math.max(0, f.panelRight))).toBeLessThan(1)
  expect(opening.some((f) => f.panelRight > 5 && f.panelRight < PANEL_PX - 5)).toBe(true)
  const reopened = opening[opening.length - 1]
  expect(reopened.panelRight).toBe(PANEL_PX)
  expect(reopened.mapWidth).toBe(width - PANEL_PX)
})

// How many sizes the map's canvas took over a move: one where the move starts
// at the size it ends at, two where it is resized once, at either end.
const canvasSizes = (frames: { canvasWidth: number }[]) => new Set(frames.map((f) => f.canvasWidth)).size

test('the map is resized once a move, not in every frame, after a move that ended late too', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  // A close resizes the map at its start and an open at its end (record 0202).
  expect(canvasSizes(await framesAfter(page, 'button[aria-label="Close controls"]', 800))).toBeLessThanOrEqual(2)
  expect(canvasSizes(await framesAfter(page, 'button[aria-label="Open controls"]', 800))).toBeLessThanOrEqual(2)

  // A close at a twentieth of its speed outlasts the hold's fallback, so its
  // end comes after the hold has let go; the open after it is held all the
  // same.
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Animation.enable')
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 0.05 })
  const ended = page.locator('aside').evaluate(
    (el) =>
      new Promise<void>((resolve) =>
        el.addEventListener('transitionend', (e) => {
          if (e.target === el && e.propertyName === 'margin-left') resolve()
        }),
      ),
  )
  await page.getByRole('button', { name: 'Close controls' }).click()
  await ended
  await cdp.send('Animation.setPlaybackRate', { playbackRate: 1 })
  expect(canvasSizes(await framesAfter(page, 'button[aria-label="Open controls"]', 800))).toBeLessThanOrEqual(2)
})

test('under a reduced-motion setting the panel moves at once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  const width = page.viewportSize()!.width
  expect((await transitionOf(page)).property).toBe('none')

  const closing = await framesAfter(page, 'button[aria-label="Close controls"]', 200)
  // The first frame after the press is already the closed layout.
  expect(closing[0].panelRight).toBeLessThanOrEqual(0)
  expect(closing[0].mapWidth).toBe(width)
  const opening = await framesAfter(page, 'button[aria-label="Open controls"]', 200)
  expect(opening[0].panelRight).toBe(PANEL_PX)
  expect(opening[0].mapWidth).toBe(width - PANEL_PX)
})

test('a press on Both opens the chart pane at the panel speed, holding the map to the results', async ({ page }) => {
  await page.goto('/?type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Analyze' }).click()
  await expect(resultRows(page)).toHaveCount(DESTINATION_NAMES.length)
  await page.getByRole('button', { name: 'Show table only' }).click()
  await expect(page.locator('[data-tour="results"] .recharts-wrapper')).toHaveCount(0)
  const mapBottom = () => page.locator('main > div').first().evaluate((el) => el.getBoundingClientRect().bottom)
  const before = await mapBottom()

  const opening = await framesAfter(page, 'button[aria-label="Show both chart and table"]', 900)
  // The map's foot stands on the results' top in every frame, and the map
  // shrank over several frames rather than in one.
  for (const f of opening) expect(Math.abs(f.mapBottom - f.resultsTop)).toBeLessThan(1)
  const heights = [...new Set(opening.map((f) => Math.round(f.mapBottom)))]
  expect(heights.length).toBeGreaterThan(2)

  const closing = await framesAfter(page, 'button[aria-label="Show table only"]', 900)
  for (const f of closing) expect(Math.abs(f.mapBottom - f.resultsTop)).toBeLessThan(1)
  expect([...new Set(closing.map((f) => Math.round(f.mapBottom)))].length).toBeGreaterThan(2)
  // Back where it started, with the chart gone once its pane had shut.
  expect(closing[closing.length - 1].mapBottom).toBeCloseTo(before, 0)
  await expect(page.locator('[data-tour="results"] .recharts-wrapper')).toHaveCount(0)
})
