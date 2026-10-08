import { test, expect, redrawRing, DESTINATION_NAMES, resultRows } from './fixtures'
import type { Page, Route } from '@playwright/test'

// #560: a run that does not finish changes nothing. Ring A is analyzed, the
// reader draws ring B away from it and cancels B's analysis, and the next
// Analyze must search ring B rather than refresh ring A's field under B's name.

function isoDay(offset: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offset)
  return d.toISOString().slice(0, 10)
}

// Ring A is a right triangle with its right angle at the south-east corner.
// The link opens the camera on its middle at a zoom where it fills part of
// the map, so ring B can be drawn north-west of its long edge, outside it.
const RING_A = '-121.9,47.4;-121.7,47.4;-121.7,47.55'
const VIEW = { lng: -121.767, lat: 47.45, zoom: 9 }
// Ring B's corners as degrees from the camera's centre, each one north-west of
// ring A's long edge.
const RING_B_OFFSETS: [number, number][] = [
  [-0.13, 0.05],
  [-0.07, 0.05],
  [-0.1, 0.09],
]

// Ring B in canvas pixels. MapLibre's world is 512 px wide at zoom 0, and the
// Mercator stretch at this latitude is close enough to 1 / cos(latitude) over
// a tenth of a degree.
async function ringBPixels(page: Page): Promise<[number, number][]> {
  const box = await page.locator('.maplibregl-canvas').boundingBox()
  if (!box) throw new Error('the map canvas has no box')
  const perLon = (512 * 2 ** VIEW.zoom) / 360
  const perLat = perLon / Math.cos((VIEW.lat * Math.PI) / 180)
  return RING_B_OFFSETS.map(([dLon, dLat]) => [
    Math.round(box.width / 2 + dLon * perLon),
    Math.round(box.height / 2 - dLat * perLat),
  ])
}
const LINK_VIEW = `view=${VIEW.lng},${VIEW.lat},${VIEW.zoom}`

// Ring B's peaks, named so a row says which ring it came from.
const ringBNames = (n: number) => Array.from({ length: n }, (_, i) => `Ring B peak ${i + 1}`)

interface DestinationsBody {
  polygon?: { coordinates: number[][][] }
}

/**
 * Answers every discovery after the first (ring A's, which the fixture
 * answers) with ring B's peaks, and holds the first of them open when asked,
 * so the run is mid-flight for as long as the test needs.
 */
async function ringBDiscovery(page: Page, count: number, holdFirst: boolean) {
  let discoveries = 0
  const held: Route[] = []
  await page.route('**/api/destinations', (route) => {
    const body = route.request().postDataJSON() as DestinationsBody
    // A request with no polygon is a refresh resolving the held field: the
    // fixture echoes ring A's peaks for it, which is what a refresh shows.
    if (!body.polygon) return route.fallback()
    discoveries += 1
    if (discoveries === 1) return route.fallback()
    if (holdFirst && discoveries === 2) {
      held.push(route)
      return
    }
    const ring = body.polygon.coordinates[0]
    const [lon, lat] = ring[0]
    const destinations = ringBNames(count).map((name, i) => ({
      name,
      type: 'peak',
      latitude: Number((lat + 0.0005 * (i + 1)).toFixed(5)),
      longitude: Number((lon + 0.0005 * ((i % 7) + 1)).toFixed(5)),
      elevation_ft: 4000 + i,
      osm_id: `node/${5000 + i}`,
    }))
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ destinations, total: destinations.length, total_found: null, truncated: false }),
    })
  })
  return { release: () => held.splice(0).forEach((r) => r.abort().catch(() => {})) }
}

const rowNames = (page: Page) =>
  resultRows(page).evaluateAll((rows) => rows.map((r) => r.textContent ?? ''))
const onlyRing = (names: string[], expected: string[]) =>
  names.length === expected.length && names.every((text) => expected.some((name) => text.includes(name)))

test('a cancelled search of a new ring leaves the last report, and the next Analyze searches the new ring', async ({ page }) => {
  const d1 = isoDay(1)
  const discovery = await ringBDiscovery(page, 3, true)
  await page.goto(`/?mode=days&d1=${d1}&d2=${d1}&type=peak&poly=${RING_A}&${LINK_VIEW}&analyze=1`)
  await expect(resultRows(page)).toHaveCount(DESTINATION_NAMES.length)

  await redrawRing(page, await ringBPixels(page))
  // A card over ring A's report, which a run that showed nothing new leaves open.
  const popup = page.locator('.maplibregl-popup')
  await page.getByRole('button', { name: /^Center map on / }).first().click()
  await expect(popup).toHaveCount(1)
  await page.getByRole('button', { name: 'Analyze' }).click()
  await page.getByRole('button', { name: 'Cancel' }).click()
  discovery.release()

  // Ring A's report, and the panel still saying the search area moved.
  await expect.poll(async () => onlyRing(await rowNames(page), DESTINATION_NAMES)).toBe(true)
  await expect(page.getByText('A new search area requires a new analysis.')).toBeVisible()
  await expect(popup).toHaveCount(1)

  await page.getByRole('button', { name: 'Analyze' }).click()
  await expect.poll(async () => onlyRing(await rowNames(page), ringBNames(3))).toBe(true)
  await expect(page.getByText('A new search area requires a new analysis.')).toHaveCount(0)
})

test('a cancel after partial rows puts the last report back, and the next Analyze ranks the whole new field', async ({ page }) => {
  // Partial rows come one batch of forecasts at a time, and only under a
  // ranking that is not air quality. Sixty peaks are two batches: the first is
  // answered and shown, the second is held until the Cancel.
  const d1 = isoDay(1)
  await ringBDiscovery(page, 60, false)
  let holdWeather = false
  const heldWeather: Route[] = []
  await page.route('https://api.open-meteo.com/**', (route) => {
    const locations = (new URL(route.request().url()).searchParams.get('latitude') ?? '').split(',').length
    if (holdWeather && locations < 50) {
      heldWeather.push(route)
      return
    }
    return route.fallback()
  })
  await page.goto(`/?mode=days&d1=${d1}&d2=${d1}&type=peak&sort=precip_total_in&poly=${RING_A}&${LINK_VIEW}&analyze=1`)
  await expect(resultRows(page)).toHaveCount(DESTINATION_NAMES.length)

  await redrawRing(page, await ringBPixels(page))
  holdWeather = true
  await page.getByRole('button', { name: 'Analyze' }).click()
  await expect(page.getByText(/so far/)).toBeVisible()
  await expect(resultRows(page)).toHaveCount(50)
  // A card over a partial row, which names a row the report put back does not hold.
  const popup = page.locator('.maplibregl-popup')
  await page.getByRole('button', { name: /^Center map on / }).first().click()
  await expect(popup).toHaveCount(1)
  await page.getByRole('button', { name: 'Cancel' }).click()
  holdWeather = false
  heldWeather.splice(0).forEach((r) => r.abort().catch(() => {}))

  await expect.poll(async () => onlyRing(await rowNames(page), DESTINATION_NAMES)).toBe(true)
  await expect(page.getByText(/so far/)).toHaveCount(0)
  await expect(page.getByText('A new search area requires a new analysis.')).toBeVisible()
  await expect(popup).toHaveCount(0)

  await page.getByRole('button', { name: 'Analyze' }).click()
  await expect.poll(async () => onlyRing(await rowNames(page), ringBNames(60))).toBe(true)
})
