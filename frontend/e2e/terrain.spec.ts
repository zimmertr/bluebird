import type { Page } from '@playwright/test'
import { test, expect, type Traffic } from './fixtures'

// The ground (#799): the shaded relief, the contours, the slope angle and the
// 3D terrain ask the elevation host for nothing until one of them is on, and
// the contour code is a chunk the cold load never asks for. The 3D button is the switch
// the link carries as `terrain`, and it tilts the map, which wakes the compass.

const DEM_HOST = 'tiles.mapterhorn.com'
const demRequests = (traffic: Traffic) => traffic.answered[DEM_HOST] ?? 0

// A name the contour library defines and the app's own code never spells,
// so a script carrying it is the library's chunk.
const CONTOUR_LIBRARY = 'contourProtocolV4'

test('the cold load asks the elevation host for nothing, and the relief asks it once switched on', async ({ page, traffic }) => {
  const scripts: string[] = []
  page.on('response', async (r) => {
    if (r.request().resourceType() === 'script' && (await r.text()).includes(CONTOUR_LIBRARY)) scripts.push(r.url())
  })
  // The trailhead and crag markers ask for the view the moment the map has
  // mounted its features, which is when the ground's switches are first read.
  const mounted = page.waitForRequest('**/api/landmarks**')
  await page.goto('/?view=-121.76,46.853,11')
  await mounted
  expect(demRequests(traffic)).toBe(0)
  expect(scripts).toEqual([])

  await page.getByRole('button', { name: 'Layers' }).click()
  await page.getByRole('checkbox', { name: 'Shaded relief' }).click()
  await expect.poll(() => demRequests(traffic)).toBeGreaterThan(0)
  await expect(page).toHaveURL(/[?&]relief=1/)
  // The contour library came in as a chunk of its own, once the relief asked.
  await expect.poll(() => scripts.length).toBe(1)
})

// A link carrying `topo` opens with the Topographic row ticked, and the
// contours, the only ground layer it switches on, ask the elevation host for
// the tiles they trace.
test('a link carrying topo opens with the Topographic row ticked and asks for the contours\' elevation', async ({
  page,
  traffic,
}) => {
  await page.goto('/?view=-121.76,46.853,11&topo=1')
  await expect.poll(() => demRequests(traffic)).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Layers' }).click()
  await expect(page.getByRole('checkbox', { name: 'Topographic' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Shaded relief' })).not.toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Slope angle' })).not.toBeChecked()
})

// The slope tiles are painted on the main thread and handed to MapLibre as an
// ImageBitmap made from an ImageData (`map/slope.ts`); nothing else on the
// page makes one from an ImageData, since MapLibre decodes its own tiles from
// their bytes. So a count of those calls is a count of slope tiles painted.
async function countSlopeBitmaps(page: Page) {
  await page.addInitScript(() => {
    const counted = window as unknown as { slopeBitmaps: number }
    counted.slopeBitmaps = 0
    const make = window.createImageBitmap.bind(window) as (...args: unknown[]) => Promise<ImageBitmap>
    window.createImageBitmap = ((...args: unknown[]) => {
      if (args[0] instanceof ImageData) counted.slopeBitmaps += 1
      return make(...args)
    }) as typeof window.createImageBitmap
  })
  return () => page.evaluate(() => (window as unknown as { slopeBitmaps: number }).slopeBitmaps)
}

// A link carrying `slope` opens with the Slope angle row ticked and paints
// slope tiles from the elevation fixture's cone.
test('a link carrying slope opens with the Slope angle row ticked and paints its tiles', async ({ page, traffic }) => {
  const painted = await countSlopeBitmaps(page)
  await page.goto('/?view=-121.76,46.853,11&slope=1')
  await expect.poll(() => demRequests(traffic)).toBeGreaterThan(0)
  await expect.poll(painted).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Layers' }).click()
  await expect(page.getByRole('checkbox', { name: 'Slope angle' })).toBeChecked()
})

