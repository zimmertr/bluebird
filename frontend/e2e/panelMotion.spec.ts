import { test, expect, expectRanked, resultRows, DESTINATION_NAMES, forecastButton } from './fixtures'
import type { Page } from '@playwright/test'

// A desk's results stand in a column right of the map and the chart in a
// pane under it (record 0312). A press on Both or Table opens and shuts that
// pane at the panel speed (record 0202), with its chart drawn at its end
// size in every moving frame (record 0216); the column itself holds still.
// Measured on the live layout, frame by frame, since jsdom lays nothing out.

test.use({ viewport: { width: 1440, height: 900 } })

const column = (page: Page) => page.locator('[data-tour="results"]')
const pane = (page: Page) => page.locator('[data-chart-pane]')

async function analyzedAt(page: Page, mode: 'Show both chart and table' | 'Show chart only' | 'Show table only') {
  await page.goto('/?type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await forecastButton(page).click()
  await expectRanked(page)
  await page.getByRole('button', { name: mode }).click()
  await page.waitForTimeout(600)
}

// Every frame for `ms` after a press: the chart pane's height, the size its
// chart is drawn at, and the column's box.
function framesAfter(page: Page, label: string, ms: number) {
  return page.evaluate(
    async ([name, windowMs]) => {
      const paneEl = document.querySelector('[data-chart-pane]')!
      const col = document.querySelector('[data-tour="results"]')!
      const frames: { pane: number; chartSize: string | null; column: string }[] = []
      ;(document.querySelector(`button[aria-label="${name}"]`) as HTMLElement).click()
      const t0 = performance.now()
      await new Promise<void>((resolve) => {
        const tick = () => {
          const svg = paneEl.querySelector('.recharts-surface')
          const c = col.getBoundingClientRect()
          frames.push({
            pane: paneEl.getBoundingClientRect().height,
            chartSize: svg ? `${svg.getAttribute('width')}x${svg.getAttribute('height')}` : null,
            column: `${Math.round(c.left)},${Math.round(c.top)},${Math.round(c.width)},${Math.round(c.height)}`,
          })
          if (performance.now() - t0 < windowMs) requestAnimationFrame(tick)
          else resolve()
        }
        requestAnimationFrame(tick)
      })
      return frames
    },
    [label, ms] as const,
  )
}

// Frames where the pane stands part open: more than one asks for a move
// rather than a jump, never for a count, which is the runner's frame rate
// (run 39684864494, 2026-10-21).
const partOpen = (frames: { pane: number }[]) => {
  const end = frames[frames.length - 1].pane
  return frames.filter((f) => f.pane > 0.5 && Math.abs(f.pane - end) > 0.5)
}

test('a press on Both opens the chart pane under the map at the panel speed, its chart drawn at its end size', async ({ page }) => {
  await analyzedAt(page, 'Show table only')
  const opening = await framesAfter(page, 'Show both chart and table', 900)
  const end = opening[opening.length - 1]
  expect(end.pane).toBeGreaterThan(100)
  const moving = partOpen(opening)
  expect(moving.length).toBeGreaterThan(0)
  for (const f of moving) expect(f.chartSize).toBe(end.chartSize)
  // The column holds still while the pane under the map moves.
  expect(new Set(opening.map((f) => f.column)).size).toBe(1)

  const closing = await framesAfter(page, 'Show table only', 900)
  expect(partOpen(closing).length).toBeGreaterThan(0)
  expect(closing[closing.length - 1].pane).toBeLessThan(1)
  expect(new Set(closing.map((f) => f.column)).size).toBe(1)
  // The chart is kept, inert, behind its shut pane.
  await expect(pane(page).locator('[inert] .recharts-wrapper')).toHaveCount(1)
})

// The chevron takes the column and the chart away, and the round chevron on
// the map's edge brings both back with every row.
test('the collapse chevron takes the column away and the map edge chevron brings it back', async ({ page }) => {
  await analyzedAt(page, 'Show both chart and table')
  await page.getByRole('button', { name: 'Collapse results' }).click()
  await expect(column(page)).toHaveCount(0)
  // The chart's pane shuts to nothing and keeps its chart for the way back.
  await expect.poll(() => pane(page).evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(1)
  await page.getByRole('button', { name: 'Expand results' }).click()
  await expect(column(page)).toBeVisible()
  await expect(pane(page).locator('.recharts-wrapper')).toHaveCount(1)
  await expect(resultRows(page)).toHaveCount(DESTINATION_NAMES.length)
})
