import type { Locator, Page } from '@playwright/test'
import { test, expect } from './fixtures'

// The four base-map layers' opacity sliders (record 0243): a drag on one sets
// the layer's opacity on the map itself, read back off MapLibre with
// `getPaintProperty`, at a desk and on a phone, where the Layers sheet steps
// aside while the finger is down.

// The page builds one map and keeps it to itself. MapLibre's constructor
// assigns `_canvasContainer` on the map it is building, so a setter on
// Object's prototype is handed that map once, before the app runs, and
// leaves a plain property behind it. Nothing in the app changes for it.
async function captureMap(page: Page) {
  await page.addInitScript(() => {
    const seen = window as unknown as { maps: object[] }
    seen.maps = []
    Object.defineProperty(Object.prototype, '_canvasContainer', {
      configurable: true,
      set(value: unknown) {
        Object.defineProperty(this, '_canvasContainer', { value, writable: true, configurable: true, enumerable: true })
        seen.maps.push(this)
      },
    })
  })
}

interface MapLike {
  getLayer(id: string): unknown
  getPaintProperty(id: string, name: string): unknown
  getStyle(): { layers: { id: string }[] }
}

/** The few more calls the water fill's check makes. */
interface WaterMap extends MapLike {
  getCenter(): { lng: number; lat: number }
  project(at: { lng: number; lat: number }): unknown
  queryRenderedFeatures(at: unknown, options: { layers: string[] }): unknown[]
  addSource(id: string, spec: object): void
  addLayer(spec: object, before?: string): void
}

/** A paint property off the page's map, or null before the layer exists. */
const paint = (page: Page, id: string, name: string) =>
  page.evaluate(
    ([layer, prop]) => {
      const map = (window as unknown as { maps: MapLike[] }).maps[0]
      return map?.getLayer(layer) ? map.getPaintProperty(layer, prop) : null
    },
    [id, name] as const,
  )

/** Where a level sits on a range input, for a press or a release there. */
async function pointAt(slider: Locator, level: number) {
  const box = (await slider.boundingBox())!
  // The thumb is 4px wide, so the track's travel is the width less it.
  return { x: box.x + 2 + ((box.width - 4) * level) / 100, y: box.y + box.height / 2 }
}

async function drag(page: Page, slider: Locator, from: number, to: number, hold?: () => Promise<void>) {
  const start = await pointAt(slider, from)
  const end = await pointAt(slider, to)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 6 })
  if (hold) await hold()
  await page.mouse.up()
}

