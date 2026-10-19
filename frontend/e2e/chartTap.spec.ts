import { test, expect, resultRows, isoDay } from './fixtures'
import type { Page } from '@playwright/test'

// A tap on the chart moves the map's playhead to the hour under it (#517).
// Recharts names the hour from its hover state, and a touch tap sends no hover
// before its click, so on a phone a tap did nothing. The playhead is read from
// the transport's range input, which is the map's own record of the hour.

test.use({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true })

// The chart at its resting height on a phone is a 27 px strip with no plot
// band inside it, so the grip above it is dragged up first, the way a reader
// who wants to read the chart would.
async function openChart(page: Page) {
  // `player=1` because the Forecast player is off by default on a phone.
  await page.goto(`/?player=1&mode=days&d1=${isoDay(1)}&d2=${isoDay(2)}&type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55`)
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  // The map's own Analyze: a phone opens on the map, with the panel's
  // drawer closed and inert (#696).
  await page.getByRole('main').getByRole('button', { name: 'Analyze' }).tap()
  await expect(resultRows(page).first()).toBeAttached()
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

// A finger reads the chart as a resting mouse does (#336; record 0144): a
// drag across the plot shows the hour under it, and the reading stays when
// the finger lifts. A touch drag is sent through the protocol, because the
// page's own touchscreen helper only taps.
test('a finger dragged across the chart reads the hour under it at 360 px', async ({ page, context }) => {
  const box = await openChart(page)
  const tooltip = page.locator('.recharts-tooltip-wrapper')
  const cdp = await context.newCDPSession(page)
  const y = box.y + box.height * 0.4
  const touch = (type: string, frac?: number) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: frac === undefined ? [] : [{ x: box.x + box.width * frac, y }],
    })
  await touch('touchStart', 0.3)
  await expect(tooltip).toBeVisible()
  const first = await tooltip.textContent()
  for (let i = 1; i <= 6; i++) await touch('touchMove', 0.3 + i * 0.07)
  await expect(tooltip).not.toHaveText(first ?? '')
  await touch('touchEnd')
  await expect(tooltip).toBeVisible()
})

// A phone's Chart opens at the sheet's full stop (#696; record 0155), and
// the table comes back at its own height when it is picked again.
test.describe('on a 390 px phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  async function analyzed(page: Page) {
    await page.goto(`/?mode=days&d1=${isoDay(1)}&d2=${isoDay(2)}&type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55`)
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    await page.getByRole('main').getByRole('button', { name: 'Analyze' }).tap()
    await expect(resultRows(page).first()).toBeAttached()
  }
  const sheetTop = async (page: Page) => (await page.locator('[data-readout-room]').boundingBox())!.y

  test('Chart lifts the sheet to its full stop and Table puts it back', async ({ page }) => {
    await analyzed(page)
    const resting = await sheetTop(page)
    await page.getByRole('button', { name: 'Show chart only' }).tap()
    await expect.poll(() => sheetTop(page)).toBeLessThan(resting - 200)
    await page.getByRole('button', { name: 'Show table only' }).tap()
    await expect.poll(() => sheetTop(page)).toBe(resting)
  })

  // The readout is never cut off (#696; record 0154): on a Chart the reader
  // has dragged down, the plotting band is shorter than a five-line readout,
  // which rises into the sheet above the chart, over the picker and the
  // results bar, and stays inside it.
  test('a finger reading stands whole inside the sheet over a short plot', async ({ page }) => {
    await analyzed(page)
    await page.getByRole('button', { name: 'Show chart only' }).tap()
    const grid = page.locator('.recharts-cartesian-grid')
    await expect(grid).toBeVisible()
    // The reader's drag wins over the full stop: down to a short plot.
    const grip = (await page.locator('.cursor-ns-resize').last().boundingBox())!
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    await page.mouse.move(grip.x + grip.width / 2, 600, { steps: 10 })
    await page.mouse.up()
    await expect.poll(async () => (await grid.boundingBox())?.height ?? 0).toBeLessThan(100)
    await expect.poll(async () => (await grid.boundingBox())?.height ?? 0).toBeGreaterThan(20)
    const band = (await grid.boundingBox())!
    await page.touchscreen.tap(band.x + band.width / 2, band.y + band.height / 2)
    const card = page.locator('.recharts-tooltip-wrapper > div')
    await expect(card).toBeVisible()
    await expect(card.locator('.font-mono').first()).toBeVisible()
    const box = (await card.boundingBox())!
    const sheet = (await page.locator('[data-readout-room]').boundingBox())!
    // Taller than the band it reads, so it has risen out of it.
    expect(box.height).toBeGreaterThan(band.height)
    expect(box.y).toBeGreaterThanOrEqual(sheet.y)
    expect(box.y + box.height).toBeLessThanOrEqual(band.y + band.height + 1)
    // Every destination listed, none behind a "+N more".
    await expect(card.getByText(/more$/)).toHaveCount(0)
    expect(await card.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true)
  })
})