// The relief reads the same tiles and paints nothing on the main thread, so
// the count above is the slope's alone.
test('the relief paints no slope tile', async ({ page, traffic }) => {
  const painted = await countSlopeBitmaps(page)
  await page.goto('/?view=-121.76,46.853,11&relief=1')
  await expect.poll(() => demRequests(traffic)).toBeGreaterThan(0)
  await page.waitForTimeout(2_000)
  expect(await painted()).toBe(0)
})

// The slope angle (#799) is painted from the same tiles, so it asks the
// elevation host too, and only once its row is on.
test('the slope angle asks the elevation host once switched on, and the link carries it', async ({ page, traffic }) => {
  const mounted = page.waitForRequest('**/api/landmarks**')
  await page.goto('/?view=-121.76,46.853,11')
  await mounted
  expect(demRequests(traffic)).toBe(0)

  await page.getByRole('button', { name: 'Layers' }).click()
  const row = page.getByRole('checkbox', { name: 'Slope angle' })
  await row.click()
  await expect.poll(() => demRequests(traffic)).toBeGreaterThan(0)
  await expect(page).toHaveURL(/[?&]slope=1/)
  await row.click()
  await expect(page).not.toHaveURL(/[?&]slope=1/)
})

/**
 * The zoom of every elevation tile the page asks for, by its URL, as the
 * requests go out, and whether every ask has been answered or has failed.
 * A view that moves while a tile is in flight abandons it, and the page
 * learns nothing from an abandoned ask, so a spec moves the view only once
 * the asks have settled.
 */
function demZooms(page: Page) {
  const urls: string[] = []
  let done = 0
  const isDem = (url: string) => new URL(url).hostname === DEM_HOST
  page.on('request', (r) => {
    if (isDem(r.url())) urls.push(r.url())
  })
  page.on('requestfinished', (r) => {
    if (isDem(r.url())) done++
  })
  page.on('requestfailed', (r) => {
    if (isDem(r.url())) done++
  })
  return {
    urls,
    settled: () => done === urls.length,
    zooms: () => urls.map((u) => Number(new URL(u).pathname.split('/')[1])),
  }
}

// Past zoom 12 the slope tile asks for the elevation at its own zoom, which the
// fixture answers 404 as Mapterhorn does outside a survey, and paints from the
// zoom-12 tile under it. Each missing tile is asked for once.
test('the slope angle past zoom 12 falls back to the zoom-12 elevation, asking each missing tile once', async ({
  page,
}) => {
  const painted = await countSlopeBitmaps(page)
  const dem = demZooms(page)
  await page.goto('/?view=-121.76,46.853,14&slope=1')
  await expect.poll(painted).toBeGreaterThan(0)
  expect(dem.zooms()).toContain(14)
  expect(dem.zooms()).toContain(12)
  // A pan away and back over the same ground asks no missing tile again.
  // Each leg is one jump, made once the slope tiles are quiet, because a view
  // that moves while a tile is loading abandons it, and an abandoned 404
  // teaches the page nothing: it would be asked again, as the real map asks
  // it. Quiet is more than no ask in flight: a tile falling back asks one
  // zoom at a time, so between its 404 and its next ask nothing is in flight.
  const canvas = page.locator('.maplibregl-canvas')
  const box = (await canvas.boundingBox())!
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const quiet = async () => {
    let last = ''
    await expect
      .poll(async () => {
        const now = `${dem.urls.length}/${await painted()}/${dem.settled()}`
        const same = now === last && dem.settled()
        last = now
        return same
      }, { intervals: [400] })
      .toBe(true)
  }
  const jump = async (dx: number) => {
    await quiet()
    await page.mouse.move(centre.x, centre.y)
    await page.mouse.down()
    await page.mouse.move(centre.x + dx, centre.y, { steps: 1 })
    await page.mouse.up()
    await quiet()
  }
  await jump(-300)
  await jump(300)
  const finer = dem.urls.filter((u) => Number(new URL(u).pathname.split('/')[1]) > 12)
  expect(finer.length).toBeGreaterThan(0)
  expect(new Set(finer).size).toBe(finer.length)
})

