import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// A tap on the chart moves the map's playhead to the hour under it (#517).
// Recharts names the hour from its hover state, and a touch tap sends no hover
// before its click, so on a phone a tap did nothing. The playhead is read from
// the transport's range input, which is the map's own record of the hour.

function isoDay(offset: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

test.use({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true })

// The chart at its resting height on a phone is a 27 px strip with no plot
// band inside it, so the grip above it is dragged up first, the way a reader
// who wants to read the chart would.
async function openChart(page: Page) {
  // `player=1` because the Forecast player is off by default on a phone.
  await page.goto(`/?player=1&mode=days&d1=${isoDay(1)}&d2=${isoDay(2)}&type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55`)
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  await page.getByRole('button', { name: 'Analyze' }).tap()
  await expect(page.locator('table tbody tr').first()).toBeAttached()
  await page.getByRole('button', { name: 'Show chart only' }).tap()
  const surface = page.locator('svg.recharts-surface').first()
  await expect(surface).toBeVisible()
  const grip = (await page.locator('.cursor-ns-resize').last().boundingBox())!
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(grip.x + grip.width / 2, 250, { steps: 10 })
  await page.mouse.up()
  await expect.poll(async () => (await surface.boundingBox())!.height).toBeGreaterThan(150)
  return (await surface.boundingBox())!
}

test('a tap on the chart moves the map playhead at 360 px', async ({ page }) => {
  const box = await openChart(page)
  const playhead = page.locator('input[type=range]')
  await expect(playhead).toHaveValue('0')
  const y = box.y + box.height * 0.4
  const at = (frac: number) => box.x + box.width * frac

  await page.touchscreen.tap(at(0.7), y)
  await expect(playhead).not.toHaveValue('0')
  const tapped = await playhead.inputValue()

  // A second tap somewhere else must name its own hour, not the first tap's.
  await page.touchscreen.tap(at(0.3), y)
  await expect(playhead).not.toHaveValue(tapped)
  const second = Number(await playhead.inputValue())
  expect(second).toBeLessThan(Number(tapped))

  // A hover, then a click, at the first tap's pixel lands on the same hour:
  // the mouse path still works, and a tap and a hover agree on the hour.
  await page.mouse.move(at(0.7), y)
  await page.mouse.click(at(0.7), y)
  await expect(playhead).toHaveValue(tapped)
})