test.describe('at a desk', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('a drag on the Satellite slider sets both rasters\' opacity, and the link carries it', async ({ page }) => {
    await captureMap(page)
    await page.goto('/?view=-121.76,46.853,13&satellite=1')
    await expect.poll(() => paint(page, 'imagery-eox', 'raster-opacity')).toBe(0.5)
    expect(await paint(page, 'imagery-usgs', 'raster-opacity')).toBe(0.5)

    await page.getByRole('button', { name: 'Layers', exact: true }).click()
    const slider = page.getByRole('slider', { name: 'Satellite opacity' })
    await drag(page, slider, 50, 80)
    const level = Number(await slider.inputValue())
    expect(level).toBeGreaterThan(70)
    await expect.poll(() => paint(page, 'imagery-eox', 'raster-opacity')).toBe(level / 100)
    expect(await paint(page, 'imagery-usgs', 'raster-opacity')).toBe(level / 100)
    await expect(page).toHaveURL(new RegExp(`[?&]satellite=1&satelliteopacity=${level}(&|$)`))
  })

  test('a drag on an off layer\'s slider switches it on at the level it sets', async ({ page }) => {
    await captureMap(page)
    await page.goto('/?view=-121.76,46.853,11')
    await page.getByRole('button', { name: 'Layers', exact: true }).click()
    const box = page.getByRole('checkbox', { name: 'Slope angle' })
    await expect(box).not.toBeChecked()
    const slider = page.getByRole('slider', { name: 'Slope angle opacity' })
    await drag(page, slider, 50, 25)
    const level = Number(await slider.inputValue())
    expect(level).toBeLessThan(35)
    await expect(box).toBeChecked()
    await expect.poll(() => paint(page, 'slope', 'raster-opacity')).toBe(level / 100)
  })

  // The water fill a clicked lake is read from (`lakeAnchor`) stays under the
  // imagery, and MapLibre still answers for it there with the photos at 100%.
  test('a water fill under the imagery at 100% still answers a query', async ({ page }) => {
    await captureMap(page)
    await page.goto('/?view=-121.76,46.853,13')
    await expect.poll(() => page.evaluate(() => (window as unknown as { maps: unknown[] }).maps.length)).toBe(1)
    await page.evaluate(() => {
      const map = (window as unknown as { maps: WaterMap[] }).maps[0]
      const { lng, lat } = map.getCenter()
      const d = 0.01
      const ring = [[lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d], [lng - d, lat + d], [lng - d, lat - d]]
      // On Liberty's source id, so the imagery reads it as ground, and
      // directly over the background, where Liberty's own water stands
      // under everything but its ground.
      map.addSource('openmaptiles', {
        type: 'geojson',
        data: { type: 'Feature', properties: { id: 1 }, geometry: { type: 'Polygon', coordinates: [ring] } },
      })
      map.addLayer({ id: 'water', type: 'fill', source: 'openmaptiles' }, map.getStyle().layers[1]?.id)
    })
    await page.getByRole('button', { name: 'Layers', exact: true }).click()
    await page.getByRole('checkbox', { name: 'Satellite' }).click()
    const slider = page.getByRole('slider', { name: 'Satellite opacity' })
    await slider.focus()
    await page.keyboard.press('End')
    await expect.poll(() => paint(page, 'imagery-eox', 'raster-opacity')).toBe(1)
    const answer = await page.evaluate(() => {
      const map = (window as unknown as { maps: WaterMap[] }).maps[0]
      const ids = map.getStyle().layers.map((l) => l.id)
      const point = map.project(map.getCenter())
      return {
        under: ids.indexOf('water') < ids.indexOf('imagery-eox'),
        hits: map.queryRenderedFeatures(point, { layers: ['water'] }).length,
        waterOpacity: map.getPaintProperty('water', 'fill-opacity') ?? null,
      }
    })
    expect(answer).toEqual({ under: true, hits: 1, waterOpacity: null })
  })
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('the sheet steps aside while a slider is dragged, and the relief takes the level', async ({ page }) => {
    await captureMap(page)
    await page.goto('/?view=-121.76,46.853,11&relief=1')
    await page.getByRole('button', { name: 'Layers', exact: true }).first().tap()
    await expect(page.getByRole('dialog', { name: 'Layers', exact: true })).toBeVisible()
    // Hidden included: a role query skips what is hidden, and hiding is what
    // is being read.
    const sheet = page.getByRole('dialog', { name: 'Layers', exact: true, includeHidden: true })
    const row = (name: string) => sheet.getByRole('checkbox', { name, includeHidden: true })
    const slider = sheet.getByRole('slider', { name: 'Shaded relief opacity', includeHidden: true })
    await expect.poll(() => paint(page, 'relief', 'hillshade-exaggeration')).toBe(0.3)
    const visible = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).visibility)
    await drag(page, slider, 50, 100, async () => {
      // Mid-drag: the card and every other row are gone, the dragged row stays.
      expect(await visible(sheet)).toBe('hidden')
      expect(await visible(row('Satellite'))).toBe('hidden')
      expect(await visible(slider)).toBe('visible')
      expect(await visible(row('Shaded relief'))).toBe('visible')
    })
    expect(await visible(sheet)).toBe('visible')
    expect(await visible(row('Satellite'))).toBe('visible')
    const level = Number(await slider.inputValue())
    expect(level).toBeGreaterThan(90)
    // Over the default the relief deepens: 0.3 of exaggeration at 50, 0.6 at 100.
    await expect.poll(() => paint(page, 'relief', 'hillshade-exaggeration')).toBeCloseTo(0.3 * (level / 50), 5)
  })
})
