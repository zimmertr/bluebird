import { test, expect, type Traffic } from './fixtures'

// The ground (#799): the shaded relief, the contours and the 3D terrain ask
// the elevation host for nothing until one of them is on, and the contour
// code is a chunk the cold load never asks for. The 3D button is the switch
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
