import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// The legend stack is a scroll box whose floor is derived from the map's
// bottom chrome, so it spans the map's height whatever its sections hold. The
// part of it under the last section is empty, and a click there has to reach
// the map: that band covers the left column of the map, which is where a
// reader draws a ring. A phone holds its keys in the Legend sheet rather than
// on the map (#696; record 0136), so its case is the sheet's, and the chip
// row's own empty end.

interface Probe {
  boxHeight: number
  contentHeight: number
  band: number
  // What a click in the middle of the band would hit.
  hit: 'legend' | 'map' | 'other'
  x: number
  y: number
}

// Found through a section's label and the nearest scrolling ancestor, so the
// test follows the box rather than the classes it wears today.
async function probe(page: Page): Promise<Probe> {
  const label = page.getByText('Active wildfire').first()
  await expect(label).toBeVisible()
  return label.evaluate((el) => {
    let box = el.parentElement!
    while (getComputedStyle(box).overflowY !== 'auto') box = box.parentElement!
    const outer = box.getBoundingClientRect()
    const inner = box.firstElementChild!.getBoundingClientRect()
    const x = Math.round(inner.left + inner.width / 2)
    const y = Math.round((inner.bottom + outer.bottom) / 2)
    const at = document.elementFromPoint(x, y)
    const hit = at && box.contains(at) ? 'legend' : at?.closest('.maplibregl-map') ? 'map' : 'other'
    return {
      boxHeight: Math.round(outer.height),
      contentHeight: Math.round(inner.height),
      band: Math.round(outer.bottom - inner.bottom),
      hit,
      x,
      y,
    }
  })
}

for (const viewport of [{ width: 1280, height: 720 }]) {
  test(`a click under the legend reaches the map at ${viewport.width} px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await page.goto('/?fires=1')
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    await page.getByRole('button', { name: 'Draw polygon' }).click()
    // The panel slides away rather than vanishing, so the band is read once
    // nothing but the map or the legend stands at the probe point.
    await expect.poll(async () => (await probe(page)).hit).not.toBe('other')
    const measured = await probe(page)
    testInfo.annotations.push({ type: `probe ${viewport.width} px`, description: JSON.stringify(measured) })
    // A band too thin to click in would pass this test for the wrong reason.
    expect(measured.band).toBeGreaterThan(40)

    // The panel's own readout is the proof a vertex landed.
    const counter = page.getByText('Add at least 2 more points', { exact: false })
    // Retried because a click counts only once MapLibre has attached the draw
    // handler, which nothing on the page announces (see `drawRing`).
    await expect(async () => {
      if ((await counter.count()) === 0) await page.mouse.click(measured.x, measured.y)
      await expect(counter).toBeAttached({ timeout: 1_500 })
    }).toPass({ timeout: 20_000 })
  })
}

// A phone's keys are in a sheet the Legend chip opens, and the map holds no
// legend box at all; the chip row leaves its right end empty, and a press
// there is the map's.
test('a phone keeps its keys in the Legend sheet, and the row\'s empty end is the map\'s', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/?fires=1')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  const legend = page.getByRole('button', { name: 'Legend', exact: true })
  await expect(legend).toBeEnabled()
  await expect(page.getByText('Active wildfire')).toHaveCount(0)

  // About 20px at 360 wide, where the three chips take 316 of 336.
  const end = await legend.evaluate((chip) => {
    const row = chip.parentElement!.getBoundingClientRect()
    const right = chip.getBoundingClientRect().right
    const x = Math.round((right + row.right) / 2)
    const y = Math.round(row.top + row.height / 2)
    return { free: Math.round(row.right - right), hit: !!document.elementFromPoint(x, y)?.closest('.maplibregl-canvas-container') }
  })
  expect(end.free).toBeGreaterThan(10)
  expect(end.hit).toBe(true)

  await legend.click()
  const sheet = page.getByRole('dialog', { name: 'Legend' })
  await expect(sheet.getByText('Active wildfire')).toBeVisible()
  await expect(legend).toHaveAttribute('aria-expanded', 'true')
  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(sheet).toHaveCount(0)
})

test('the legend stack still scrolls when its sections outgrow its floor', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 300 })
  await page.goto('/?fires=1&radar=1&smoke=1&snow=1')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  const label = page.getByText('Active wildfire').first()
  await expect(label).toBeVisible()
  const scroller = await label.evaluateHandle((el) => {
    let box = el.parentElement!
    while (getComputedStyle(box).overflowY !== 'auto') box = box.parentElement!
    return box
  })
  const sizes = await scroller.evaluate((box) => ({ scroll: box.scrollHeight, client: box.clientHeight }))
  expect(sizes.scroll).toBeGreaterThan(sizes.client)

  // The wheel over a section, which is where the pointer is when a reader
  // means to scroll the legends.
  const first = await label.boundingBox()
  await page.mouse.move(first!.x + first!.width / 2, first!.y + first!.height / 2)
  await page.mouse.wheel(0, 200)
  await expect.poll(() => scroller.evaluate((box) => (box as HTMLElement).scrollTop)).toBeGreaterThan(0)
})