// The relief and the 3D terrain read raster-dem sources, which cannot fall
// back on a missing tile, so they stop at zoom 12 however far in the map is.
test('the relief and the 3D terrain ask for nothing past zoom 12', async ({ page, traffic }) => {
  const dem = demZooms(page)
  await page.goto('/?view=-121.76,46.853,14&relief=1&terrain=1')
  await expect.poll(() => demRequests(traffic)).toBeGreaterThan(0)
  await page.waitForTimeout(2_000)
  expect(Math.max(...dem.zooms())).toBe(12)
})

test('the 3D button stands the map up and lays it flat, and the link carries it', async ({ page, traffic }) => {
  await page.goto('/?view=-121.76,46.853,11')
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()
  const button = page.getByRole('button', { name: '3D terrain' })
  const compass = page.locator('.maplibregl-ctrl-compass')
  // The word on the button, and no tooltip (record 0064).
  await expect(button).toHaveText('3D')
  expect(await button.getAttribute('title')).toBeNull()
  await expect(button).toHaveAttribute('aria-pressed', 'false')
  // North up and flat, so the compass idles.
  await expect(compass).toBeDisabled()

  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await expect(page).toHaveURL(/[?&]terrain=1/)
  await expect.poll(() => demRequests(traffic)).toBeGreaterThan(0)
  // The press tilted the map, which wakes the compass.
  await expect(compass).toBeEnabled()

  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'false')
  await expect(page).not.toHaveURL(/[?&]terrain=1/)
  // Flat again, facing north, so the compass idles again.
  await expect(compass).toBeDisabled()
})

// A link that carries `terrain=1` opens in 3D, tilted, with the button lit.
test('a link carrying terrain opens tilted, with the button pressed', async ({ page }) => {
  await page.goto('/?view=-121.76,46.853,11&terrain=1')
  await expect(page.getByRole('button', { name: '3D terrain' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.maplibregl-ctrl-compass')).toBeEnabled()
})

// On a phone the 3D button stands in the search row, left of the locate
// button, the same round button 8px from it, and the pill ends 8px short of
// it. The chip row keeps its own end for the map (`legendClickThrough`). The
// pill still holds its placeholder whole at the narrowest phone.
for (const width of [360, 390]) {
  test(`a phone stands the 3D button beside the locate button at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/?view=-121.76,46.853,11')
    await expect(page.locator('.maplibregl-canvas')).toBeVisible()
    const at = await page.evaluate(() => {
      const box = (el: Element) => el.getBoundingClientRect()
      const input = document.querySelector('input[placeholder="Search for a destination"]') as HTMLInputElement
      const pill = input.closest('.rounded-full') as HTMLElement
      const cs = getComputedStyle(input)
      const ctx = document.createElement('canvas').getContext('2d')!
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      return {
        terrain: box(document.querySelector('button[aria-label="3D terrain"]')!).toJSON(),
        locate: box(document.querySelector('.maplibregl-ctrl-geolocate')!).toJSON(),
        pill: box(pill).toJSON(),
        field: input.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
        words: ctx.measureText(input.placeholder).width,
        chipRow: box(document.querySelector('button[aria-label="Open controls"]')!.parentElement!).toJSON(),
      }
    })
    test.info().annotations.push({ type: `search row ${width} px`, description: JSON.stringify(at) })
    expect(at.terrain.width).toBe(40)
    expect(at.terrain.height).toBe(at.locate.height)
    expect(at.terrain.top).toBe(at.locate.top)
    expect(Math.round(at.locate.left - at.terrain.right)).toBe(8)
    expect(Math.round(at.terrain.left - at.pill.right)).toBe(8)
    // Not in the chip row.
    expect(at.terrain.bottom).toBeLessThanOrEqual(at.chipRow.top)
    expect(at.words).toBeLessThanOrEqual(at.field)
  })
}
