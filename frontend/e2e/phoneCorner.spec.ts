import { readFileSync } from 'node:fs'
import { test, expect, resultRows, DESTINATION_NAMES } from './fixtures'
import type { Page } from '@playwright/test'

// A phone's credit line (record 0174): the desk's line mirrored into the
// map's bottom-left corner, flush on the sheet's edge, holding the (i) and
// the scale at its end. The Analyze button stands beside it at the right and
// the notice band over it. Opened, the credits spread across the map over the
// (i) and the scale, which keep their places, and the button rises over them.
// Measured on the live controls, since jsdom lays nothing out.

// The live basemap's credits, which the suite's blank style does not carry,
// so the line holds what it holds in production, about 430px at its 11px
// with the app's own two. Carried by a source of the style, the way the live
// one carries them, so the library draws them itself and redraws nothing
// under the test.
const BASEMAP_CREDITS =
  '<a href="https://openfreemap.org">OpenFreeMap</a> <a href="https://www.openmaptiles.org/">© OpenMapTiles</a> ' +
  'Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
const blank = JSON.parse(readFileSync(new URL('fixtures/style.json', import.meta.url), 'utf8'))
const CREDITED_STYLE = {
  ...blank,
  sources: { credits: { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, attribution: BASEMAP_CREDITS } },
  layers: [...blank.layers, { id: 'credits', type: 'fill', source: 'credits' }],
}

type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number }

async function foot(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element | null | undefined): Box | null => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }
    }
    const q = (selector: string) => document.querySelector(selector)
    const fab = q('[data-tour="analyze"]')!
    const controls = q('section[aria-labelledby]')!
    const fabBox = fab.getBoundingClientRect()
    const hit = document.elementFromPoint(fabBox.left + fabBox.width / 2, fabBox.top + fabBox.height / 2)
    return {
      map: box(q('.maplibregl-map'))!,
      sheet: box(q('[data-tour="results"]')),
      controls: controls.hasAttribute('inert') ? null : box(controls),
      line: box(q('.maplibregl-ctrl-attrib')!.closest('[data-map-overlay]'))!,
      info: box(q('.maplibregl-ctrl-attrib-button'))!,
      credits: box(q('.maplibregl-ctrl-attrib-inner'))!,
      scale: box(q('.maplibregl-ctrl-scale'))!,
      fab: box(fab)!,
      // The band is the button's sibling before it (`PhoneFoot`).
      band: box(fab.previousElementSibling)!,
      fabPressable: hit !== null && fab.contains(hit),
      // The library's own corners hold nothing once the line holds both.
      libraryCorners: [...document.querySelectorAll('.maplibregl-ctrl-bottom-left, .maplibregl-ctrl-bottom-right')].map(
        (el) => el.childElementCount,
      ),
    }
  })
}

const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(0.5)
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

