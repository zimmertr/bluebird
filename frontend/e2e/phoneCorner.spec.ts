import { test, expect, expectRanked, forecastButton } from './fixtures'
import type { Page } from '@playwright/test'

// A phone's scale, its credit's (i) and the opened credit line stand in the
// band over the phone's foot (record 0329), each on the library's 10px
// margin over the card's top edge, and the opened line grows up from there
// across the map, the card spanning the map's width under it.

async function bottoms(page: Page) {
  return page.evaluate(() => {
    const at = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
    const foot = document.querySelector('[data-tour="analyze"]')!.closest('[data-map-overlay]')!
    return {
      footTop: foot.getBoundingClientRect().top,
      mapRight: at('.maplibregl-canvas').right,
      scale: at('.maplibregl-ctrl-scale').bottom,
      button: at('.maplibregl-ctrl-attrib-button').bottom,
      credit: at('.maplibregl-ctrl-attrib').bottom,
      creditTop: at('.maplibregl-ctrl-attrib').top,
      creditRight: at('.maplibregl-ctrl-attrib').right,
    }
  })
}

for (const width of [360, 390]) {
  test(`the map's corner stands on the foot's top edge at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/?type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55')
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    await forecastButton(page.getByRole('main')).click()
    // Measured once the ranking has landed, so no pending row moves the
    // corner under the reading.
    await expectRanked(page)

    const folded = await bottoms(page)
    test.info().annotations.push({ type: `corner ${width} px folded`, description: JSON.stringify(folded) })
    expect(Math.abs(folded.scale - (folded.footTop - 10))).toBeLessThanOrEqual(1)
    expect(Math.abs(folded.button - (folded.footTop - 10))).toBeLessThanOrEqual(1)

    await page.locator('.maplibregl-ctrl-attrib-button').click()
    await expect(page.locator('.maplibregl-ctrl-attrib.maplibregl-compact-show')).toHaveCount(1)
    const opened = await bottoms(page)
    test.info().annotations.push({ type: `corner ${width} px opened`, description: JSON.stringify(opened) })
    expect(Math.abs(opened.credit - (opened.footTop - 10))).toBeLessThanOrEqual(1)
    // Taller than the row, so it grew up from the shared edge, and it runs to
    // its own 10px margin off the map's right edge.
    expect(opened.creditTop).toBeLessThan(opened.credit - 24)
    expect(Math.round(opened.mapRight - opened.creditRight)).toBe(10)
  })
}

// The (i)'s glyph is centred on its round button (TJ, 2026-10-14): the
// library's 24px drawing, whose circle is centred in it, placed on the
// button's whole box rather than at the top left of the padding box the 1px
// border shrinks. Read off the computed background, since the glyph is one:
// what this proves is that map.css's placement wins the cascade in a browser,
// not where the drawn pixels land.
for (const width of [360, 390]) {
  test(`the (i) button's background is placed on its border box, centred, at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/')
    await expect(page.locator('.maplibregl-ctrl-attrib-button')).toBeVisible()
    const at = await page.evaluate(() => {
      const b = document.querySelector('.maplibregl-ctrl-attrib-button')!
      const r = b.getBoundingClientRect()
      const cs = getComputedStyle(b)
      const border = parseFloat(cs.borderTopWidth)
      const origin = cs.backgroundOrigin === 'border-box' ? { x: r.left, y: r.top, w: r.width, h: r.height } : { x: r.left + border, y: r.top + border, w: r.width - 2 * border, h: r.height - 2 * border }
      const [px, py] = cs.backgroundPosition.split(' ').map((v) => parseFloat(v) / 100)
      // The drawing is 24px square with its circle at the middle.
      const glyph = { x: origin.x + (origin.w - 24) * px + 12, y: origin.y + (origin.h - 24) * py + 12 }
      return { button: { x: r.left + r.width / 2, y: r.top + r.height / 2 }, glyph, repeat: cs.backgroundRepeat }
    })
    test.info().annotations.push({ type: `info glyph ${width} px`, description: JSON.stringify(at) })
    expect(at.glyph.x).toBeCloseTo(at.button.x, 1)
    expect(at.glyph.y).toBeCloseTo(at.button.y, 1)
    expect(at.repeat).toBe('no-repeat')
  })
}
