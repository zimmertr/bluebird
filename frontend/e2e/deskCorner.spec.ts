import { test, expect, resultRows, DESTINATION_NAMES } from './fixtures'
import type { Page } from '@playwright/test'

// A desk's map corner (record 0174), laid out as Google Maps lays out its own
// (TJ, 2026-10-20): the credit line flush in the map's bottom-right corner on
// the results' edge, with the scale at its end, and over it the compass, the
// 3D button (#799), the locate button and the zoom pair, 24px in from the
// map's right edge, 6px apart and 10px above the line. Measured on the live controls, since jsdom
// lays nothing out.

async function corner(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element | null | undefined) => {
      const r = el!.getBoundingClientRect()
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
    }
    const q = (selector: string) => document.querySelector(selector)
    const compass = q('.maplibregl-ctrl-compass') as HTMLButtonElement
    const line = q('.maplibregl-ctrl-attrib')!.closest('[data-map-overlay]')!
    const column = compass.closest('[data-map-overlay]')!
    return {
      map: box(q('.maplibregl-map')),
      compass: box(compass),
      terrain: box(q('button[aria-label="3D terrain"]')),
      locate: box(q('.maplibregl-ctrl-geolocate')),
      zoomIn: box(q('.maplibregl-ctrl-zoom-in')),
      zoomOut: box(q('.maplibregl-ctrl-zoom-out')),
      line: box(line),
      credits: box(q('.maplibregl-ctrl-attrib')),
      scale: box(q('.maplibregl-ctrl-scale')),
      scaleLabel: q('.maplibregl-ctrl-scale')!.textContent,
      compassDisabled: compass.disabled,
      compassOpacity: getComputedStyle(compass).opacity,
      // The library's corners hold nothing once the corner has every control.
      libraryCorners: [...document.querySelectorAll('.maplibregl-ctrl-top-right, .maplibregl-ctrl-bottom-left, .maplibregl-ctrl-bottom-right')]
        .map((el) => el.childElementCount),
      // Every other surface a popup keeps clear of, which the corner must not stand on.
      others: [...document.querySelectorAll('[data-map-overlay]')].filter((el) => el !== line && el !== column).map(box),
    }
  })
}

const overlaps = (a: { left: number; top: number; right: number; bottom: number }, b: typeof a) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

for (const [width, height, panel] of [
  [1440, 900, 'shut'],
  [1024, 768, 'open'],
] as const) {
  test(`a desk's map buttons stand over the credit line in the corner at ${width} px, panel ${panel}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/?type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55')
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    await page.getByRole('button', { name: 'Analyze' }).click()
    await expect(resultRows(page)).toHaveCount(DESTINATION_NAMES.length)
    if (panel === 'shut') {
      await page.getByRole('button', { name: 'Close controls' }).click()
      // The panel takes 300ms to leave (record 0202), so the corner is read
      // once the map has the whole row.
      await expect
        .poll(() => page.locator('.maplibregl-map').evaluate((el) => el.getBoundingClientRect().left))
        .toBe(0)
    }

    const at = await corner(page)
    test.info().annotations.push({ type: `desk corner ${width} px`, description: JSON.stringify(at) })
    const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(0.5)
    // The line flush in the corner, the scale at its end inside its 8px.
    near(at.line.right, at.map.right)
    near(at.line.bottom, at.map.bottom)
    near(at.scale.right, at.line.right - 8)
    expect(at.credits.right).toBeLessThanOrEqual(at.scale.left)
    // The scale keeps the vendor's 22px box on the line's 20px line, so the
    // line is 27px tall with its 2px padding and its 1px top edge.
    near(at.scale.height, 22)
    near(at.line.height, 27)
    // The column: 32px buttons 24px in, 6px apart, the zoom pair joined, and
    // 10px above the line.
    for (const button of [at.compass, at.terrain, at.locate, at.zoomIn, at.zoomOut]) {
      near(button.width, 32)
      near(button.right, at.map.right - 24)
    }
    near(at.terrain.top - at.compass.bottom, 6)
    near(at.locate.top - at.terrain.bottom, 6)
    near(at.zoomIn.top - at.locate.bottom, 6)
    near(at.zoomOut.top, at.zoomIn.bottom)
    near(at.line.top - at.zoomOut.bottom, 10)
    // North up: the compass is there, greyed.
    expect(at.compassDisabled).toBe(true)
    expect(at.compassOpacity).toBe('0.4')
    expect(at.libraryCorners).toEqual([0, 0, 0])
    for (const other of at.others) {
      expect(overlaps(other, at.line)).toBe(false)
      expect(overlaps(other, { ...at.compass, bottom: at.zoomOut.bottom })).toBe(false)
    }

    // + zooms, and the credits keep their place while the scale changes.
    await page.locator('.maplibregl-ctrl-zoom-in').click()
    await expect.poll(async () => (await corner(page)).scaleLabel).not.toBe(at.scaleLabel)
    near((await corner(page)).credits.left, at.credits.left)
  })
}

// A phone has no corner and no zoom pair (#696): a pinch zooms there.
test('a phone stands no zoom pair and no corner', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto('/')
  await expect(page.locator('.maplibregl-ctrl-geolocate')).toBeVisible()
  await expect(page.locator('.maplibregl-ctrl-zoom-in')).toBeHidden()
  await expect(page.locator('.map-corner')).toHaveCount(0)
})