for (const width of [360, 390]) {
  test(`a phone's credit line stands flush in the bottom-left corner on the sheet's edge at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    // After the suite's own answer, so it is the one the style request meets.
    await page.route('https://tiles.openfreemap.org/styles/**', (r) => r.fulfill({ json: CREDITED_STYLE }))

    // Before a report there is no sheet: the line stands on the map's foot,
    // and the arrival line in the band 10px over it.
    await page.goto('/')
    await expect(page.locator('.maplibregl-ctrl-scale')).toBeVisible()
    const arrival = await foot(page)
    test.info().annotations.push({ type: `line ${width} px, arrival`, description: JSON.stringify(arrival) })
    near(arrival.line.left, arrival.map.left)
    near(arrival.line.bottom, arrival.map.bottom)
    expect(arrival.band.height).toBeGreaterThan(0)
    near(arrival.line.top - arrival.band.bottom, 10)

    await page.goto('/?type=peak&poly=-121.9,47.4;-121.7,47.4;-121.7,47.55')
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    await page.getByRole('main').getByRole('button', { name: 'Analyze', exact: true }).click()
    await expect(resultRows(page)).toHaveCount(DESTINATION_NAMES.length)

    // Folded: the (i) and the scale on one row, flush in the corner on the
    // sheet's edge, 29px tall (`PHONE_LINE_PX`), the scale ending inside the
    // line and both on its bottom. The button stands beside it, 16px over the
    // sheet, and the empty band 10px over the line.
    const folded = await foot(page)
    test.info().annotations.push({ type: `line ${width} px, folded`, description: JSON.stringify(folded) })
    const sheet = folded.sheet!
    near(folded.line.left, folded.map.left)
    near(folded.line.bottom, sheet.top)
    near(folded.line.height, 29)
    near(folded.info.left, folded.line.left + 8)
    expect(folded.scale.left).toBeGreaterThanOrEqual(folded.info.right + 10)
    near(folded.scale.right, folded.line.right - 11)
    near(folded.info.bottom, folded.line.bottom - 2)
    near(folded.scale.bottom, folded.line.bottom - 2)
    near(folded.scale.height, 22)
    near(folded.fab.bottom, sheet.top - 16)
    expect(folded.fab.left - folded.line.right).toBeGreaterThan(60)
    expect(overlaps(folded.line, folded.fab)).toBe(false)
    near(folded.band.bottom, folded.line.top - 10)
    expect(folded.libraryCorners).toEqual([0, 0])

    // Opened: the credits read across the map over the (i) and the scale,
    // which keep their places; the line grows to the map's 12px inset, and
    // the button rises 16px over it, whole and pressable.
    await expect(page.locator('.maplibregl-ctrl-attrib-inner')).toContainText('OpenStreetMap')
    await page.locator('.maplibregl-ctrl-attrib-button').click()
    await expect(page.locator('.maplibregl-ctrl-attrib.maplibregl-compact-show')).toHaveCount(1)
    await expect.poll(async () => (await foot(page)).fab.bottom).toBeLessThan(folded.fab.bottom)
    const opened = await foot(page)
    test.info().annotations.push({ type: `line ${width} px, opened`, description: JSON.stringify(opened) })
    near(opened.line.left, opened.map.left)
    near(opened.line.right, opened.map.right - 12)
    near(opened.line.bottom, sheet.top)
    near(opened.info.left, folded.info.left)
    near(opened.info.bottom, folded.info.bottom)
    near(opened.scale.left, folded.scale.left)
    near(opened.scale.bottom, folded.scale.bottom)
    // Two lines of the line's 20px, over the row.
    near(opened.credits.height, 40)
    expect(opened.credits.bottom).toBeLessThanOrEqual(opened.info.top)
    near(opened.fab.bottom, opened.line.top - 16)
    expect(overlaps(opened.line, opened.fab)).toBe(false)
    expect(opened.fabPressable).toBe(true)
    near(opened.band.bottom, opened.line.top - 10)

    // Folded again, the button comes back down beside it.
    await page.locator('.maplibregl-ctrl-attrib-button').click()
    await expect.poll(async () => (await foot(page)).fab.bottom).toBe(folded.fab.bottom)

    // The Controls sheet raised over the results, with a cue in the band: the
    // line rides the Controls sheet's edge, the band stands 10px over the
    // line and the button 16px over the band.
    await page.getByRole('button', { name: 'Open controls' }).click()
    await page.getByRole('checkbox', { name: 'Lakes' }).check()
    await expect.poll(async () => (await foot(page)).band.height).toBeGreaterThan(0)
    const cued = await foot(page)
    test.info().annotations.push({ type: `line ${width} px, Controls sheet and a cue`, description: JSON.stringify(cued) })
    near(cued.line.bottom, cued.controls!.top)
    near(cued.band.bottom, cued.line.top - 10)
    near(cued.fab.bottom, cued.band.top - 16)
    expect(overlaps(cued.line, cued.band)).toBe(false)
    expect(overlaps(cued.line, cued.fab)).toBe(false)
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
