// Every host the browser fetches is answered here, so a run spends no
// Open-Meteo quota and no third-party outage can turn it red. The six
// third-party origins are the ones BROWSER_FETCH_ORIGINS in
// backend/app/security_headers.py lists; the CSP would refuse any other.
// A request to a host no handler claims is aborted and counted as a leak,
// and the fixture fails the test on any leak.
import { readFileSync } from 'node:fs'
import { test as base, expect, type Page, type Route } from '@playwright/test'

const here = new URL('.', import.meta.url)
const style = JSON.parse(readFileSync(new URL('fixtures/style.json', here), 'utf8'))

// The forecast bodies reuse the inputs of the shared aggregation vectors, so the
// rows and the chart carry the shapes the aggregation is pinned against rather
// than numbers invented for this suite.
interface Vector { name: string; payload: { hourly: Record<string, unknown[]> } }
const vectors = JSON.parse(
  readFileSync(new URL('../../backend/tests/data/weather_vectors.json', here), 'utf8'),
) as { weather: Vector[]; aqi: Vector[] }
const vector = (list: Vector[], name: string) => {
  const found = list.find((v) => v.name === name)
  if (!found) throw new Error(`weather_vectors.json has no case named ${name}`)
  return found.payload.hourly
}
const WEATHER_INPUTS: Record<string, unknown[]> = {
  ...vector(vectors.weather, 'wind_and_temperature_levels_together'),
  ...vector(vectors.weather, 'freezing_level_in_feet_is_not_converted'),
  // The one variable only the browser asks for, so no vector carries it.
  wind_direction_10m: [0, 90, 180, 270],
}
const AQI_INPUTS = vector(vectors.aqi, 'simple_aggregation')

function hourStamps(start: string, end: string): string[] {
  const out: string[] = []
  const last = Date.parse(`${end}:00Z`)
  for (let t = Date.parse(`${start}:00Z`); t <= last; t += 3_600_000) {
    out.push(new Date(t).toISOString().slice(0, 16))
  }
  return out
}

// One body per requested location, each rotated by its index so the rows
// differ and the ranking has something to order.
function hourlyBodies(url: URL, inputs: Record<string, unknown[]>, units: Record<string, string>) {
  const locations = (url.searchParams.get('latitude') ?? '').split(',').filter(Boolean)
  const variables = (url.searchParams.get('hourly') ?? '').split(',').filter(Boolean)
  const time = hourStamps(url.searchParams.get('start_hour')!, url.searchParams.get('end_hour')!)
  return locations.map((latitude, i) => {
    const hourly: Record<string, unknown[]> = { time }
    for (const name of variables) {
      const values = inputs[name]
      hourly[name] = time.map((_, h) => (values ? values[(h + i) % values.length] : null))
    }
    return {
      latitude: Number(latitude),
      longitude: Number((url.searchParams.get('longitude') ?? '').split(',')[i]),
      elevation: 1200,
      utc_offset_seconds: 0,
      hourly_units: { time: 'iso8601', ...units },
      hourly,
    }
  })
}

function destinationsBody(route: Route) {
  const req = route.request().postDataJSON() as { polygon?: { coordinates: number[][][] } }
  const ring = req.polygon?.coordinates?.[0] ?? [[-121.9, 47.5]]
  const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length
  const cy = ring.reduce((a, p) => a + p[1], 0) / ring.length
  const destinations = DESTINATION_NAMES.map((name, i) => ({
    name,
    type: 'peak',
    latitude: Number((cy + (i - 2) * 0.004).toFixed(5)),
    longitude: Number((cx + (((i * 2) % 5) - 2) * 0.004).toFixed(5)),
    elevation_ft: 4000 + i * 350,
    osm_id: `node/${1000 + i}`,
  }))
  return { destinations, total: destinations.length, total_found: null, truncated: false }
}

export const DESTINATION_NAMES = ['Mount Alpha', 'Beta Peak', 'Gamma Butte', 'Delta Point', 'Epsilon Ridge']

const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
const emptyCollection = () => json({ type: 'FeatureCollection', features: [], fetched_at: new Date().toISOString() })

// A 1x1 transparent PNG, for any raster tile an overlay asks for.
const BLANK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)
const blankTile = (route: Route) => route.fulfill({ status: 200, contentType: 'image/png', body: BLANK_PNG })

