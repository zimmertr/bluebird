import { test, expect, resultRows, DESTINATION_NAMES } from './fixtures'
import type { Page } from '@playwright/test'

// A phone's scale, its credit's (i) and the opened credit line stand on the
// Analyze button's row with their bottoms on the button's bottom edge (TJ,
// 2026-10-14), and the opened line grows up from it, short of the button.

async function bottoms(page: Page) {
  return page.evaluate(() => {
    const at = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
    const fab = document.querySelector('[data-tour="analyze"]')!
    return {
      fab: fab.getBoundingClientRect().bottom,
      fabLeft: fab.getBoundingClientRect().left,
      scale: at('.maplibregl-ctrl-scale').bottom,
      button: at('.maplibregl-ctrl-attrib-button').bottom,
      credit: at('.maplibregl-ctrl-attrib').bottom,
      creditTop: at('.maplibregl-ctrl-attrib').top,
      creditRight: at('.maplibregl-ctrl-attrib').right,
    }
  })
}

for (const width of [360, 390]) {
  test(`the map's corner stands on the Analyze button's bottom edge at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/?type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55')
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    await page.getByRole('main').getByRole('button', { name: 'Analyze', exact: true }).click()
    await expect(resultRows(page)).toHaveCount(DESTINATION_NAMES.length)

    const folded = await bottoms(page)
    console.log(`corner ${width} px folded`, JSON.stringify(folded))
    expect(Math.abs(folded.scale - folded.fab)).toBeLessThanOrEqual(1)
    expect(Math.abs(folded.button - folded.fab)).toBeLessThanOrEqual(1)

    await page.locator('.maplibregl-ctrl-attrib-button').click()
    await expect(page.locator('.maplibregl-ctrl-attrib.maplibregl-compact-show')).toHaveCount(1)
    const opened = await bottoms(page)
    console.log(`corner ${width} px opened`, JSON.stringify(opened))
    expect(Math.abs(opened.credit - opened.fab)).toBeLessThanOrEqual(1)
    // Taller than the row, so it grew up from the shared edge, and it stops
    // 8px short of the button.
    expect(opened.creditTop).toBeLessThan(opened.credit - 24)
    expect(Math.round(opened.fabLeft - opened.creditRight)).toBe(8)
  })
}
