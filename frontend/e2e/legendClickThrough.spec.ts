import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// The legend stack is a scroll box whose floor is derived from the map's
// bottom chrome, so it spans the map's height whatever its sections hold. The
// part of it under the last section is empty, and a click there has to reach
// the map: that band covers the left column of a phone's map, which is where a
// reader draws a ring.

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

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 360, height: 740 },
]) {
  test(`a click under the legend reaches the map at ${viewport.width} px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await page.goto('/?fires=1')
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    // Draw mode first: on a phone it closes the panel, which otherwise
    // covers the map and the band with it.
    await page.getByRole('button', { name: 'Draw polygon' }).click()
    // The panel slides away rather than vanishing, so the band is read once
    // nothing but the map or the legend stands at the probe point.
    await expect.poll(async () => (await probe(page)).hit).not.toBe('other')
    const measured = await probe(page)
    testInfo.annotations.push({ type: `probe ${viewport.width} px`, description: JSON.stringify(measured) })
    console.log(`probe ${viewport.width} px`, JSON.stringify(measured))
    // A band too thin to click in would pass this test for the wrong reason.
    expect(measured.band).toBeGreaterThan(40)

    // The panel's own readout is the proof a vertex landed. On a phone the
    // panel closes for drawing, so the readout is read from the DOM rather
    // than from the screen.
    const counter = page.getByText('Add at least 2 more points', { exact: false })
    // Retried because a click counts only once MapLibre has attached the draw
    // handler, which nothing on the page announces (see `drawRing`).
    await expect(async () => {
      if ((await counter.count()) === 0) await page.mouse.click(measured.x, measured.y)
      await expect(counter).toBeAttached({ timeout: 1_500 })
    }).toPass({ timeout: 20_000 })
  })
}

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