export interface Traffic {
  /** Third-party requests a handler answered, by host. */
  answered: Record<string, number>
  /** Requests no handler claimed. Each one would have left the machine. */
  leaks: string[]
}

async function installRoutes(page: Page, appHost: string): Promise<Traffic> {
  const traffic: Traffic = { answered: {}, leaks: [] }
  const answer = (handler: (route: Route) => Promise<void>) => (route: Route) => {
    const host = new URL(route.request().url()).hostname
    traffic.answered[host] = (traffic.answered[host] ?? 0) + 1
    return handler(route)
  }
  // Registered first, so it matches last: Playwright tries the newest route
  // first. The app's own host goes through to the image under test.
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.host === appHost || url.protocol === 'data:' || url.protocol === 'blob:') return route.continue()
    traffic.leaks.push(url.hostname)
    return route.abort()
  })
  await page.route('https://tiles.openfreemap.org/**', answer(blankTile))
  await page.route('https://tiles.openfreemap.org/styles/**', answer((r) => r.fulfill(json(style))))
  await page.route('https://mesonet.agron.iastate.edu/**', answer(blankTile))
  await page.route('https://mapservices.weather.noaa.gov/**', answer(blankTile))
  const weather = answer((r) =>
    r.fulfill(json(hourlyBodies(new URL(r.request().url()), WEATHER_INPUTS, { freezing_level_height: 'ft' }))),
  )
  await page.route('https://api.open-meteo.com/**', weather)
  await page.route('https://archive-api.open-meteo.com/**', weather)
  await page.route(
    'https://air-quality-api.open-meteo.com/**',
    answer((r) => r.fulfill(json(hourlyBodies(new URL(r.request().url()), AQI_INPUTS, {})))),
  )
  // The pod answers these three by calling Overpass, NIFC and NOAA itself, so
  // they are stubbed too. /api/capabilities and /api/config reach no upstream
  // and are left to the image, so the limits the page reads are the real ones.
  await page.route('**/api/destinations', (r) => r.fulfill(json(destinationsBody(r))))
  await page.route('**/api/wildfires**', (r) => r.fulfill(emptyCollection()))
  await page.route('**/api/smoke**', (r) => r.fulfill(emptyCollection()))
  return traffic
}

export const test = base.extend<{ traffic: Traffic }>({
  traffic: [
    async ({ page, baseURL }, use, testInfo) => {
      await page.addInitScript(() => localStorage.setItem('bluebird_forecast_welcomed', '1'))
      const traffic = await installRoutes(page, new URL(baseURL!).host)
      await use(traffic)
      testInfo.annotations.push({ type: 'third-party requests answered', description: JSON.stringify(traffic.answered) })
      expect(traffic.leaks, 'requests that would have reached a third-party host').toEqual([])
    },
    { auto: true },
  ],
})
export { expect }

// A click on the map counts only once MapLibre has fired `load` and the draw
// handler is attached, and nothing in the page says when that is. So click,
// wait for the panel's own readout to move, and click again while it has not.
// Every vertex goes through here so the retry lives in one place.
export async function drawRing(page: Page) {
  await page.getByRole('button', { name: 'Draw polygon' }).click()
  const vertices: [number, number][] = [
    [520, 260],
    [760, 300],
    [620, 480],
  ]
  for (const [index, [x, y]] of vertices.entries()) {
    const remaining = vertices.length - index - 1
    const moved =
      remaining === 0
        ? page.getByRole('button', { name: 'Done' })
        : page.getByText(`Add at least ${remaining} more point${remaining === 1 ? '' : 's'}`)
    const hasMoved = () => (remaining === 0 ? moved.isEnabled() : moved.isVisible())
    await expect(async () => {
      // A slow readout must not earn the ring a second vertex at this spot.
      if (!(await hasMoved())) await page.locator('.maplibregl-canvas').click({ position: { x, y } })
      if (remaining === 0) await expect(moved).toBeEnabled({ timeout: 1_500 })
      else await expect(moved).toBeVisible({ timeout: 1_500 })
    }).toPass({ timeout: 20_000 })
  }
  await page.getByRole('button', { name: 'Done' }).click()
}
