import { test, expect, expectRanked } from './fixtures'
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
    // Measured once the ranking has landed, so no pending row moves the
    // corner under the reading.
    await expectRanked(page)

    const folded = await bottoms(page)
    test.info().annotations.push({ type: `corner ${width} px folded`, description: JSON.stringify(folded) })
    expect(Math.abs(folded.scale - folded.fab)).toBeLessThanOrEqual(1)
    expect(Math.abs(folded.button - folded.fab)).toBeLessThanOrEqual(1)

    await page.locator('.maplibregl-ctrl-attrib-button').click()
    await expect(page.locator('.maplibregl-ctrl-attrib.maplibregl-compact-show')).toHaveCount(1)
    const opened = await bottoms(page)
    test.info().annotations.push({ type: `corner ${width} px opened`, description: JSON.stringify(opened) })
    expect(Math.abs(opened.credit - opened.fab)).toBeLessThanOrEqual(1)
    // Taller than the row, so it grew up from the shared edge, and it stops
    // 8px short of the button.
    expect(opened.creditTop).toBeLessThan(opened.credit - 24)
    expect(Math.round(opened.fabLeft - opened.creditRight)).toBe(8)
  })
}

// The (i)'s glyph is centred on its round button (TJ, 2026-10-14). It is a
// mask in the button's ink on the button's `after` (record 0251), laid over
// the button's whole box, the border included, rather than over the padding
// box the 1px border shrinks. Read off the computed pseudo-element, since the
// glyph is one: what this proves is that map.css's placement wins the cascade
// in a browser, not where the drawn pixels land.
for (const width of [360, 390]) {
  test(`the (i) button's glyph is a mask centred on its border box, at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/')
    await expect(page.locator('.maplibregl-ctrl-attrib-button')).toBeVisible()
    const at = await page.evaluate(() => {
      const b = document.querySelector('.maplibregl-ctrl-attrib-button')!
      const r = b.getBoundingClientRect()
      const border = parseFloat(getComputedStyle(b).borderTopWidth)
      const cs = getComputedStyle(b, '::after')
      const inset = parseFloat(cs.top)
      // The after's box, from its inset against the padding box.
      const box = { x: r.left + border + inset, y: r.top + border + inset, w: r.width - 2 * (border + inset), h: r.height - 2 * (border + inset) }
      const [px, py] = cs.maskPosition.split(' ').map((v) => parseFloat(v) / 100)
      const size = parseFloat(cs.maskSize)
      const glyph = { x: box.x + (box.w - size) * px + size / 2, y: box.y + (box.h - size) * py + size / 2 }
      return {
        button: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
        glyph,
        repeat: cs.maskRepeat,
        image: cs.maskImage.startsWith('url('),
        background: getComputedStyle(b).backgroundImage,
      }
    })
    test.info().annotations.push({ type: `info glyph ${width} px`, description: JSON.stringify(at) })
    expect(at.glyph.x).toBeCloseTo(at.button.x, 1)
    expect(at.glyph.y).toBeCloseTo(at.button.y, 1)
    expect(at.repeat).toBe('no-repeat')
    expect(at.image).toBe(true)
    expect(at.background).toBe('none')
  })
}
